import { describe, expect, it } from 'vitest'
import { dragPayload, dropInto, parseDrop } from './drops'

describe('PHY-06 what a drop carries', () => {
  it('reads an existing equipment', () => {
    expect(parseDrop('equipment:agg-15')).toEqual({
      type: 'move',
      equipmentId: 'agg-15',
    })
  })

  it('D51 reads a library item: a model, a panel, an HDF or a rack item', () => {
    expect(parseDrop('new:model:model-ab12')).toEqual({
      type: 'create',
      item: { type: 'model', modelId: 'model-ab12' },
    })
    expect(parseDrop('new:panel')).toEqual({
      type: 'create',
      item: { type: 'panel' },
    })
    expect(parseDrop('new:hdf')).toEqual({
      type: 'create',
      item: { type: 'hdf' },
    })
    expect(parseDrop('new:rack_item:cable-manager')).toEqual({
      type: 'create',
      item: { type: 'rack_item', itemType: 'cable-manager' },
    })
  })

  it('writes the payloads it reads', () => {
    for (const payload of [
      'new:model:model-ab12',
      'new:panel',
      'new:hdf',
      'new:rack_item:ups',
    ]) {
      const drop = parseDrop(payload)
      expect(drop?.type === 'create' && dragPayload(drop.item)).toBe(payload)
    }
  })

  it('ignores anything else, the old switch payloads included', () => {
    expect(parseDrop('')).toBeUndefined()
    expect(parseDrop('text/plain')).toBeUndefined()
    expect(parseDrop('new:router:::')).toBeUndefined()
    expect(parseDrop('new:switch:::')).toBeUndefined()
    expect(parseDrop('new:switch:::aggregation')).toBeUndefined()
    expect(parseDrop('new:model:')).toBeUndefined()
    expect(parseDrop('new:rack_item:toaster')).toBeUndefined()
    expect(parseDrop('new:rack_item')).toBeUndefined()
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

  it('creates a library item in the rack; without a unit the box picks the first free one', () => {
    calls.length = 0
    expect(
      dropInto('new:model:model-1', 'rack-core-03', undefined, handlers),
    ).toBe(true)
    expect(calls).toEqual([
      [
        'create',
        { type: 'model', modelId: 'model-1' },
        'rack-core-03',
        undefined,
      ],
    ])
  })

  it('does nothing for a payload it does not know', () => {
    calls.length = 0
    expect(dropInto('nope', 'r', 1, handlers)).toBe(false)
    expect(calls).toEqual([])
  })
})
