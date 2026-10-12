import { describe, expect, it, vi } from 'vitest'
import { createPatchingSession } from './patchingSession'

describe('PT-05 the patching session', () => {
  it('opens and closes one request and tells its listeners', () => {
    const session = createPatchingSession()
    const heard = vi.fn()
    session.subscribe(heard)
    expect(session.request()).toBeUndefined()
    session.open({ nearEndpointId: 'EDGE-17:p5', mode: 'range', count: 6 })
    expect(session.request()).toEqual({
      nearEndpointId: 'EDGE-17:p5',
      mode: 'range',
      count: 6,
    })
    session.close()
    expect(session.request()).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('keeps the four latest far targets, newest first, without repeats', () => {
    const session = createPatchingSession()
    for (const id of ['A', 'B', 'C', 'D', 'E'])
      session.remember({ equipmentId: id, side: 'front' })
    session.remember({ equipmentId: 'C', side: 'front' })
    expect(session.recent().map((t) => t.equipmentId)).toEqual([
      'C',
      'E',
      'D',
      'B',
    ])
    // Another side of the same equipment is another target.
    session.remember({ equipmentId: 'C', side: 'rear' })
    expect(session.recent().slice(0, 2)).toEqual([
      { equipmentId: 'C', side: 'rear' },
      { equipmentId: 'C', side: 'front' },
    ])
  })

  it('remembers the side last used for each equipment', () => {
    const session = createPatchingSession()
    session.remember({ equipmentId: 'HDF-01', side: 'rear' })
    session.remember({ equipmentId: 'AGG-03' })
    expect(session.sides().get('HDF-01')).toBe('rear')
    expect(session.sides().has('AGG-03')).toBe(false)
  })
})
