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
