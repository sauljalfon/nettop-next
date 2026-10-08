import { describe, expect, it } from 'vitest'
import { dropInto, parseDrop } from './drops'

describe('PHY-06 what a drop carries', () => {
  it('reads an existing equipment', () => {
    expect(parseDrop('equipment:agg-15')).toEqual({
      type: 'move',
      equipmentId: 'agg-15',
    })
  })

  it('reads a library item, with an aggregation role when it has one', () => {
    expect(parseDrop('new:switch:::')).toEqual({
      type: 'create',
      kind: 'switch',
    })
    expect(parseDrop('new:switch:::aggregation')).toEqual({
      type: 'create',
      kind: 'switch',
      role: 'aggregation',
    })
    expect(parseDrop('new:panel:::')).toEqual({ type: 'create', kind: 'panel' })
  })

  it('ignores anything else', () => {
    expect(parseDrop('')).toBeUndefined()
    expect(parseDrop('text/plain')).toBeUndefined()
    expect(parseDrop('new:router:::')).toBeUndefined()
    expect(parseDrop('equipment:')).toBeUndefined()
  })
})

describe('PHY-06 a drop calls the same handlers with the rack and the unit', () => {
  const calls: unknown[] = []
  const handlers = {
    onMoveEquipment: (...a: unknown[]) => void calls.push(['move', ...a]),
    onCreateEquipment: (...a: unknown[]) => void calls.push(['create', ...a]),
  }

  it('moves existing equipment to the rack and unit', () => {
    calls.length = 0
    expect(dropInto('equipment:agg-15', 'rack-core-03', 4, handlers)).toBe(true)
    expect(calls).toEqual([['move', 'agg-15', 'rack-core-03', 4]])
  })

  it('creates a library item in the rack; without a unit the first free one is used by the handler', () => {
    calls.length = 0
    expect(
      dropInto('new:switch:::aggregation', 'rack-core-03', undefined, handlers),
    ).toBe(true)
    expect(calls).toEqual([
      ['create', 'switch', 'rack-core-03', undefined, 'aggregation'],
    ])
  })

  it('does nothing for a payload it does not know', () => {
    calls.length = 0
    expect(dropInto('nope', 'r', 1, handlers)).toBe(false)
    expect(calls).toEqual([])
  })
})
