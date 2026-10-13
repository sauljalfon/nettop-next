import { expect, it } from 'vitest'
import type { Plan, Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import {
  GROUPS,
  groupLines,
  lineForKey,
  planSummary,
  undoMessage,
} from './summary'

// The fixture's switch ports are labelled "1"; the server's are "Port 1".
const fixture = acceptanceSnapshot()
const installed: Snapshot = {
  ...fixture,
  endpoints: fixture.endpoints.map((p) =>
    p.side || p.subpanelId ? p : { ...p, label: `Port ${p.label}` },
  ),
}
const empty: Plan = {
  id: 'plan-1',
  name: 'P',
  baseRevision: 'b',
  revision: '1',
  status: 'draft',
  equipment: [],
  subpanels: [],
  endpoints: [],
  links: [],
}

// IDs the server generates: they must never reach the screen.
const SITE = 'site-Q7X4TKA2',
  NODE = 'node-B3M9WLP5',
  RACK = 'rack-Z8N2CVD6',
  EQ = 'equipment-H5R1JYE3',
  CABLE = 'cable-K2D8FUS7',
  HDF = 'equipment-M4T6GBQ9'

const plan: Plan = {
  ...empty,
  sites: [{ id: SITE, name: 'North Annex' }],
  nodes: [{ id: NODE, name: 'Hall', siteId: SITE }],
  racks: [{ id: RACK, nodeId: NODE, name: 'R1', units: 24 }],
  equipment: [
    {
      id: EQ,
      name: 'EDGE-18',
      kind: 'switch',
      role: 'access',
      networkId: 'A',
      rackId: 'rack-a03',
      unit: 6,
      height: 1,
    },
    {
      id: HDF,
      name: 'HDF-03',
      kind: 'hdf',
      role: 'passive',
      rackId: RACK,
      unit: 8,
      height: 3,
    },
  ],
  subpanels: [1, 2].flatMap((row) =>
    (['A', 'B', 'C', 'D'] as const).map((column) => ({
      id: `${HDF}:sp-${row}${column}`,
      equipmentId: HDF,
      row,
      column,
    })),
  ),
  endpoints: [{ id: `${EQ}:p1`, equipmentId: EQ, label: 'Port 1' }],
  links: [
    { id: CABLE, a: `${EQ}:p1`, b: 'AGG-15:p1', kind: 'cable' },
    { id: `${HDF}:bridge`, a: 'x', b: 'y', kind: 'internal' },
  ],
  placements: [{ equipmentId: 'AGG-08', rackId: 'rack-core-03', unit: 3 }],
  removals: {
    equipment: ['PANEL-A'],
    links: ['A03'],
    racks: ['rack-dr01'],
    nodes: ['node-dr1'],
    sites: ['site-dr'],
  },
}

it('RC-04 groups every change in the documented order, each with its key', () => {
  const lines = planSummary(plan, installed)
  expect(lines.map((l) => l.key)).toEqual([
    `add_site:${SITE}`,
    `add_node:${NODE}`,
    `add_rack:${RACK}`,
    `add_equipment:${EQ}`,
    `add_equipment:${HDF}`,
    'place_equipment:AGG-08',
    'remove_equipment:PANEL-A',
    'remove_rack:rack-dr01',
    'remove_node:node-dr1',
    'remove_site:site-dr',
    `add_cable:${CABLE}`,
    'remove_cable:A03',
  ])
  expect(groupLines(lines).map((g) => g.group)).toEqual([...GROUPS])
  expect(groupLines(lines).map((g) => g.lines.length)).toEqual([
    3, 2, 1, 4, 1, 1,
  ])
})

it('RC-04 writes names, never IDs', () => {
  const lines = planSummary(plan, installed)
  const text = Object.fromEntries(lines.map((l) => [l.key, l.text]))
  expect(text[`add_site:${SITE}`]).toBe('Site · North Annex')
  expect(text[`add_node:${NODE}`]).toBe('Node · Hall in North Annex')
  expect(text[`add_rack:${RACK}`]).toBe('Rack · R1 (24U) in Hall')
  expect(text[`add_equipment:${EQ}`]).toBe(
    'EDGE-18 · access switch · Rack A03 U6',
  )
  expect(text[`add_equipment:${HDF}`]).toBe('HDF-03 · HDF, 2 rows · R1 U8–10')
  expect(text['place_equipment:AGG-08']).toBe(
    'AGG-08 · Rack Core 02 U1 → Rack Core 03 U3',
  )
  expect(text['remove_equipment:PANEL-A']).toBe('PANEL-A with 6 cables')
  expect(text['remove_rack:rack-dr01']).toBe('Rack · Rack DR01')
  expect(text['remove_node:node-dr1']).toBe('Node · DR Access')
  expect(text['remove_site:site-dr']).toBe('Site · DR Site')
  expect(text[`add_cable:${CABLE}`]).toBe('EDGE-18 · Port 1 ↔ AGG-15 · Port 1')
  expect(text['remove_cable:A03']).toBe(
    'HDF-01 · 3C/5 front ↔ HDF-02 · 2B/3 front',
  )
  for (const id of [SITE, NODE, RACK, EQ, CABLE, HDF, 'rack-dr01', 'site-dr'])
    for (const line of lines) expect(line.text).not.toContain(id)
})

it('P2-3 a rename is one line in Equipment added, in names, and the add line keeps the added name', () => {
  const renamed: Plan = { ...plan, renames: [{ id: EQ, name: 'Lab switch' }] }
  const lines = planSummary(renamed, installed)
  const rename = lineForKey(lines, `rename_equipment:${EQ}`)
  expect(rename?.text).toBe('Rename EDGE-18 → Lab switch')
  expect(rename?.group).toBe('Equipment added')
  expect(rename?.go).toEqual({ kind: 'equipment', equipmentId: EQ })
  expect(lineForKey(lines, `add_equipment:${EQ}`)?.text).toBe(
    'EDGE-18 · access switch · Rack A03 U6',
  )
  expect(rename?.text).not.toContain(EQ)
})

it('RC-04 each line links to its object; removals have nothing to open', () => {
  const go = Object.fromEntries(
    planSummary(plan, installed).map((l) => [l.key, l.go]),
  )
  expect(go[`add_site:${SITE}`]).toEqual({ kind: 'container', siteId: SITE })
  expect(go[`add_node:${NODE}`]).toEqual({
    kind: 'container',
    siteId: SITE,
    nodeId: NODE,
  })
  expect(go[`add_rack:${RACK}`]).toEqual({
    kind: 'container',
    siteId: SITE,
    nodeId: NODE,
    rackId: RACK,
  })
  expect(go[`add_equipment:${EQ}`]).toEqual({
    kind: 'equipment',
    equipmentId: EQ,
  })
  expect(go['place_equipment:AGG-08']).toEqual({
    kind: 'equipment',
    equipmentId: 'AGG-08',
  })
  expect(go[`add_cable:${CABLE}`]).toEqual({
    kind: 'endpoint',
    endpointId: `${EQ}:p1`,
  })
  expect(go['remove_equipment:PANEL-A']).toBeUndefined()
  expect(go['remove_cable:A03']).toBeUndefined()
})

it('RC-04 an empty plan has no lines, and a pre-placement plan still lists its moves', () => {
  expect(planSummary(empty, installed)).toEqual([])
  const legacy: Plan = {
    ...empty,
    updates: [
      {
        id: 'AGG-15',
        name: 'AGG-15',
        kind: 'switch',
        role: 'aggregation',
        networkId: 'A',
        rackId: 'rack-core-03',
        unit: 2,
        height: 1,
      },
    ],
  }
  expect(planSummary(legacy, installed).map((l) => l.text)).toEqual([
    'AGG-15 · Rack Core 02 U1 → Rack Core 03 U2',
  ])
})

it('RB-03 a conflict key maps to the same line, with names from Installed only', () => {
  const lines = planSummary(plan, installed)
  expect(lineForKey(lines, 'place_equipment:AGG-08')?.text).toContain('AGG-08')
  expect(lineForKey(lines, `add_cable:${CABLE}`)?.group).toBe(
    'Cables connected',
  )
  expect(lineForKey(lines, 'add_equipment:nope')).toBeUndefined()
  // Something the current Installed no longer has is described without its ID.
  const gone = planSummary(
    {
      ...empty,
      placements: [
        { equipmentId: 'equipment-GONE1234', rackId: 'rack-a03', unit: 3 },
      ],
    },
    installed,
  )
  expect(gone[0].text).toBe(
    'Equipment no longer in Installed · now Rack A03 U3',
  )
  expect(gone[0].go).toBeUndefined()
})

it('ED-15 the Undo toast names the change and counts what depended on it', () => {
  const lines = planSummary(plan, installed)
  expect(undoMessage(lines, [`add_equipment:${EQ}`])).toBe(
    'Undid: EDGE-18 · access switch · Rack A03 U6',
  )
  expect(
    undoMessage(lines, [`add_equipment:${EQ}`, `add_cable:${CABLE}`]),
  ).toBe(
    'Undid: EDGE-18 · access switch · Rack A03 U6 (also undid 1 dependent change)',
  )
  expect(
    undoMessage(lines, [
      `add_rack:${RACK}`,
      `add_equipment:${HDF}`,
      'place_equipment:AGG-08',
    ]),
  ).toBe('Undid: Rack · R1 (24U) in Hall (also undid 2 dependent changes)')
})

it('RB-03 lines use plan.labels for objects the snapshot no longer has, never "An endpoint" or an ID', () => {
  const gone: Plan = {
    ...empty,
    labels: {
      'equipment-GONE1111': 'SW4 Lab',
      'equipment-GONE1111:p1': 'SW4 Lab · Port 1',
      'rack-GONE2222': 'Rack Lab',
      'cable-GONE3333': 'PANEL-A · 10 front ↔ AGG-15 · Port 2',
      'panel-gone': 'PANEL-X',
      'rack-dr03': 'Rack DR03',
    },
    links: [
      {
        id: 'cable-NEW',
        a: 'equipment-GONE1111:p1',
        b: 'AGG-15:p2',
        kind: 'cable',
      },
    ],
    placements: [
      { equipmentId: 'equipment-GONE1111', rackId: 'rack-GONE2222', unit: 4 },
    ],
    removals: {
      equipment: ['panel-gone'],
      links: ['cable-GONE3333'],
      racks: ['rack-dr03'],
    },
  }
  const text = Object.fromEntries(
    planSummary(gone, installed).map((l) => [l.key, l.text]),
  )
  expect(text['add_cable:cable-NEW']).toBe('SW4 Lab · Port 1 ↔ AGG-15 · Port 2')
  expect(text['place_equipment:equipment-GONE1111']).toBe(
    'SW4 Lab · now Rack Lab U4',
  )
  expect(text['remove_equipment:panel-gone']).toBe('PANEL-X')
  expect(text['remove_cable:cable-GONE3333']).toBe(
    'PANEL-A · 10 front ↔ AGG-15 · Port 2',
  )
  expect(text['remove_rack:rack-dr03']).toBe('Rack · Rack DR03')
  for (const t of Object.values(text)) {
    expect(t).not.toContain('An endpoint')
    expect(t).not.toMatch(/GONE|equipment-|cable-|panel-gone/)
  }
})

it('a recorded plan names what it moved and removed from its labels, without a "from"', () => {
  const recorded: Plan = {
    ...empty,
    status: 'recorded',
    labels: {
      'AGG-15': 'AGG-15',
      'rack-core-03': 'Rack Core 03',
      'panel-old': 'PANEL-OLD',
    },
    placements: [{ equipmentId: 'AGG-15', rackId: 'rack-core-03', unit: 3 }],
    removals: { equipment: ['panel-old'] },
  }
  expect(planSummary(recorded, installed).map((l) => l.text)).toEqual([
    'AGG-15 · moved to Rack Core 03 U3',
    'PANEL-OLD',
  ])
})
