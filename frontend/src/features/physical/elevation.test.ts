import { describe, expect, it } from 'vitest'
import { agg03Route } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { buildInventory, routeMarks } from './inventory'
import { rackElevation, rackNeighbours } from './elevation'
import type { Equipment } from '../../shared/types'
import type { Inventory } from './inventory'

const s = physicalSnapshot()
const index = indexSnapshot(s)
const inv = buildInventory(s, index)

describe('F04 a 3U HDF is one object spanning U4-U6', () => {
  const rows = rackElevation(inv, 'rack-sm01')

  it('lists units from the top down, 12 units in all', () => {
    const units = rows.flatMap((r) =>
      r.kind === 'free' ? [r.unit] : [r.unit + r.height - 1],
    )
    expect(units[0]).toBe(12)
    expect(
      rows.reduce((n, r) => n + (r.kind === 'free' ? 1 : r.height), 0),
    ).toBe(12)
  })

  it('has exactly one HDF-01 object over U4-U6 and no duplicates', () => {
    const objects = rows.filter((r) => r.kind === 'equipment')
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({
      equipmentId: 'HDF-01',
      unit: 4,
      height: 3,
      topUnit: 6,
    })
  })

  it('marks the other units free, top to bottom', () => {
    const free = rows.filter((r) => r.kind === 'free').map((r) => r.unit)
    expect(free).toEqual([12, 11, 10, 9, 8, 7, 3, 2, 1])
  })

  it('places 1U equipment at its unit', () => {
    const core = rackElevation(inv, 'rack-core-01')
    expect(
      core
        .filter((r) => r.kind === 'equipment')
        .map((r) => r.kind === 'equipment' && r.equipmentId),
    ).toEqual(['AGG-03', 'HDF-02'])
  })

  it('marks route equipment and the selected one', () => {
    const marks = routeMarks(index, agg03Route())
    const r = rackElevation(inv, 'rack-core-01', {
      marks,
      selectedEquipmentId: 'AGG-03',
    })
    const hdf = r.find(
      (x) => x.kind === 'equipment' && x.equipmentId === 'HDF-02',
    )
    const agg = r.find(
      (x) => x.kind === 'equipment' && x.equipmentId === 'AGG-03',
    )
    expect(hdf).toMatchObject({ onRoute: true, selected: false })
    expect(agg).toMatchObject({ onRoute: true, selected: true })
  })

  it('returns nothing for an unknown rack', () => {
    expect(rackElevation(inv, 'rack-gone')).toEqual([])
  })

  it('ignores equipment placed outside the rack instead of drawing it', () => {
    const odd = {
      ...s,
      equipment: s.equipment.map((e) =>
        e.id === 'HDF-01' ? { ...e, unit: 11, height: 3 } : e,
      ),
    }
    const rows2 = rackElevation(
      buildInventory(odd, indexSnapshot(odd)),
      'rack-sm01',
    )
    expect(
      rows2.reduce((n, r) => n + (r.kind === 'free' ? 1 : r.height), 0),
    ).toBe(12)
  })
})

describe('PHY-07 proposed equipment is marked at rack level', () => {
  it('marks equipment missing from the installed set, and only that', () => {
    const installed = new Set(
      s.equipment.map((e) => e.id).filter((id) => id !== 'AGG-15'),
    )
    const rows = rackElevation(inv, 'rack-core-02', { installedIds: installed })
    const flags = Object.fromEntries(
      rows.flatMap((r) =>
        r.kind === 'equipment' ? [[r.equipmentId, r.proposed]] : [],
      ),
    )
    expect(flags).toEqual({ 'AGG-08': false, 'AGG-15': true })
  })

  it('marks nothing without an installed set', () => {
    const rows = rackElevation(inv, 'rack-core-02')
    expect(rows.every((r) => r.kind === 'free' || !r.proposed)).toBe(true)
  })
})

