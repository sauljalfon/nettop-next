import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { buildRows } from './rows'

const build = (
  s: Snapshot,
  installed: Snapshot = s,
): ReturnType<typeof buildRows> =>
  buildRows(
    s,
    indexSnapshot(s),
    new Set(installed.equipment.map((e) => e.id)),
    new Set(installed.links.map((l) => l.id)),
  )

describe('buildRows', () => {
  const s = acceptanceSnapshot()
  const rows = build(s)

  it('has one equipment row per equipment, in snapshot order', () => {
    expect(rows.equipment).toHaveLength(s.equipment.length)
    expect(rows.equipment.map((r) => r.key)).toEqual(
      s.equipment.map((e) => e.id),
    )
    expect(rows.equipment.map((r) => r.i)).toEqual(s.equipment.map((_, i) => i))
    const agg = rows.equipment.find((r) => r.key === 'AGG-03')!
    expect(agg.equipmentId).toBe('AGG-03')
    expect(agg.values).toMatchObject({
      name: 'AGG-03',
      kind: 'Switch',
      role: 'Aggregation',
      net: 'Network A',
      site: 'Main Campus',
      node: 'Main Distribution',
      rack: 'Rack Core 01',
      unit: '1',
    })
    expect(agg.raw.net).toBe('A')
  })

  it('gives passive equipment no network and capitalises the kind', () => {
    const hdf = rows.equipment.find((r) => r.key === 'HDF-01')!
    expect(hdf.values.kind).toBe('HDF')
    expect(hdf.values.role).toBe('Passive')
    expect(hdf.values.net).toBe('')
    expect(hdf.raw.net).toBe('')
    expect(rows.equipment.find((r) => r.key === 'PANEL-A')!.values.kind).toBe(
      'Panel',
    )
  })

  it('has one port row per endpoint, both sides of each position', () => {
    expect(rows.ports).toHaveLength(s.endpoints.length)
    const sides = rows.ports.filter((r) => r.key.startsWith('HDF-01:4A/1'))
    expect(sides.map((r) => r.values.side).sort()).toEqual(['Front', 'Rear'])
    expect(
      rows.ports.filter((r) => r.values.side === '').length,
    ).toBeGreaterThan(0)
  })

  it('orders ports by equipment name, then port order', () => {
    const edge = rows.ports.filter((r) => r.equipmentId === 'EDGE-17')
    expect(edge.map((r) => r.values.port)).toEqual(
      Array.from({ length: 24 }, (_, n) => String(n + 1)),
    )
    const names = rows.ports.map((r) => r.values.equipment)
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    )
    expect(names).toEqual(sorted)
    expect(rows.ports.map((r) => r.i)).toEqual(rows.ports.map((_, i) => i))
  })

  it('orders equipment names numerically, and equal names by port order', () => {
    const named = (names: Record<string, string>): Snapshot => ({
      ...s,
      equipment: s.equipment.map((e) =>
        names[e.id] ? { ...e, name: names[e.id] } : e,
      ),
    })
    const owners = (r: ReturnType<typeof build>, ids: string[]) =>
      r.ports.filter((p) => ids.includes(p.equipmentId))
    const numeric = owners(
      build(named({ 'EDGE-17': 'SW-10', 'EDGE-22': 'SW-9' })),
      ['EDGE-17', 'EDGE-22'],
    )
    expect(numeric[0].equipmentId).toBe('EDGE-22')
    expect(numeric.at(-1)!.equipmentId).toBe('EDGE-17')
    const same = owners(build(named({ 'EDGE-17': 'SW', 'EDGE-22': 'SW' })), [
      'EDGE-17',
      'EDGE-22',
    ])
    expect(same.slice(0, 2).map((p) => p.values.port)).toEqual(['1', '1'])
  })

  it('has one cable row per cable link, never a bridge', () => {
    const cables = s.links.filter((l) => l.kind === 'cable')
    expect(cables.length).toBeLessThan(s.links.length)
    expect(rows.cables).toHaveLength(cables.length)
    expect(rows.cables.map((r) => r.key)).toEqual(cables.map((l) => l.id))
    expect(rows.cables.every((r) => r.cableId === r.key)).toBe(true)
  })

  it('reads a Far end with its side as pieces and text', () => {
    const p = rows.ports.find((r) => r.key === 'PANEL-A:1:f')!
    expect(p.cableId).toBe('A01')
    expect(p.values.cable).toBe('A01')
    expect(p.pieces.far).toEqual({
      equipmentName: 'EDGE-17',
      label: '1',
    })
    expect(p.values.far).toBe('EDGE-17 1')
    const rear = rows.ports.find((r) => r.key === 'PANEL-A:1:r')!
    expect(rear.pieces.far).toEqual({
      equipmentName: 'HDF-01',
      label: '3C/5 rear',
    })
    expect(rear.values.far).toBe('HDF-01 3C/5 rear')
    const free = rows.ports.find((r) => r.key === 'AGG-15:p1')!
    expect(free.pieces.far).toBeUndefined()
    expect(free.values.far).toBe('')
    expect(free.values.cable).toBe('')
    expect(free.cableId).toBeUndefined()
  })

  it('gives a passive port the network of its circuit', () => {
    const mid = rows.ports.find((r) => r.key === 'HDF-01:3C/5:r')!
    expect(mid.raw.net).toBe('A')
    expect(mid.values.net).toBe('Network A')
    const b = rows.ports.find((r) => r.key === 'PANEL-DR:1:f')!
    expect(b.raw.net).toBe('B')
    const unused = rows.ports.find((r) => r.key === 'PANEL-A:24:f')!
    expect(unused.raw.net).toBe('')
    expect(unused.values.net).toBe('')
    expect(rows.ports.find((r) => r.key === 'AGG-03:p5')!.raw.net).toBe('A')
  })

  it('reads A end and B end as pieces, and the network from the A end first', () => {
    const c = rows.cables.find((r) => r.key === 'A02')!
    expect(c.pieces.a).toEqual({
      equipmentName: 'PANEL-A',
      label: '1 rear',
    })
    expect(c.pieces.b).toMatchObject({ equipmentName: 'HDF-01' })
    expect(c.values.a).toBe('PANEL-A 1 rear')
    expect(c.equipmentId).toBe('PANEL-A')
    expect(c.endpointId).toBe('PANEL-A:1:r')
    expect(c.raw.net).toBe('A')
    expect(c.values.net).toBe('Network A')
  })

  it('falls back to the B end for a cable network', () => {
    const t = acceptanceSnapshot()
    // An unconnected-through cable: a passive end with no circuit, B an active switch.
    t.links.push({
      id: 'X01',
      kind: 'cable',
      a: 'PANEL-A:24:f',
      b: 'AGG-08:p9',
    })
    const c = build(t).cables.find((r) => r.key === 'X01')!
    expect(c.raw.net).toBe('A')
  })

  it('gives details their text and the status word', () => {
    const t = acceptanceSnapshot()
    t.equipment[0] = {
      ...t.equipment[0],
      manufacturer: 'Acme',
      model: 'X1',
      serialNumber: 'SN-1',
      ipAddress: '10.0.0.1',
      status: 'maintenance',
    }
    t.endpoints.find((p) => p.id === 'EDGE-17:p1')!.portType = 'fiber'
    t.endpoints.find((p) => p.id === 'EDGE-17:p1')!.state = 'faulty'
    const a01 = t.links.findIndex((l) => l.id === 'A01')
    t.links[a01] = { ...t.links[a01], label: 'Uplink', status: 'testing' }
    const r = build(t)
    expect(r.equipment[0].values).toMatchObject({
      manufacturer: 'Acme',
      model: 'X1',
      serial: 'SN-1',
      ip: '10.0.0.1',
      status: 'Maintenance',
    })
    expect(r.equipment[0].raw.status).toBe('maintenance')
    expect(r.equipment[1].raw.status).toBe('')
    const port = r.ports.find((p) => p.key === 'EDGE-17:p1')!
    expect(port.values).toMatchObject({ type: 'Fiber', state: 'Faulty' })
    expect(port.raw.state).toBe('faulty')
    const cable = r.cables.find((c) => c.key === 'A01')!
    expect(cable.values).toMatchObject({ label: 'Uplink', status: 'Testing' })
    expect(cable.raw.status).toBe('testing')
  })

  it('keeps Hebrew names in values and pieces', () => {
    const t = acceptanceSnapshot()
    t.equipment[0] = { ...t.equipment[0], name: 'מתג-17' }
    t.racks[0] = { ...t.racks[0], name: 'ארון A03' }
    const r = build(t)
    expect(r.equipment[0].values.name).toBe('מתג-17')
    expect(r.equipment[0].values.rack).toBe('ארון A03')
    const port = r.ports.find((p) => p.key === 'PANEL-A:1:f')!
    expect(port.pieces.far?.equipmentName).toBe('מתג-17')
    expect(port.values.far).toBe('מתג-17 1')
  })

  it('has no proposed rows in an installed snapshot', () => {
    for (const list of [rows.equipment, rows.ports, rows.cables])
      expect(list.some((r) => r.proposed)).toBe(false)
  })

  describe('in a planned snapshot', () => {
    const installed = acceptanceSnapshot()
    const planned = acceptanceSnapshot()
    planned.context = 'planned'
    planned.equipment.push({
      id: 'NEW-1',
      name: 'NEW-1',
      kind: 'switch',
      role: 'access',
      networkId: 'A',
      rackId: 'rack-a03',
      unit: 5,
      height: 1,
    })
    planned.endpoints.push(
      { id: 'NEW-1:p1', equipmentId: 'NEW-1', label: '1' },
      { id: 'NEW-1:p2', equipmentId: 'NEW-1', label: '2' },
    )
    planned.links.push({
      id: 'N01',
      kind: 'cable',
      a: 'PANEL-A:24:f',
      b: 'NEW-1:p1',
    })
    // An installed port that only gains a new cable.
    planned.links.push({
      id: 'N02',
      kind: 'cable',
      a: 'EDGE-17:p20',
      b: 'PANEL-A:23:f',
    })
    const r = build(planned, installed)
    const proposed = (list: { key: string; proposed: boolean }[]) =>
      list.filter((x) => x.proposed).map((x) => x.key)

    it('marks added equipment, its ports and the cables added', () => {
      expect(proposed(r.equipment)).toEqual(['NEW-1'])
      expect(proposed(r.cables)).toEqual(['N01', 'N02'])
    })

    it('marks a port when its equipment or its cable is proposed', () => {
      expect(proposed(r.ports).sort()).toEqual(
        [
          'NEW-1:p1',
          'NEW-1:p2',
          'PANEL-A:24:f',
          'EDGE-17:p20',
          'PANEL-A:23:f',
        ].sort(),
      )
    })
  })
})

