import { describe, expect, it } from 'vitest'
import type { Equipment, Rack, SwitchModel } from '../../shared/types'
import {
  boxFit,
  buildBox,
  firstFit,
  startHeight,
  occupiedUnits,
  startName,
  whereText,
  type BoxValues,
} from './boxModel'

const eq = (
  id: string,
  name: string,
  unit: number,
  over: Partial<Equipment> = {},
): Equipment => ({
  id,
  name,
  kind: 'switch',
  role: 'access',
  rackId: 'r1',
  unit,
  height: 1,
  ...over,
})
const racks: Rack[] = [
  { id: 'r1', nodeId: 'n1', name: 'Rack A03', units: 24 },
  { id: 'r2', nodeId: 'n1', name: 'Rack A04', units: 24 },
  { id: 'r3', nodeId: 'n2', name: 'Rack B01', units: 24 },
]
const model: SwitchModel = {
  id: 'model-1',
  name: 'C9300-48P',
  manufacturer: 'Cisco',
  height: 1,
  portGroups: [
    { count: 48, names: 'Gi1/0/{n}', start: 1 },
    { count: 4, names: 'Te1/1/{n}', start: 1 },
  ],
}
const values: BoxValues = {
  name: 'EDGE-33',
  count: '1',
  role: 'access',
  networkId: 'net-a',
  positions: '24',
  rows: '12',
  height: '4',
  itemText: '',
}
const rack = { id: 'r1', units: 24 }

describe('where the box puts things', () => {
  it('occupiedUnits counts every unit of a tall equipment, in its rack only', () => {
    const list = [
      eq('a', 'A', 3, { height: 2 }),
      eq('b', 'B', 9, { rackId: 'r2' }),
    ]
    expect([...occupiedUnits(list, 'r1')].sort()).toEqual([3, 4])
  })

  it('firstFit is the top of the lowest free run, undefined when none', () => {
    expect(firstFit(new Set([1, 2]), 6, 2)).toBe(4)
    expect(firstFit(new Set(), 6, 1)).toBe(1)
    expect(firstFit(new Set([2, 4, 6]), 6, 2)).toBeUndefined()
  })

  it('boxFit refuses in words when the stack does not fit', () => {
    const fit = boxFit(new Set([8]), rack, 10, 1, 4)
    expect(fit).toEqual({
      error:
        'Not enough free units below U10 for 4 × 1U. Choose fewer or a higher unit.',
    })
    expect(boxFit(new Set([8]), rack, 10, 1, 2)).toEqual({ lowest: [10, 9] })
  })

  it('an HDF or a rack item has no How many: the refusal talks of its height only', () => {
    expect(boxFit(new Set([3]), rack, 5, 4, 1, false)).toEqual({
      error:
        'Not enough free units below U5 for 4U. Choose a lower height or a higher unit.',
    })
    expect(boxFit(new Set([9]), rack, 10, 2, 1)).toEqual({
      error: 'Not enough free units below U10 for 2U. Choose a higher unit.',
    })
  })

  it('startHeight keeps the wanted height when it fits, else the largest that does, 1 at least', () => {
    expect(startHeight(new Set([3]), rack, 5, 4)).toBe(2)
    expect(startHeight(new Set(), rack, 5, 4)).toBe(4)
    expect(startHeight(new Set([4]), rack, 5, 4)).toBe(1)
    expect(startHeight(new Set([5]), rack, 5, 4)).toBe(1)
  })

  it('whereText names the units', () => {
    expect(whereText([10], 1)).toBe('U10')
    expect(whereText([10, 9, 8], 1)).toBe('U10 down to U8')
    expect(whereText([7], 4)).toBe('U10 down to U7')
    expect(whereText([], 1)).toBeUndefined()
  })
})

describe('the name the box starts with', () => {
  const list = [
    eq('a', 'EDGE-31', 1),
    eq('b', 'EDGE-32', 2, { rackId: 'r2' }),
    eq('c', 'AGG-40', 3, { role: 'aggregation' }),
    eq('d', 'EDGE-99', 4, { rackId: 'r3' }),
  ]
  it('continues the node’s switches of the chosen role', () => {
    const ctx = { equipment: list, racks, rackId: 'r1' }
    expect(startName({ type: 'model', modelId: 'm' }, ctx)).toBe('EDGE-33')
    expect(
      startName(
        { type: 'model', modelId: 'm' },
        { ...ctx, role: 'aggregation' },
      ),
    ).toBe('AGG-41')
  })
  it('is empty with nothing to continue from', () => {
    expect(
      startName({ type: 'panel' }, { equipment: list, racks, rackId: 'r1' }),
    ).toBe('')
  })
  it('a rack item is named by its type, place and unit', () => {
    expect(
      startName(
        { type: 'rack_item', itemType: 'ups' },
        {
          equipment: [],
          racks,
          rackId: 'r1',
          nodeName: 'Building A',
          rackName: 'Rack A03',
          unit: 4,
        },
      ),
    ).toBe('UPS Building A Rack A03 U4')
  })
})

