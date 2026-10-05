import { describe, expect, it } from 'vitest'
import { createMapSession } from './mapSession'

describe('C11/C12 session store keeps layout and viewport across remounts', () => {
  it('records and returns positions by equipment ID', () => {
    const session = createMapSession()
    expect(session.position('EDGE-17')).toBeUndefined()
    session.setPosition('EDGE-17', { x: 10, y: 20 })
    expect(session.position('EDGE-17')).toEqual({ x: 10, y: 20 })
    expect(session.positions().get('EDGE-17')).toEqual({ x: 10, y: 20 })
  })

  it('does not let callers mutate a stored position', () => {
    const session = createMapSession()
    const p = { x: 1, y: 1 }
    session.setPosition('a', p)
    p.x = 99
    expect(session.position('a')).toEqual({ x: 1, y: 1 })
  })

  it('fits once per session and then keeps the recorded viewport', () => {
    const session = createMapSession()
    expect(session.needsFit()).toBe(true)
    expect(session.viewport()).toBeUndefined()
    session.setViewport({ x: 5, y: 6, zoom: 0.5 })
    expect(session.needsFit()).toBe(false)
    expect(session.viewport()).toEqual({ x: 5, y: 6, zoom: 0.5 })
  })

  it('placeNewCards lays out only cards without a position and records them', () => {
    const session = createMapSession()
    session.setPosition('EDGE-17', { x: 7, y: 7 })
    const placed = session.placeMissing(
      ['EDGE-17', 'EDGE-22'],
      (missing) => new Map(missing.map((id) => [id, { x: 100, y: 100 }])),
    )
    expect(placed).toEqual(['EDGE-22'])
    expect(session.position('EDGE-17')).toEqual({ x: 7, y: 7 })
    expect(session.position('EDGE-22')).toEqual({ x: 100, y: 100 })
  })
})

describe('C05 manual facets live in the session, per equipment ID', () => {
  it('toggles a facet on and off', () => {
    const session = createMapSession()
    expect(session.manualFacets().size).toBe(0)
    session.toggleManual('HDF-01', '1A/2')
    expect(session.manualFacets().get('HDF-01')).toEqual(new Set(['1A/2']))
    session.toggleManual('HDF-01', '3C/5')
    expect([...session.manualFacets().get('HDF-01')!].sort()).toEqual([
      '1A/2',
      '3C/5',
    ])
    session.toggleManual('HDF-01', '1A/2')
    expect([...session.manualFacets().get('HDF-01')!]).toEqual(['3C/5'])
    session.toggleManual('HDF-01', '3C/5')
    expect(session.manualFacets().has('HDF-01')).toBe(false)
  })

  it('keeps equipment independent', () => {
    const session = createMapSession()
    session.toggleManual('HDF-01', '1A/2')
    session.toggleManual('HDF-02', '1A/2')
    session.toggleManual('HDF-01', '1A/2')
    expect(session.manualFacets().has('HDF-01')).toBe(false)
    expect(session.manualFacets().get('HDF-02')).toEqual(new Set(['1A/2']))
  })

  it('replaces the snapshot on change, so subscribers can compare references', () => {
    const session = createMapSession()
    const before = session.manualFacets()
    expect(session.manualFacets()).toBe(before)
    session.toggleManual('HDF-01', '1A/2')
    expect(session.manualFacets()).not.toBe(before)
    expect(before.size).toBe(0) // the old snapshot is never mutated
  })

  it('notifies subscribers on a toggle, until they unsubscribe', () => {
    const session = createMapSession()
    let calls = 0
    const stop = session.subscribe(() => calls++)
    session.toggleManual('HDF-01', '1A/2')
    session.toggleManual('HDF-01', '1A/2')
    expect(calls).toBe(2)
    stop()
    session.toggleManual('HDF-01', '1A/2')
    expect(calls).toBe(2)
  })
})

describe('POL-03 resetLayout drops positions and viewport only', () => {
  it('forgets every recorded card position', () => {
    const session = createMapSession()
    session.setPosition('EDGE-17', { x: 1, y: 2 })
    session.setPosition('HDF-01', { x: 3, y: 4 })
    session.resetLayout()
    expect(session.positions().size).toBe(0)
    expect(session.position('EDGE-17')).toBeUndefined()
  })

  it('forgets the viewport so the map fits once more', () => {
    const session = createMapSession()
    session.setViewport({ x: 1, y: 2, zoom: 0.4 })
    expect(session.needsFit()).toBe(false)
    session.resetLayout()
    expect(session.viewport()).toBeUndefined()
    expect(session.needsFit()).toBe(true)
  })

  it('keeps pinned facets and the highlight', () => {
    const session = createMapSession()
    session.toggleManual('HDF-01', '1A/2')
    session.setHighlight({ kind: 'node', id: 'node-a' })
    const manual = session.manualFacets()
    const highlight = session.highlight()
    session.resetLayout()
    expect(session.manualFacets()).toBe(manual)
    expect(session.highlight()).toBe(highlight)
  })

  it('counts resets and notifies subscribers, so the map can fit after one', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    const before = session.layoutVersion()
    session.resetLayout()
    expect(session.layoutVersion()).toBe(before + 1)
    expect(calls).toBe(1)
  })

  it('does not count ordinary drags as a reset', () => {
    const session = createMapSession()
    const before = session.layoutVersion()
    session.setPosition('EDGE-17', { x: 1, y: 2 })
    expect(session.layoutVersion()).toBe(before)
  })
})