describe('INV-10 free capacity', () => {
  const s = acceptanceSnapshot()
  const rows = build(s)
  const eq = (id: string) => rows.equipment.find((r) => r.key === id)!

  it('counts a switch’s ports with a cable as used', () => {
    expect(eq('EDGE-17').values).toMatchObject({ used: '3', free: '21' })
    expect(eq('AGG-03').values).toMatchObject({ used: '1', free: '23' })
    expect(eq('AGG-15').values).toMatchObject({ used: '0', free: '24' })
  })

  it('counts a panel or HDF position cabled on either side as used, bridges are not cables', () => {
    // PANEL-A: positions 1–3 are cabled on both sides, 24 positions in all.
    expect(eq('PANEL-A').values).toMatchObject({ used: '3', free: '21' })
    // HDF-01: 3C/5, 1A/2, 2D/4, 3C/2 cabled; 4A/1 and 4A/2 are configured and free.
    expect(eq('HDF-01').values).toMatchObject({ used: '4', free: '2' })
    // A position cabled on one side only is still used (A03 is 3C/5's front cable).
    const t: Snapshot = { ...s, links: s.links.filter((l) => l.id !== 'A03') }
    expect(
      build(t).equipment.find((r) => r.key === 'HDF-01')!.values,
    ).toMatchObject({
      used: '4',
      free: '2',
    })
  })

  it('marks a port Connected Yes or No by its cable', () => {
    const port = (id: string) => rows.ports.find((r) => r.key === id)!
    expect(port('EDGE-17:p1').values.connected).toBe('Yes')
    expect(port('EDGE-17:p9').values.connected).toBe('No')
    expect(port('PANEL-A:1:f').values.connected).toBe('Yes')
    expect(port('PANEL-A:9:r').values.connected).toBe('No')
  })
})

