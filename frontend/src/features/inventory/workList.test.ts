import { describe, expect, it } from 'vitest'
import { piecesText } from '../../shared/textPieces'
import type { Plan, Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { buildWorkList } from './workList'

/**
 * INV-11. The Expansion draft: EDGE-18 added in Rack A03 and its cable to
 * AGG-15, plus the other kinds of change, so the order can be checked.
 */
const fixture = acceptanceSnapshot()
const installed: Snapshot = {
  ...fixture,
  endpoints: fixture.endpoints.map((p) =>
    p.side || p.subpanelId ? p : { ...p, label: `Port ${p.label}` },
  ),
}
const edge18 = {
  id: 'EDGE-18',
  name: 'EDGE-18',
  kind: 'switch' as const,
  role: 'access',
  networkId: 'A',
  rackId: 'rack-a03',
  unit: 6,
  height: 1,
  manufacturer: 'Cisco',
  model: 'C9300',
}
const empty: Plan = {
  id: 'expansion',
  name: 'Expansion',
  baseRevision: 'b',
  revision: '1',
  status: 'draft',
  equipment: [],
  subpanels: [],
  endpoints: [],
  links: [],
}
const expansion: Plan = {
  ...empty,
  equipment: [edge18],
  endpoints: [{ id: 'EDGE-18:p1', equipmentId: 'EDGE-18', label: 'Port 1' }],
  links: [
    { id: 'planned-cable-18', a: 'EDGE-18:p1', b: 'AGG-15:p1', kind: 'cable' },
  ],
}

/** What the server's proposed snapshot is: the installed one with the plan applied. */
function propose(plan: Plan): Snapshot {
  const gone = new Set(plan.removals?.equipment ?? [])
  const cut = new Set(plan.removals?.links ?? [])
  const moved = new Map((plan.placements ?? []).map((p) => [p.equipmentId, p]))
  return {
    ...installed,
    context: 'planned',
    sites: [...installed.sites, ...(plan.sites ?? [])],
    nodes: [...installed.nodes, ...(plan.nodes ?? [])],
    racks: [...installed.racks, ...(plan.racks ?? [])],
    equipment: [
      ...installed.equipment
        .filter((e) => !gone.has(e.id))
        .map((e) => {
          const m = moved.get(e.id)
          return m ? { ...e, rackId: m.rackId, unit: m.unit } : e
        }),
      ...plan.equipment,
    ],
    endpoints: [...installed.endpoints, ...plan.endpoints],
    links: [...installed.links.filter((l) => !cut.has(l.id)), ...plan.links],
  }
}
const build = (plan: Plan) => {
  const proposed = propose(plan)
  return buildWorkList(
    plan,
    installed,
    indexSnapshot(installed),
    proposed,
    indexSnapshot(proposed),
  )
}

describe('INV-11 work list', () => {
  it('has a row for EDGE-18 added in Rack A03 and one for its cable to AGG-15', () => {
    const rows = build(expansion)
    expect(
      rows.map((r) => [r.values.n, r.values.action, r.values.what]),
    ).toEqual([
      ['1', 'Add', 'EDGE-18'],
      ['2', 'Connect', 'planned-cable-18'],
    ])
    const [add, connect] = rows
    expect(add.values.where).toBe('Main Campus › Building A › Rack A03 · U6')
    expect(add.values.node).toBe('Building A')
    expect(add.values.detail).toBe('Cisco C9300, 1 port, Network A')
    expect(add).toMatchObject({
      key: 'add_equipment:EDGE-18',
      equipmentId: 'EDGE-18',
      proposed: true,
      i: 0,
    })
    expect(connect.values.where).toBe('EDGE-18 Port 1 ↔ AGG-15 Port 1')
    expect(connect.values.detail).toBe('No label')
    expect(connect).toMatchObject({
      key: 'add_cable:planned-cable-18',
      equipmentId: 'EDGE-18',
      endpointId: 'EDGE-18:p1',
      cableId: 'planned-cable-18',
      proposed: true,
    })
  })

  it('is one row per planSummary line, in the order removals, moves, additions, cables', () => {
    const plan: Plan = {
      ...expansion,
      sites: [{ id: 's-new', name: 'North Annex' }],
      nodes: [{ id: 'n-new', siteId: 's-new', name: 'Hall' }],
      racks: [{ id: 'r-new', nodeId: 'n-new', name: 'R1', units: 24 }],
      placements: [{ equipmentId: 'AGG-08', rackId: 'rack-core-03', unit: 3 }],
      removals: { equipment: ['EDGE-22'], links: ['A04'] },
    }
    const rows = build(plan)
    expect(rows.map((r) => r.values.action)).toEqual([
      'Remove',
      'Move',
      'Add',
      'Add',
      'Add',
      'Add',
      'Connect',
      'Disconnect',
    ])
    expect(rows.map((r) => r.values.n)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ])
    expect(rows.map((r) => r.key)).toEqual([
      'remove_equipment:EDGE-22',
      'place_equipment:AGG-08',
      'add_site:s-new',
      'add_node:n-new',
      'add_rack:r-new',
      'add_equipment:EDGE-18',
      'add_cable:planned-cable-18',
      'remove_cable:A04',
    ])
    expect(rows.map((r) => r.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('places a removal and a disconnect from Installed, the rest from the proposed topology', () => {
    const plan: Plan = {
      ...expansion,
      placements: [{ equipmentId: 'AGG-08', rackId: 'rack-core-03', unit: 3 }],
      removals: { equipment: ['EDGE-22'], links: ['A04'] },
    }
    const [remove, move, , , disconnect] = build(plan)
    expect(remove.values.where).toBe('DR Site › DR Access › Rack DR01 · U1')
    expect(remove.values.detail).toBe('Switch; its cable goes too')
    expect(remove.values.node).toBe('DR Access')
    expect(remove).toMatchObject({ equipmentId: 'EDGE-22', proposed: false })
    expect(move.values.where).toBe(
      'Main Campus › Main Distribution › Rack Core 03 · U3',
    )
    expect(disconnect.values.where).toBe('HDF-02 2B/3 rear ↔ AGG-03 Port 1')
    expect(disconnect).toMatchObject({
      cableId: 'A04',
      equipmentId: 'HDF-02',
      proposed: false,
    })
    expect(disconnect.values.node).toBe('Main Distribution')
  })

  it('says From U3 to U8 for a move in the same rack, and names the other rack otherwise', () => {
    const inRack = build({
      ...empty,
      placements: [{ equipmentId: 'AGG-08', rackId: 'rack-core-02', unit: 8 }],
    })
    expect(inRack[0].values.detail).toBe('From U1 to U8')
    const other = build({
      ...empty,
      placements: [{ equipmentId: 'AGG-08', rackId: 'rack-core-03', unit: 3 }],
    })
    expect(other[0].values.detail).toBe(
      'From Rack Core 02 U1 to Rack Core 03 U3',
    )
    const names = other[0].parts!.detail.flatMap((p) =>
      'name' in p ? [p.name] : [],
    )
    expect(names).toEqual(['Rack Core 02', 'Rack Core 03'])
  })

  it('keeps names apart as pieces, Hebrew included', () => {
    const plan: Plan = {
      ...empty,
      equipment: [{ ...edge18, id: 'e-he', name: 'מתג קומה 7' }],
      endpoints: [{ id: 'e-he:p1', equipmentId: 'e-he', label: 'Port 1' }],
      links: [{ id: 'c-he', a: 'e-he:p1', b: 'AGG-15:p1', kind: 'cable' }],
    }
    const [add, connect] = build(plan)
    expect(add.values.what).toBe('מתג קומה 7')
    expect(add.parts!.where.filter((p) => 'name' in p)).toEqual([
      { name: 'Main Campus' },
      { name: 'Building A' },
      { name: 'Rack A03' },
    ])
    expect(piecesText(add.parts!.where)).toBe(add.values.where)
    expect(connect.parts!.where.filter((p) => 'name' in p)).toEqual([
      { name: 'מתג קומה 7' },
      { name: 'Port 1' },
      { name: 'AGG-15' },
      { name: 'Port 1' },
    ])
    expect(connect.values.node).toBe('Building A')
  })

  it('shows the label of a cable it connects', () => {
    const plan: Plan = {
      ...expansion,
      links: [{ ...expansion.links[0], label: 'A18' }],
    }
    expect(build(plan)[1].values.detail).toBe('Label "A18"')
  })

  it('gives an empty Where to a change whose object has no place', () => {
    const rows = build({
      ...empty,
      removals: { equipment: ['gone'], links: ['gone-cable'] },
      labels: { gone: 'OLD-SW' },
    })
    expect(
      rows.map((r) => [r.values.action, r.values.what, r.values.where]),
    ).toEqual([
      ['Remove', 'OLD-SW', ''],
      ['Disconnect', 'gone-cable', ''],
    ])
    expect(rows[0].equipmentId).toBe('')
  })

  it('is empty for a plan with no changes and for an empty installed root', () => {
    expect(build(empty)).toEqual([])
    const none: Snapshot = {
      ...installed,
      sites: [],
      nodes: [],
      racks: [],
      equipment: [],
      endpoints: [],
      links: [],
      subpanels: [],
    }
    expect(
      buildWorkList(
        empty,
        none,
        indexSnapshot(none),
        none,
        indexSnapshot(none),
      ),
    ).toEqual([])
  })

  it('describes a rename with the equipment it changes', () => {
    const rows = build({
      ...expansion,
      renames: [{ id: 'EDGE-18', name: 'EDGE-18B' }],
    })
    const rename = rows.find((r) => r.values.action === 'Rename')!
    expect(rename.values.what).toBe('EDGE-18B')
    expect(rename.values.detail).toBe('Was EDGE-18')
    expect(rename.equipmentId).toBe('EDGE-18')
    // Renames stay with the additions: after the equipment, before the cables.
    expect(rows.map((r) => r.values.action)).toEqual([
      'Add',
      'Rename',
      'Connect',
    ])
  })

  it('marks what is removed as gone: nothing to open in the plan', () => {
    const rows = build({
      ...empty,
      removals: { equipment: ['EDGE-22'], links: ['A04', 'B01'] },
    })
    const by = (key: string) => rows.find((r) => r.key === key)!
    expect(by('remove_equipment:EDGE-22').gone).toBe(true)
    // A disconnected cable still has its A end's equipment in the plan ...
    expect(by('remove_cable:A04').gone).toBeUndefined()
    // ... unless that equipment is removed too (B01 starts at EDGE-22).
    expect(by('remove_cable:B01').gone).toBe(true)
    expect(build(expansion).some((r) => r.gone)).toBe(false)
  })

  it('gives an added site, node or rack the place it opens', () => {
    const rows = build({
      ...empty,
      sites: [{ id: 's-new', name: 'North Annex' }],
      nodes: [{ id: 'n-new', siteId: 's-new', name: 'Hall' }],
      racks: [{ id: 'r-new', nodeId: 'n-new', name: 'R1', units: 24 }],
    })
    expect(rows.map((r) => r.place)).toEqual([
      { siteId: 's-new' },
      { siteId: 's-new', nodeId: 'n-new' },
      { siteId: 's-new', nodeId: 'n-new', rackId: 'r-new' },
    ])
    expect(rows.every((r) => r.equipmentId === '' && !r.gone)).toBe(true)
    expect(rows[2].values).toMatchObject({
      where: 'North Annex › Hall',
      detail: '24U',
    })
    // A removed container has nothing to open.
    const removed = build({ ...empty, removals: { racks: ['rack-a03'] } })
    expect(removed[0]).toMatchObject({ gone: true })
    expect(removed[0].place).toBeUndefined()
  })

  it('gives each row the icon of its object', () => {
    const rows = build({
      ...expansion,
      sites: [{ id: 's-new', name: 'North Annex' }],
    })
    expect(rows.map((r) => r.icon)).toEqual(['rack', 'switch', 'cable'])
  })
})
