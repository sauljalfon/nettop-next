import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { buildRackRows } from './racks'
import { buildRows } from './rows'

/**
 * INV-08. The fixture's racks are 12U. Core 01 holds AGG-03 at U1 and HDF-02
 * (4U) at U4–U7; Rack A03 is full; the added rack is empty and has a Hebrew name.
 */
function fixture(): Snapshot {
  const s = acceptanceSnapshot()
  return {
    ...s,
    racks: [
      ...s.racks,
      { id: 'rack-empty', nodeId: 'node-dr1', name: 'ארון ריק 03', units: 8 },
    ],
    equipment: s.equipment.map((e) =>
      e.id === 'HDF-02'
        ? { ...e, unit: 4, height: 4 }
        : e.id === 'EDGE-17'
          ? { ...e, unit: 1, height: 12 }
          : e,
    ),
  }
}

const racksOf = (s: Snapshot) => buildRackRows(s, indexSnapshot(s))
const byName = (s: Snapshot, name: string) =>
  racksOf(s).find((r) => r.values.rack === name)!

describe('INV-08 rack rows', () => {
  const s = fixture()

  it('has one row per rack with its place, height and equipment count', () => {
    const rows = racksOf(s)
    expect(rows).toHaveLength(s.racks.length)
    expect(rows.map((r) => r.key)).toEqual(s.racks.map((r) => r.id))
    expect(rows.map((r) => r.i)).toEqual(s.racks.map((_, i) => i))
    const core = byName(s, 'Rack Core 01')
    expect(core.rackId).toBe('rack-core-01')
    expect(core.equipmentId).toBe('')
    expect(core.proposed).toBe(false)
    expect(core.icon).toBe('rack')
    expect(core.values).toMatchObject({
      site: 'Main Campus',
      node: 'Main Distribution',
      units: '12',
      count: '2',
    })
  })

  it('counts the units equipment covers: a 4U HDF covers 4 units', () => {
    const core = byName(s, 'Rack Core 01')
    // AGG-03 covers U1, HDF-02 covers U4–U7.
    expect(core.values.used).toBe('5')
    expect(core.values.free).toBe('7')
  })

  it('finds the largest free block and what fits in it', () => {
    const core = byName(s, 'Rack Core 01')
    expect(core.values.gap).toBe('U8–U12 (5U)')
    expect(core.raw.gap).toBe('5')
    expect(core.lists?.fits).toEqual(['1U', '2U', '4U'])
    expect(core.values.fits).toBe('1U, 2U, 4U')
  })

  it('says Full for a rack with no free unit, and fits nothing', () => {
    const a03 = byName(s, 'Rack A03')
    expect(a03.values).toMatchObject({ used: '12', free: '0', gap: 'Full' })
    expect(a03.raw.gap).toBe('0')
    expect(a03.lists?.fits).toEqual([])
    expect(a03.values.fits).toBe('')
  })

  it('lists an empty rack as one free block that fits everything, Hebrew name kept', () => {
    const empty = byName(s, 'ארון ריק 03')
    expect(empty.values).toMatchObject({
      used: '0',
      free: '8',
      gap: 'U1–U8 (8U)',
      count: '0',
      node: 'DR Access',
    })
    expect(empty.lists?.fits).toEqual(['1U', '2U', '4U', '8U'])
  })

  it('takes the first of equal free blocks, and ignores units above the rack', () => {
    const t: Snapshot = {
      ...s,
      equipment: s.equipment.map((e) =>
        e.id === 'AGG-03' ? { ...e, unit: 5, height: 2 } : e,
      ),
    }
    // HDF-02 U4–U7 and AGG-03 U5–U6 overlap: U4–U7 used; U1–U3 and U8–U12.
    const core = byName(t, 'Rack Core 01')
    expect(core.values.used).toBe('4')
    expect(core.values.gap).toBe('U8–U12 (5U)')
    const tall: Snapshot = {
      ...s,
      equipment: s.equipment.map((e) =>
        e.id === 'AGG-03' ? { ...e, unit: 11, height: 6 } : e,
      ),
    }
    expect(byName(tall, 'Rack Core 01').values.used).toBe('6') // U4–U7 and U11–U12
  })

  it('follows a move in a plan: the proposed snapshot has the new units', () => {
    const moved: Snapshot = {
      ...s,
      context: 'planned',
      equipment: s.equipment.map((e) =>
        e.id === 'HDF-02' ? { ...e, unit: 9 } : e,
      ),
    }
    const core = byName(moved, 'Rack Core 01')
    expect(core.values.gap).toBe('U2–U8 (7U)')
    expect(core.values.free).toBe('7')
  })

  it('is part of buildRows and empty for an empty installed root', () => {
    const rows = buildRows(
      s,
      indexSnapshot(s),
      new Set(s.equipment.map((e) => e.id)),
      new Set(s.links.map((l) => l.id)),
    )
    expect(rows.racks.map((r) => r.key)).toEqual(s.racks.map((r) => r.id))
    const none: Snapshot = {
      ...s,
      sites: [],
      nodes: [],
      racks: [],
      equipment: [],
      endpoints: [],
      links: [],
      subpanels: [],
    }
    expect(racksOf(none)).toEqual([])
    const all = buildRows(none, indexSnapshot(none), new Set(), new Set())
    expect(
      [
        all.equipment,
        all.ports,
        all.cables,
        all.racks,
        all.problems,
        all.work,
      ].map((l) => l.length),
    ).toEqual([0, 0, 0, 0, 0, 0])
  })
})