describe('INV-12 the Missing field', () => {
  const s = acceptanceSnapshot()
  const missing = (
    patch: Partial<Snapshot['equipment'][number]>,
    id = 'AGG-03',
  ) => {
    const t: Snapshot = {
      ...s,
      equipment: s.equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }
    return build(t).equipment.find((r) => r.key === id)!
  }

  it('lists a switch’s empty manufacturer, model, serial number and IP address', () => {
    const r = missing({})
    expect(r.lists?.missing).toEqual([
      'Manufacturer',
      'Model',
      'Serial number',
      'IP address',
    ])
    expect(r.values.missing).toBe(
      'Manufacturer, Model, Serial number, IP address',
    )
  })

  it('does not ask a panel for a serial number or an IP address, an HDF only for no IP', () => {
    expect(missing({}, 'PANEL-A').lists?.missing).toEqual([
      'Manufacturer',
      'Model',
    ])
    expect(
      missing({ manufacturer: 'M', model: 'X' }, 'HDF-01').lists?.missing,
    ).toEqual(['Serial number'])
  })

  it('is empty when nothing is missing, and blanks count as missing', () => {
    const full = missing({
      manufacturer: 'Cisco',
      model: 'C9500',
      serialNumber: 'SN1',
      ipAddress: '10.0.0.1',
    })
    expect(full.lists?.missing).toEqual([])
    expect(full.values.missing).toBe('')
    expect(
      missing({
        manufacturer: '  ',
        model: 'X',
        serialNumber: 'S',
        ipAddress: '10.0.0.1',
      }).lists?.missing,
    ).toEqual(['Manufacturer'])
  })
})