describe('buildBox', () => {
  const base = {
    item: { type: 'model', modelId: 'model-1' } as const,
    model,
    rack,
    top: 10,
    occupied: new Set<number>(),
    taken: new Set<string>(),
  }
  it('a series of switches: one add_equipment each with the model’s ports and details', () => {
    const built = buildBox({ ...base, values: { ...values, count: '2' } })
    if ('error' in built) throw new Error(built.error)
    expect(built.names).toEqual(['EDGE-33', 'EDGE-34'])
    expect(built.commands).toHaveLength(2)
    expect(built.commands[0]).toMatchObject({
      type: 'add_equipment',
      equipment: {
        name: 'EDGE-33',
        unit: 10,
        networkId: 'net-a',
        details: { manufacturer: 'Cisco', model: 'C9300-48P' },
      },
    })
    expect(built.commands[1]).toMatchObject({
      equipment: { name: 'EDGE-34', unit: 9 },
    })
  })
  it('refuses a missing network, name, a taken name, a bad count and a model that is gone', () => {
    const err = (over: Partial<Parameters<typeof buildBox>[0]>, v = {}) =>
      (
        buildBox({ ...base, ...over, values: { ...values, ...v } }) as {
          error: string
        }
      ).error
    expect(err({}, { networkId: '' })).toBe('Choose its network.')
    expect(err({}, { name: ' ' })).toBe('Give it a name.')
    expect(err({ taken: new Set(['edge-34']) }, { count: '2' })).toBe(
      'EDGE-34 is already taken.',
    )
    expect(err({}, { count: '13' })).toBe('How many: 1 to 12.')
    expect(err({ model: undefined })).toBe('This model is gone.')
    expect(err({ occupied: new Set([9]) }, { count: '2' })).toContain(
      'Not enough free units below U10',
    )
  })
  it('a panel: positions and a series, 1U each, passive', () => {
    const built = buildBox({
      ...base,
      item: { type: 'panel' },
      model: undefined,
      values: { ...values, name: 'PNL-1', count: '2', positions: '12' },
    })
    if ('error' in built) throw new Error(built.error)
    expect(built.commands[1]).toMatchObject({
      type: 'add_equipment',
      equipment: {
        name: 'PNL-2',
        kind: 'panel',
        role: 'passive',
        unit: 9,
        portCount: 12,
      },
    })
    expect(
      (
        buildBox({
          ...base,
          item: { type: 'panel' },
          values: { ...values, positions: '49' },
        }) as { error: string }
      ).error,
    ).toContain('between 1 and 48')
  })
  it('an HDF: one add_hdf whose lowest unit is under the clicked one', () => {
    const built = buildBox({
      ...base,
      item: { type: 'hdf' },
      model: undefined,
      values: { ...values, name: 'HDF-1', rows: '12', height: '4' },
    })
    if ('error' in built) throw new Error(built.error)
    expect(built.commands).toEqual([
      {
        type: 'add_hdf',
        hdf: { name: 'HDF-1', rackId: 'r1', unit: 7, height: 4, rows: 12 },
      },
    ])
    expect(
      (
        buildBox({
          ...base,
          item: { type: 'hdf' },
          values: { ...values, rows: '33' },
        }) as { error: string }
      ).error,
    ).toContain('Rows')
  })
  it('a rack item: no ports, no network; an Other needs its text', () => {
    const item = { type: 'rack_item', itemType: 'other' } as const
    expect(
      (
        buildBox({
          ...base,
          item,
          values: { ...values, name: 'KVM', height: '1' },
        }) as {
          error: string
        }
      ).error,
    ).toContain('Say what it is')
    const built = buildBox({
      ...base,
      item,
      values: { ...values, name: 'KVM', height: '2', itemText: 'KVM switch' },
    })
    if ('error' in built) throw new Error(built.error)
    expect(built.commands[0]).toMatchObject({
      equipment: {
        kind: 'rack_item',
        role: 'none',
        unit: 9,
        height: 2,
        details: { itemType: 'other', itemText: 'KVM switch' },
      },
    })
  })
})
