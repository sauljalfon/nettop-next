import { describe, expect, it } from 'vitest'
import { piecesText } from '../../shared/textPieces'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { buildProblems } from './problems'

/** INV-09. The acceptance fixture has switches without serial numbers and nothing else wrong. */
const base = acceptanceSnapshot()
const SWITCHES = base.equipment.filter((e) => e.kind === 'switch')

/** The fixture with every switch given a serial number: a clean snapshot. */
const clean = (): Snapshot => ({
  ...base,
  equipment: base.equipment.map((e) =>
    e.kind === 'switch' ? { ...e, serialNumber: `SN-${e.id}` } : e,
  ),
})
const problemsOf = (s: Snapshot, installed = s) =>
  buildProblems(
    s,
    indexSnapshot(s),
    new Set(installed.equipment.map((e) => e.id)),
  )
const keysOf = (s: Snapshot) => problemsOf(s).map((p) => p.key)

describe('INV-09 problems', () => {
  it('finds only the missing serial numbers on the acceptance fixture, and nothing on a clean one', () => {
    expect(keysOf(base)).toEqual(SWITCHES.map((e) => `serial:${e.id}`))
    expect(problemsOf(clean())).toEqual([])
  })

  it('is empty for an empty installed root', () => {
    const none: Snapshot = {
      ...base,
      sites: [],
      nodes: [],
      racks: [],
      equipment: [],
      endpoints: [],
      links: [],
      subpanels: [],
    }
    expect(problemsOf(none)).toEqual([])
  })

  it('flags a cable whose ends carry different networks, on its A end’s equipment', () => {
    const s = clean()
    s.links = [
      ...s.links,
      { id: 'X01', kind: 'cable', a: 'EDGE-22:p2', b: 'AGG-03:p2' },
    ]
    const [p] = problemsOf(s)
    expect(problemsOf(s)).toHaveLength(1)
    expect(p).toMatchObject({
      key: 'networks:X01',
      equipmentId: 'EDGE-22',
      endpointId: 'EDGE-22:p2',
      cableId: 'X01',
      proposed: false,
      i: 0,
    })
    expect(p.values).toMatchObject({
      what: 'EDGE-22',
      problem: 'A circuit joins two networks',
      site: 'DR Site',
      node: 'DR Access',
    })
    expect(p.values.detail).toBe(
      'X01: Network B at EDGE-22 2 ↔ Network A at AGG-03 2',
    )
  })

  it('keeps the networks, equipment and ports of the detail as pieces of their own', () => {
    const s = clean()
    s.networks = s.networks.map((n) =>
      n.id === 'B' ? { ...n, name: 'רשת ב' } : n,
    )
    s.links = [
      ...s.links,
      { id: 'X01', kind: 'cable', a: 'EDGE-22:p2', b: 'AGG-03:p2' },
    ]
    const [p] = problemsOf(s)
    const pieces = p.parts!.detail
    expect(piecesText(pieces)).toBe(p.values.detail)
    const names = pieces.flatMap((x) => ('name' in x ? [x.name] : []))
    expect(names).toEqual(['רשת ב', 'EDGE-22', '2', 'Network A', 'AGG-03', '2'])
  })

  it('reports it at any role: an AGG to a BB of another network', () => {
    const s = clean()
    s.links = [
      ...s.links,
      { id: 'X02', kind: 'cable', a: 'AGG-12:p5', b: 'BB-01:p5' },
    ]
    expect(keysOf(s)).toEqual(['networks:X02'])
  })

  it('does not flag a cable with an unnetworked end or the same network', () => {
    const s = clean()
    s.links = [
      ...s.links,
      { id: 'X03', kind: 'cable', a: 'AGG-03:p5', b: 'AGG-08:p5' },
      { id: 'X04', kind: 'cable', a: 'AGG-03:p6', b: 'PANEL-A:9:f' },
    ]
    expect(keysOf(s)).toEqual([])
  })

  it('flags a faulty or disabled port that has a cable, not one without', () => {
    const s = clean()
    s.endpoints = s.endpoints.map((p) =>
      p.id === 'EDGE-17:p1'
        ? { ...p, state: 'faulty' as const }
        : p.id === 'AGG-03:p1'
          ? { ...p, state: 'disabled' as const }
          : p.id === 'EDGE-17:p20'
            ? { ...p, state: 'faulty' as const }
            : p,
    )
    const rows = problemsOf(s)
    expect(rows.map((r) => r.key)).toEqual([
      'port:EDGE-17:p1',
      'port:AGG-03:p1',
    ])
    expect(rows[0]).toMatchObject({
      equipmentId: 'EDGE-17',
      endpointId: 'EDGE-17:p1',
      cableId: 'A01',
    })
    expect(rows[0].values).toMatchObject({
      what: 'EDGE-17',
      problem: 'A faulty port has a cable',
      detail: '1 is faulty and carries A01',
    })
    expect(rows[1].values.problem).toBe('A disabled port has a cable')
    expect(rows[1].values.detail).toBe('1 is disabled and carries A04')
    expect(piecesText(rows[0].parts!.detail)).toBe(rows[0].values.detail)
  })

  it('lists every equipment sharing an IP address and names the others', () => {
    const s = clean()
    s.equipment = s.equipment.map((e) =>
      e.id === 'AGG-03' || e.id === 'AGG-08' || e.id === 'AGG-15'
        ? { ...e, ipAddress: e.id === 'AGG-15' ? ' 10.0.0.5 ' : '10.0.0.5' }
        : e.id === 'BB-01'
          ? { ...e, ipAddress: '10.0.0.6' }
          : e,
    )
    const rows = problemsOf(s)
    expect(rows.map((r) => r.key)).toEqual([
      'ip:AGG-03',
      'ip:AGG-08',
      'ip:AGG-15',
    ])
    expect(rows[0].values.problem).toBe('The same IP address twice')
    expect(rows[0].values.detail).toBe('10.0.0.5 is also AGG-08, AGG-15')
    expect(rows[2].values.detail).toBe('10.0.0.5 is also AGG-03, AGG-08')
  })

  it('keeps Hebrew equipment names apart in the IP detail', () => {
    const s = clean()
    s.equipment = s.equipment.map((e) =>
      e.id === 'AGG-03'
        ? { ...e, name: 'מתג ליבה 3', ipAddress: '10.1.1.1' }
        : e.id === 'AGG-08'
          ? { ...e, ipAddress: '10.1.1.1' }
          : e,
    )
    const rows = problemsOf(s)
    expect(rows.map((r) => r.values.what)).toEqual(['מתג ליבה 3', 'AGG-08'])
    expect(rows[1].parts!.detail).toContainEqual({ name: 'מתג ליבה 3' })
  })

  it('flags a switch with no serial number, not a panel or an HDF', () => {
    const s = clean()
    s.equipment = s.equipment.map((e) =>
      e.id === 'AGG-15' ? { ...e, serialNumber: '  ' } : e,
    )
    const rows = problemsOf(s)
    expect(rows.map((r) => r.key)).toEqual(['serial:AGG-15'])
    expect(rows[0].values.problem).toBe('A switch has no serial number')
    expect(rows[0].values.detail).toBe('Fill it in with Edit details')
    expect(rows[0].equipmentId).toBe('AGG-15')
    expect(rows[0].endpointId).toBeUndefined()
  })

  it('numbers the rows in the order of the rules, with keys that do not depend on position', () => {
    const s = clean()
    s.links = [
      ...s.links,
      { id: 'X01', kind: 'cable', a: 'EDGE-22:p2', b: 'AGG-03:p2' },
    ]
    s.equipment = s.equipment.map((e) =>
      e.id === 'AGG-15' ? { ...e, serialNumber: '' } : e,
    )
    const rows = problemsOf(s)
    expect(rows.map((r) => [r.i, r.key])).toEqual([
      [0, 'networks:X01'],
      [1, 'serial:AGG-15'],
    ])
    // Removing the first problem does not change the key of the other.
    s.links = s.links.filter((l) => l.id !== 'X01')
    expect(keysOf(s)).toEqual(['serial:AGG-15'])
  })

  it('marks a problem on equipment the plan adds as proposed', () => {
    const planned: Snapshot = { ...base, context: 'planned' }
    const rows = problemsOf(planned, {
      ...base,
      equipment: base.equipment.filter((e) => e.id !== 'AGG-15'),
    })
    expect(rows.find((r) => r.key === 'serial:AGG-15')!.proposed).toBe(true)
    expect(rows.find((r) => r.key === 'serial:AGG-03')!.proposed).toBe(false)
  })

  it('gives each row the icon of its equipment', () => {
    const s = clean()
    s.equipment = s.equipment.map((e) =>
      e.id === 'AGG-15' ? { ...e, serialNumber: '' } : e,
    )
    expect(problemsOf(s).map((r) => r.icon)).toEqual(['switch'])
  })
})
