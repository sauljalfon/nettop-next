import { expect, it } from 'vitest'
import type { Endpoint, Link, Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import {
  circuitsCut,
  deleteLines,
  disconnectLines,
  equipmentDeletePreview,
} from './deletePreview'

// The fixture labels switch ports "1"; the server's are "Port 1".
const fixture = acceptanceSnapshot()
const snapshot: Snapshot = {
  ...fixture,
  endpoints: fixture.endpoints.map((p) =>
    p.side || p.subpanelId ? p : { ...p, label: `Port ${p.label}` },
  ),
}
const index = indexSnapshot(snapshot)
const idOf = (name: string) =>
  snapshot.equipment.find((e) => e.name === name)!.id

it('ED-08 PANEL-A: 48 positions, six cables, and the three circuits through it', () => {
  const p = equipmentDeletePreview(snapshot, index, idOf('PANEL-A'))!
  expect(p.endpointCount).toBe(48)
  expect(p.cableIds).toEqual(['A01', 'A02', 'A05', 'A06', 'A09', 'A10'])
  // Access end first, duplicates (A01 and A02 are one circuit) removed.
  expect(p.circuits.map((c) => c.label)).toEqual([
    'EDGE-17 port 1 → AGG-03 port 1',
    'EDGE-17 port 2 → AGG-08 port 1',
    'EDGE-17 port 3 → BB-01 port 1',
  ])
})

it('puts the access end first whichever cable of the circuit is asked for', () => {
  const fromAgg = circuitsCut(snapshot, index, ['A04'])
  expect(fromAgg.map((c) => c.label)).toEqual([
    'EDGE-17 port 1 → AGG-03 port 1',
  ])
  const both = circuitsCut(snapshot, index, ['A04', 'A01'])
  expect(both).toHaveLength(1)
})

it('a cable with a dead end on either side cuts no circuit', () => {
  // Remove the bridge-side continuation: a cable whose far side runs into a free position.
  const cut: Snapshot = {
    ...snapshot,
    links: snapshot.links.filter((l) => l.id !== 'A02'),
  }
  const i = indexSnapshot(cut)
  expect(circuitsCut(cut, i, ['A01'])).toEqual([])
  expect(circuitsCut(cut, i, ['no-such-cable'])).toEqual([])
})

it('never crosses sibling ports: a switch port ends the walk', () => {
  // AGG-03 port 1's circuit does not continue to AGG-03's other ports.
  const labels = circuitsCut(snapshot, index, ['A04']).flatMap((c) => c.ends)
  expect(labels).toEqual(['EDGE-17:p1', 'AGG-03:p1'])
})

it('a switch lists its ports and cables; EDGE-17 cuts the same three circuits', () => {
  const p = equipmentDeletePreview(snapshot, index, idOf('EDGE-17'))!
  expect(p.cableIds).toEqual(['A01', 'A05', 'A09'])
  expect(p.circuits).toHaveLength(3)
  expect(equipmentDeletePreview(snapshot, index, 'nope')).toBeUndefined()
})

it('equipment without cables cuts nothing', () => {
  const p = equipmentDeletePreview(snapshot, index, idOf('AGG-15'))!
  expect(p.cableIds).toEqual([])
  expect(p.circuits).toEqual([])
  expect(deleteLines(p, false).cutsTitle).toBe('No circuit runs through it.')
})

it('writes the confirm text for installed and for proposed equipment', () => {
  const p = equipmentDeletePreview(snapshot, index, idOf('PANEL-A'))!
  const installed = deleteLines(p, false)
  expect(installed.title).toBe('Delete PANEL-A?')
  expect(installed.headline).toBe(
    'Removes PANEL-A, its 48 positions and their front/rear bridges and 6 cables (A01, A02, A05, A06, A09, A10).',
  )
  expect(installed.cutsTitle).toBe('Cuts 3 circuits:')
  expect(installed.footer).toContain('unchanged until the plan is recorded')
  const proposed = deleteLines(p, true)
  expect(proposed.headline).toContain(
    'only in this plan, so its addition is dropped',
  )
  expect(proposed.footer).toBe('')
  const edge = deleteLines(
    equipmentDeletePreview(snapshot, index, idOf('EDGE-17'))!,
    false,
  )
  expect(edge.headline).toContain('its 24 ports and 3 cables')
  expect(edge.headline).not.toContain('bridges')
})

it('disconnect words name the cut circuit, or say none runs through', () => {
  const a = disconnectLines(snapshot, index, 'A03', false)
  expect(a.title).toBe('Disconnect A03?')
  expect(a.cuts).toBe('Cuts EDGE-17 port 1 → AGG-03 port 1.')
  expect(disconnectLines(snapshot, index, 'A03', true).headline).toContain(
    'proposed cable is dropped',
  )
  const cut: Snapshot = {
    ...snapshot,
    links: snapshot.links.filter((l) => l.id !== 'A02'),
  }
  expect(disconnectLines(cut, indexSnapshot(cut), 'A01', false).cuts).toBe(
    'No complete circuit runs through it.',
  )
})

it('scale probe: a campus-sized request is computed in well under a second, once per request', () => {
  // About 1,700 equipment and 51,000 endpoints: 1,500 access switches of 24 ports
  // cabled through 30 panels to 60 aggregation switches.
  const equipment: Snapshot['equipment'] = []
  const endpoints: Endpoint[] = []
  const links: Link[] = []
  let cable = 0
  const cableBetween = (a: string, b: string) =>
    links.push({ id: `c${++cable}`, a, b, kind: 'cable' })
  for (let p = 0; p < 30; p++) {
    equipment.push({
      id: `pan${p}`,
      name: `PAN-${p}`,
      kind: 'panel',
      role: 'passive',
      rackId: 'r',
      unit: 1,
      height: 1,
    })
    for (let n = 1; n <= 768; n++)
      for (const side of ['front', 'rear'] as const) {
        const id = `pan${p}:${n}:${side[0]}`
        endpoints.push({
          id,
          equipmentId: `pan${p}`,
          label: `${n} ${side}`,
          position: n,
          side,
        })
        if (side === 'rear')
          links.push({
            id: `b${p}:${n}`,
            a: `pan${p}:${n}:f`,
            b: id,
            kind: 'internal',
          })
      }
  }
  for (let a = 0; a < 60; a++) {
    equipment.push({
      id: `agg${a}`,
      name: `AGG-${a}`,
      kind: 'switch',
      role: 'aggregation',
      networkId: 'n',
      rackId: 'r',
      unit: 1,
      height: 1,
    })
    for (let n = 1; n <= 24; n++)
      endpoints.push({
        id: `agg${a}:p${n}`,
        equipmentId: `agg${a}`,
        label: `Port ${n}`,
      })
  }
  for (let e = 0; e < 1500; e++) {
    equipment.push({
      id: `sw${e}`,
      name: `SW-${e}`,
      kind: 'switch',
      role: 'access',
      networkId: 'n',
      rackId: 'r',
      unit: 1,
      height: 1,
    })
    for (let n = 1; n <= 24; n++) {
      endpoints.push({
        id: `sw${e}:p${n}`,
        equipmentId: `sw${e}`,
        label: `Port ${n}`,
      })
    }
    // The first 12 ports of each switch go through panel e % 30 to an AGG port.
    for (let n = 1; n <= 12; n++) {
      const pos = ((e * 12 + n) % 768) + 1
      const panel = `pan${e % 30}`
      cableBetween(`sw${e}:p${n}`, `${panel}:${pos}:f`)
      cableBetween(`${panel}:${pos}:r`, `agg${(e + n) % 60}:p${(n % 24) + 1}`)
    }
  }
  const campus: Snapshot = {
    ...snapshot,
    equipment,
    endpoints,
    links,
    subpanels: [],
  }
  const started = performance.now()
  const i = indexSnapshot(campus)
  const indexed = performance.now() - started
  const t = performance.now()
  const p = equipmentDeletePreview(campus, i, 'pan0')!
  const elapsed = performance.now() - t
  expect(p.endpointCount).toBe(1536)
  expect(p.cableIds.length).toBeGreaterThan(0)
  expect(p.circuits.length).toBeGreaterThan(0)
  // First request builds the bridge map; a second one is quicker still.
  const t2 = performance.now()
  equipmentDeletePreview(campus, i, 'pan1')
  console.log(
    `deletePreview scale: ${campus.endpoints.length} endpoints, index ${indexed.toFixed(0)} ms, first preview ${elapsed.toFixed(0)} ms, second ${(performance.now() - t2).toFixed(0)} ms`,
  )
  expect(elapsed).toBeLessThan(1000)
}, 30000)
