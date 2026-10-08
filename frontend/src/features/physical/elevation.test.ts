import { describe, expect, it } from 'vitest'
import { agg03Route } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { buildInventory, routeMarks } from './inventory'
import { rackElevation } from './elevation'

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
