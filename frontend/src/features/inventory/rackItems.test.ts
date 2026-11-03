import { describe, expect, it } from 'vitest'
import type { Equipment, Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { COLUMNS, PILLS } from './columns'
import { buildProblems } from './problems'
import { buildRackRows } from './racks'
import { buildRows, missingOf } from './rows'

// RI-11: the acceptance snapshot (all at U1) plus a 2U UPS at U5 and an Other at U7 in Rack A03.
const ups: Equipment = {
  id: 'UPS-A03',
  name: 'UPS-A03',
  kind: 'rack_item',
  role: 'none',
  rackId: 'rack-a03',
  unit: 5,
  height: 2,
  itemType: 'ups',
}
const kvm: Equipment = {
  ...ups,
  id: 'KVM-A03',
  name: 'KVM-A03',
  unit: 7,
  height: 1,
  itemType: 'other',
  itemText: 'KVM switch',
}
const withItems = (): Snapshot => {
  const s = acceptanceSnapshot()
  return { ...s, equipment: [...s.equipment, ups, kvm] }
}
const rowsOf = (s: Snapshot) =>
  buildRows(
    s,
    indexSnapshot(s),
    new Set(s.equipment.map((e) => e.id)),
    new Set(s.links.map((l) => l.id)),
  )

describe('RI-11 rack items in the Inventory', () => {
  const s = withItems()
  const rows = rowsOf(s)
  const row = (id: string) => rows.equipment.find((r) => r.key === id)!

  it('has a Type column after Kind, and a Type pill', () => {
    const keys = COLUMNS.equipment.map((c) => c.key)
    expect(keys.indexOf('type')).toBe(keys.indexOf('kind') + 1)
    expect(PILLS.equipment.map(([k]) => k)).toContain('type')
  })

  it('reads Kind "Rack item" and its Type; Role, Network and Ports stay empty', () => {
    expect(row('UPS-A03').values).toMatchObject({
      kind: 'Rack item',
      type: 'UPS',
      role: '',
      net: '',
      used: '',
      free: '',
      unit: '5',
    })
    expect(row('UPS-A03').parts?.type).toEqual([{ text: 'UPS' }])
  })

  it('an Other is "Other" for the pill, with its text as a name piece', () => {
    expect(row('KVM-A03').values.type).toBe('Other')
    expect(row('KVM-A03').parts?.type).toEqual([
      { text: 'Other · ' },
      { name: 'KVM switch' },
    ])
  })

  it('a switch, a panel and an HDF have no type', () => {
    for (const id of ['AGG-03', 'PANEL-A', 'HDF-01']) {
      expect(row(id).values.type).toBe('')
      expect(row(id).parts?.type).toBeUndefined()
    }
  })

  it('asks a rack item for nothing in Missing', () => {
    expect(missingOf(ups)).toEqual([])
    expect(row('UPS-A03').lists?.missing).toEqual([])
  })

  it('counts its units as used in Racks', () => {
    const before = buildRackRows(
      acceptanceSnapshot(),
      indexSnapshot(acceptanceSnapshot()),
    ).find((r) => r.rackId === 'rack-a03')!
    const after = buildRackRows(s, indexSnapshot(s)).find(
      (r) => r.rackId === 'rack-a03',
    )!
    expect(Number(after.values.used)).toBe(Number(before.values.used) + 3)
    expect(Number(after.values.count)).toBe(Number(before.values.count) + 2)
  })

  it('has no row in Problems', () => {
    const problems = buildProblems(
      s,
      indexSnapshot(s),
      new Set(s.equipment.map((e) => e.id)),
    )
    expect(
      problems.filter(
        (p) => p.equipmentId === 'UPS-A03' || p.equipmentId === 'KVM-A03',
      ),
    ).toEqual([])
  })
})
