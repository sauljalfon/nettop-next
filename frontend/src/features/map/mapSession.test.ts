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

describe('C13 focus and expanded bundles live in the session', () => {
  const building = { kind: 'node', id: 'node-a' } as const

  it('sets and clears the focus', () => {
    const session = createMapSession()
    expect(session.focus()).toBeUndefined()
    session.setFocus(building)
    expect(session.focus()).toEqual(building)
    session.setFocus(undefined)
    expect(session.focus()).toBeUndefined()
  })

  it('replaces the focus object so subscribers can compare references', () => {
    const session = createMapSession()
    session.setFocus(building)
    const before = session.focus()
    session.setFocus({ ...building })
    expect(session.focus()).not.toBe(before)
  })

  it('toggles bundle expansion and replaces the set on change', () => {
    const session = createMapSession()
    const before = session.expandedBundles()
    session.toggleBundle('b1')
    expect(session.expandedBundles().has('b1')).toBe(true)
    expect(before.has('b1')).toBe(false)
    session.toggleBundle('b1')
    expect(session.expandedBundles().size).toBe(0)
  })

  it('notifies subscribers on focus and expansion changes', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    session.setFocus(building)
    session.toggleBundle('b1')
    session.setFocus(undefined)
    expect(calls).toBe(3)
  })
})

describe('POL-03 resetLayout drops positions and viewport only', () => {
  it('forgets every recorded card and boundary position', () => {
    const session = createMapSession()
    session.setPosition('EDGE-17', { x: 1, y: 2 })
    session.setPosition('boundary:node:a|node:b', { x: 3, y: 4 })
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

  it('keeps pinned facets, focus and expanded bundles', () => {
    const session = createMapSession()
    session.toggleManual('HDF-01', '1A/2')
    session.setFocus({ kind: 'node', id: 'node-a' })
    session.toggleBundle('b1')
    const manual = session.manualFacets()
    const focus = session.focus()
    const expanded = session.expandedBundles()
    session.resetLayout()
    expect(session.manualFacets()).toBe(manual)
    expect(session.focus()).toBe(focus)
    expect(session.expandedBundles()).toBe(expanded)
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

describe('POL-06/07 found state and center requests live in the session', () => {
  it('sets and clears the found card, replacing nothing else', () => {
    const session = createMapSession()
    session.toggleManual('HDF-01', '1A/2')
    const manual = session.manualFacets()
    expect(session.foundId()).toBeUndefined()
    session.setFound('EDGE-17')
    expect(session.foundId()).toBe('EDGE-17')
    session.setFound(undefined)
    expect(session.foundId()).toBeUndefined()
    expect(session.manualFacets()).toBe(manual)
  })

  it('survives a layout reset like the other session choices', () => {
    const session = createMapSession()
    session.setFound('EDGE-17')
    session.resetLayout()
    expect(session.foundId()).toBe('EDGE-17')
  })

  it('notifies subscribers when the found card changes', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    session.setFound('EDGE-17')
    session.setFound(undefined)
    expect(calls).toBe(2)
  })

  it('numbers center requests, so repeating one for the same card still counts', () => {
    const session = createMapSession()
    expect(session.centerRequest()).toBeUndefined()
    session.requestCenter('EDGE-17')
    const first = session.centerRequest()!
    expect(first.id).toBe('EDGE-17')
    session.requestCenter('EDGE-17')
    expect(session.centerRequest()!.serial).toBe(first.serial + 1)
  })

  it('a center request does not move any card or touch the viewport', () => {
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