describe('PHY-05 other networks are muted, never hidden', () => {
  it('mutes active devices of another network and keeps every row', () => {
    const all = rackElevation(inv, 'rack-dr01')
    const filtered = rackElevation(inv, 'rack-dr01', { networkId: 'A' })
    expect(filtered).toHaveLength(all.length)
    const byId = (rows: typeof all, id: string) =>
      rows.find((r) => r.kind === 'equipment' && r.equipmentId === id)
    expect(byId(filtered, 'EDGE-22')).toMatchObject({ muted: true })
    expect(byId(filtered, 'PANEL-DR')).toMatchObject({ muted: false }) // shared, never muted
    expect(
      byId(rackElevation(inv, 'rack-dr01', { networkId: 'B' }), 'EDGE-22'),
    ).toMatchObject({ muted: false })
    expect(byId(all, 'EDGE-22')).toMatchObject({ muted: false })
  })
})

describe('rackNeighbours: the equipment drawn above and below in a rack', () => {
  // A 12U rack. Top to bottom: CM (U12), PANEL (U11), SW (U8), UPS (U1-2).
  const fake = (
    list: { id: string; unit: number; height?: number; kind?: string }[],
  ): Inventory => {
    const equipment = new Map(
      list.map((e) => [
        e.id,
        {
          id: e.id,
          name: e.id,
          kind: e.kind ?? 'switch',
          role: 'access',
          unit: e.unit,
          height: e.height ?? 1,
          rackId: 'r',
        } as unknown as Equipment,
      ]),
    )
    return {
      racks: new Map([['r', { units: 12 }]]),
      equipmentByRack: new Map([['r', list.map((e) => e.id)]]),
      equipment,
    } as unknown as Inventory
  }
  const rack = fake([
    { id: 'UPS', unit: 1, height: 2, kind: 'rack_item' },
    { id: 'SW', unit: 8 },
    { id: 'PANEL', unit: 11, kind: 'panel' },
    { id: 'CM', unit: 12, kind: 'rack_item' },
  ])

  it('a middle one has the unit above as previous and the unit below as next', () => {
    expect(rackNeighbours(rack, 'r', 'SW')).toEqual({
      previous: 'PANEL',
      next: 'UPS',
    })
  })

  it('the top one has no previous, the bottom one no next', () => {
    expect(rackNeighbours(rack, 'r', 'CM')).toEqual({
      previous: undefined,
      next: 'PANEL',
    })
    expect(rackNeighbours(rack, 'r', 'UPS')).toEqual({
      previous: 'SW',
      next: undefined,
    })
  })

  it('one equipment alone has neither', () => {
    expect(rackNeighbours(fake([{ id: 'ONE', unit: 5 }]), 'r', 'ONE')).toEqual({
      previous: undefined,
      next: undefined,
    })
  })

  it('a rack item between two is a neighbour of both', () => {
    const inv = fake([
      { id: 'A', unit: 10 },
      { id: 'ITEM', unit: 6, kind: 'rack_item' },
      { id: 'B', unit: 2 },
    ])
    expect(rackNeighbours(inv, 'r', 'A').next).toBe('ITEM')
    expect(rackNeighbours(inv, 'r', 'B').previous).toBe('ITEM')
  })

  it('proposed equipment (only in the plan inventory) counts', () => {
    const planned = fake([
      { id: 'A', unit: 10 },
      { id: 'NEW', unit: 6, height: 3 },
      { id: 'B', unit: 2 },
    ])
    expect(rackNeighbours(planned, 'r', 'A').next).toBe('NEW')
    expect(rackNeighbours(planned, 'r', 'NEW')).toEqual({
      previous: 'A',
      next: 'B',
    })
  })

  it('an equipment that is not in the rack, or an unknown rack, has none', () => {
    expect(rackNeighbours(rack, 'r', 'GONE')).toEqual({})
    expect(rackNeighbours(rack, 'nope', 'SW')).toEqual({})
  })

  it('in the test fixture, HDF-01 is alone in its rack', () => {
    const real = rackNeighbours(inv, 'rack-sm01', 'HDF-01')
    expect(real).toEqual({ previous: undefined, next: undefined })
  })
})
