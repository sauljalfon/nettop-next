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