describe('POL-05 center requests', () => {
  it('numbers requests, so repeating one for the same card still counts', () => {
    const session = createMapSession()
    expect(session.centerRequest()).toBeUndefined()
    session.requestCenter('EDGE-17')
    const first = session.centerRequest()!
    expect(first.id).toBe('EDGE-17')
    session.requestCenter('EDGE-17')
    expect(session.centerRequest()!.serial).toBe(first.serial + 1)
  })

  it('does not move any card or touch the viewport', () => {
    const session = createMapSession()
    session.setPosition('EDGE-17', { x: 1, y: 2 })
    session.setViewport({ x: 3, y: 4, zoom: 0.5 })
    session.requestCenter('EDGE-17')
    expect(session.position('EDGE-17')).toEqual({ x: 1, y: 2 })
    expect(session.viewport()).toEqual({ x: 3, y: 4, zoom: 0.5 })
  })
})

describe('POL-05/06 a center request is handled once, even across a remount', () => {
  it('marks a request as handled by its serial', () => {
    const session = createMapSession()
    session.requestCenter('EDGE-17')
    const { serial } = session.centerRequest()!
    expect(session.centerHandled()).toBeLessThan(serial)
    session.markCenterHandled(serial)
    expect(session.centerHandled()).toBe(serial)
  })

  it('a request made before the map mounts is still pending until it is handled', () => {
    const session = createMapSession()
    session.requestCenter('EDGE-17') // e.g. from Explore while Physical was showing
    const request = session.centerRequest()!
    expect(request.serial > session.centerHandled()).toBe(true)
  })

  it('never goes backwards', () => {
    const session = createMapSession()
    session.requestCenter('a')
    session.requestCenter('b')
    session.markCenterHandled(2)
    session.markCenterHandled(1)
    expect(session.centerHandled()).toBe(2)
  })
})

describe('POL-14 the location highlight lives in the session', () => {
  const building = { kind: 'node', id: 'node-a' } as const

  it('sets, replaces and clears the highlight', () => {
    const session = createMapSession()
    expect(session.highlight()).toBeUndefined()
    session.setHighlight(building)
    expect(session.highlight()).toEqual(building)
    session.setHighlight({ kind: 'site', id: 'site-dr' })
    expect(session.highlight()).toEqual({ kind: 'site', id: 'site-dr' })
    session.setHighlight(undefined)
    expect(session.highlight()).toBeUndefined()
  })

  it('replaces the highlight object so subscribers can compare references', () => {
    const session = createMapSession()
    session.setHighlight(building)
    const before = session.highlight()
    session.setHighlight({ ...building })
    expect(session.highlight()).not.toBe(before)
  })

  it('does not alias the object it was given', () => {
    const session = createMapSession()
    const given = { kind: 'node' as const, id: 'node-a' }
    session.setHighlight(given)
    given.id = 'changed'
    expect(session.highlight()).toEqual(building)
  })

  it('notifies subscribers, and leaves pins and the viewport alone', () => {
    const session = createMapSession()
    session.toggleManual('HDF-01', '1A/2')
    session.setViewport({ x: 1, y: 2, zoom: 0.5 })
    const manual = session.manualFacets()
    let calls = 0
    session.subscribe(() => calls++)
    session.setHighlight(building)
    session.setHighlight(undefined)
    expect(calls).toBe(2)
    expect(session.manualFacets()).toBe(manual)
    expect(session.viewport()).toEqual({ x: 1, y: 2, zoom: 0.5 })
  })
})

describe('POL-14 a fit request is handled once, like a center request', () => {
  it('numbers requests and carries the cards to fit', () => {
    const session = createMapSession()
    expect(session.fitRequest()).toBeUndefined()
    session.requestFit(['EDGE-17', 'PANEL-A'])
    expect(session.fitRequest()).toEqual({
      ids: ['EDGE-17', 'PANEL-A'],
      serial: 1,
    })
    session.requestFit(['EDGE-17', 'PANEL-A'])
    expect(session.fitRequest()!.serial).toBe(2)
  })

  it('marks a request handled, never backwards', () => {
    const session = createMapSession()
    session.requestFit(['a'])
    session.requestFit(['b'])
    expect(session.fitHandled()).toBe(0)
    session.markFitHandled(2)
    session.markFitHandled(1)
    expect(session.fitHandled()).toBe(2)
  })

  it('does not move any card or change the viewport by itself', () => {
    const session = createMapSession()
    session.setPosition('EDGE-17', { x: 1, y: 2 })
    session.setViewport({ x: 3, y: 4, zoom: 0.5 })
    session.requestFit(['EDGE-17'])
    expect(session.position('EDGE-17')).toEqual({ x: 1, y: 2 })
    expect(session.viewport()).toEqual({ x: 3, y: 4, zoom: 0.5 })
  })

  it('does not alias the list it was given', () => {
    const session = createMapSession()
    const ids = ['a']
    session.requestFit(ids)
    ids.push('b')
    expect(session.fitRequest()!.ids).toEqual(['a'])
  })
})

describe('POL-18 split pairs', () => {
  it('toggles a pair between joined and split', () => {
    const session = createMapSession()
    expect(session.splitPairs().size).toBe(0)
    session.toggleSplit('p')
    expect(session.splitPairs().has('p')).toBe(true)
    session.toggleSplit('p')
    expect(session.splitPairs().has('p')).toBe(false)
  })

  it('replaces the set on change and notifies subscribers', () => {
    const session = createMapSession()
    const before = session.splitPairs()
    let calls = 0
    session.subscribe(() => calls++)
    session.toggleSplit('p')
    expect(session.splitPairs()).not.toBe(before)
    expect(before.size).toBe(0)
    expect(calls).toBe(1)
  })

  it('survives a layout reset', () => {
    const session = createMapSession()
    session.toggleSplit('p')
    session.resetLayout()
    expect(session.splitPairs().has('p')).toBe(true)
  })
})
