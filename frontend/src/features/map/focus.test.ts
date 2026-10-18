import { describe, expect, it } from 'vitest'
import type { Endpoint, Equipment, Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { campusSnapshot } from './campusFixture'
import { buildFocus } from './focus'
import { indexSnapshot } from './snapshotIndex'

const focus = (
  s: Snapshot,
  center: string,
  opts?: Parameters<typeof buildFocus>[2],
) => buildFocus(indexSnapshot(s), center, opts)

const ids = (xs: { equipmentId: string }[]) => xs.map((x) => x.equipmentId)

describe('CM-06 focus on EDGE-17', () => {
  const f = focus(acceptanceSnapshot(), 'EDGE-17')
  const ring = f.rings[0]

  it('shows AGG-03, AGG-08 and BB-01 on the right, in name order, and not AGG-15', () => {
    expect(f.centerId).toBe('EDGE-17')
    expect(f.rings).toHaveLength(1)
    expect(ids(ring.neighbours)).toEqual(['AGG-03', 'AGG-08', 'BB-01'])
    expect(ring.neighbours.map((n) => n.side)).toEqual([
      'right',
      'right',
      'right',
    ])
    expect(ring.groups).toEqual([])
  })

  it('AGG-03: one circuit via PANEL-A 1, HDF-01 3C/5, HDF-02 2B/3 as structured steps', () => {
    const agg = ring.neighbours[0]
    expect(agg.circuits).toHaveLength(1)
    expect(agg.circuits[0]).toEqual({
      start: 'EDGE-17:p1',
      end: 'AGG-03:p1',
      via: [
        { equipmentId: 'PANEL-A', place: '1' },
        { equipmentId: 'HDF-01', place: '3C/5' },
        { equipmentId: 'HDF-02', place: '2B/3' },
      ],
      linkIds: [
        'A01',
        'PANEL-A:1:bridge',
        'A02',
        'HDF-01:3C/5:bridge',
        'A03',
        'HDF-02:2B/3:bridge',
        'A04',
      ],
    })
    expect(ring.neighbours[1].circuits[0].via.map((v) => v.place)).toEqual([
      '2',
      '1A/2',
      '1D/2',
    ])
    expect(ring.neighbours[2].circuits[0].via.map((v) => v.place)).toEqual([
      '3',
      '2D/4',
      '3A/1',
    ])
  })

  it('does not list uncabled ports as ends: they are not circuits', () => {
    expect(f.ends).toEqual([])
  })

  it('lists a cable that leads nowhere as a free end, without repeating its last equipment in via', () => {
    const s = acceptanceSnapshot()
    s.links.push({ id: 'X1', kind: 'cable', a: 'EDGE-17:p5', b: 'PANEL-A:5:f' })
    const free = focus(s, 'EDGE-17').ends.find((e) => e.start === 'EDGE-17:p5')!
    expect(free.end).toEqual({ kind: 'free', endpointId: 'PANEL-A:5:r' })
    expect(free.via).toEqual([])
    expect(focus(s, 'EDGE-17').rings[0].neighbours).toHaveLength(3)
  })

  it('merges several circuits to one equipment into one neighbour, in port order', () => {
    const s = acceptanceSnapshot()
    s.links.push({ id: 'X2', kind: 'cable', a: 'EDGE-17:p4', b: 'AGG-03:p2' })
    const merged = focus(s, 'EDGE-17').rings[0]
    expect(ids(merged.neighbours)).toEqual(['AGG-03', 'AGG-08', 'BB-01'])
    const agg = merged.neighbours[0]
    expect(agg.circuits.map((c) => c.start)).toEqual([
      'EDGE-17:p1',
      'EDGE-17:p4',
    ])
    expect(agg.circuits[1]).toMatchObject({
      end: 'AGG-03:p2',
      via: [],
      linkIds: ['X2'],
    })
  })

  it('terminates on a loop', () => {
    const s = acceptanceSnapshot()
    // A cycle through PANEL-A positions 20-22: the walk must stop, not spin.
    s.links.push(
      { id: 'L1', kind: 'cable', a: 'PANEL-A:20:r', b: 'PANEL-A:21:f' },
      { id: 'L2', kind: 'cable', a: 'PANEL-A:21:r', b: 'PANEL-A:22:f' },
      { id: 'L3', kind: 'cable', a: 'PANEL-A:22:r', b: 'PANEL-A:20:f' },
    )
    const f2 = focus(s, 'PANEL-A')
    expect(f2.rings[0].neighbours.length).toBeGreaterThan(0)
    const loop = f2.ends.find((e) => e.start === 'PANEL-A:20:f')!
    expect(loop.end.kind).toBe('free')
    expect(loop.via.every((v) => v.equipmentId !== 'PANEL-A')).toBe(true)
    const viaEdge = focus(s, 'EDGE-17')
    expect(ids(viaEdge.rings[0].neighbours)).toEqual([
      'AGG-03',
      'AGG-08',
      'BB-01',
    ])
  })
})

describe('CM-07 focus on a panel and on an HDF', () => {
  it('PANEL-A walks both sides: EDGE-17 on the left, the AGGs and BB on the right', () => {
    const f = focus(acceptanceSnapshot(), 'PANEL-A')
    const n = f.rings[0].neighbours
    expect(n.map((x) => [x.equipmentId, x.side])).toEqual([
      ['EDGE-17', 'left'],
      ['AGG-03', 'right'],
      ['AGG-08', 'right'],
      ['BB-01', 'right'],
    ])
    const edge = n[0].circuits
    expect(edge.map((c) => [c.start, c.end])).toEqual([
      ['PANEL-A:1:f', 'EDGE-17:p1'],
      ['PANEL-A:2:f', 'EDGE-17:p2'],
      ['PANEL-A:3:f', 'EDGE-17:p3'],
    ])
    expect(edge[0].via).toEqual([])
    expect(n[1].circuits[0]).toMatchObject({
      start: 'PANEL-A:1:r',
      end: 'AGG-03:p1',
      via: [
        { equipmentId: 'HDF-01', place: '3C/5' },
        { equipmentId: 'HDF-02', place: '2B/3' },
      ],
    })
  })

  it('HDF-01 walks both sides: EDGE-17 and EDGE-22 on the left, the AGGs, AGG-12 and BB on the right', () => {
    const f = focus(acceptanceSnapshot(), 'HDF-01')
    const n = f.rings[0].neighbours
    expect(n.map((x) => [x.equipmentId, x.side])).toEqual([
      ['EDGE-17', 'left'],
      ['EDGE-22', 'left'],
      ['AGG-03', 'right'],
      ['AGG-08', 'right'],
      ['AGG-12', 'right'],
      ['BB-01', 'right'],
    ])
    const agg3 = n[2].circuits[0]
    expect(agg3.start).toBe('HDF-01:3C/5:f')
    expect(agg3.via).toEqual([{ equipmentId: 'HDF-02', place: '2B/3' }])
    // Ends are ordered by subpanel row, column, position, front first.
    const s = acceptanceSnapshot()
    s.links.push(
      { id: 'D3', kind: 'cable', a: 'HDF-01:4A/2:f', b: 'PANEL-A:12:f' },
      { id: 'D2', kind: 'cable', a: 'HDF-01:4A/1:r', b: 'PANEL-A:11:f' },
      { id: 'D1', kind: 'cable', a: 'HDF-01:4A/1:f', b: 'PANEL-A:10:f' },
    )
    const order = focus(s, 'HDF-01').ends.map((e) => e.start)
    expect(order).toHaveLength(3)
    expect(order.indexOf('HDF-01:4A/1:f')).toBeLessThan(
      order.indexOf('HDF-01:4A/1:r'),
    )
    expect(order.indexOf('HDF-01:4A/1:r')).toBeLessThan(
      order.indexOf('HDF-01:4A/2:f'),
    )
  })

  it('a reserved or faulty port changes nothing (locked 6)', () => {
    const before = focus(acceptanceSnapshot(), 'EDGE-17')
    const s = acceptanceSnapshot()
    const set = (id: string, state: Endpoint['state']) => {
      s.endpoints.find((p) => p.id === id)!.state = state
    }
    set('EDGE-17:p1', 'faulty')
    set('AGG-03:p1', 'reserved')
    set('EDGE-17:p2', 'disabled')
    set('PANEL-A:1:f', 'faulty')
    expect(focus(s, 'EDGE-17')).toEqual(before)
    expect(focus(s, 'PANEL-A')).toEqual(focus(acceptanceSnapshot(), 'PANEL-A'))
  })
})

describe('CM-08 caps, groups and hops', () => {
  const s = campusSnapshot()

  it('groups more than 24 neighbours per node and side; neighbours is empty', () => {
    const ring = focus(s, 'AGG-1').rings[0]
    expect(ring.neighbours).toEqual([])
    expect(
      ring.groups.map((g) => [g.nodeId, g.side, g.equipmentIds.length]),
    ).toEqual([
      ['n-1', 'left', 10],
      ['n-2', 'left', 10],
      ['n-3', 'left', 10],
    ])
    expect(ring.groups[0].equipmentIds.slice(0, 2)).toEqual(['SW-01', 'SW-04'])
  })

  it('a higher cap shows all 30 neighbours; exactly the cap is not grouped', () => {
    expect(focus(s, 'AGG-1', { cap: 50 }).rings[0].neighbours).toHaveLength(30)
    expect(focus(s, 'AGG-1', { cap: 30 }).rings[0].neighbours).toHaveLength(30)
    expect(focus(s, 'AGG-1', { cap: 29 }).rings[0].groups).toHaveLength(3)
  })

  it('hops 2 from an access switch adds the other access switches once, never the AGG again', () => {
    const f = focus(s, 'SW-01', { hops: 2, cap: 50 })
    expect(f.rings).toHaveLength(2)
    expect(ids(f.rings[0].neighbours)).toEqual(['AGG-1'])
    const second = ids(f.rings[1].neighbours)
    expect(second).toHaveLength(29)
    expect(new Set(second).size).toBe(29)
    expect(second).not.toContain('AGG-1')
    expect(second).not.toContain('SW-01')
  })

  it('the next ring is built from grouped equipment too, with the same cap', () => {
    const f = focus(s, 'AGG-1', { hops: 2 })
    expect(f.rings[0].groups).toHaveLength(3)
    expect(f.rings).toHaveLength(1) // nothing new beyond the 30 switches
  })

  it('clamps hops to 1–3 and never repeats equipment', () => {
    const chain: Snapshot = {
      ...campusSnapshot(),
      equipment: [],
      endpoints: [],
      links: [],
    }
    for (let i = 1; i <= 6; i++) {
      chain.equipment.push({
        id: `S${i}`,
        name: `S${i}`,
        kind: 'switch',
        role: 'access',
        rackId: 'rack-1',
        unit: 1,
        height: 1,
      })
      chain.endpoints.push(
        { id: `S${i}:a`, equipmentId: `S${i}`, label: 'a' },
        { id: `S${i}:b`, equipmentId: `S${i}`, label: 'b' },
      )
      if (i > 1)
        chain.links.push({
          id: `k${i}`,
          kind: 'cable',
          a: `S${i - 1}:b`,
          b: `S${i}:a`,
        })
    }
    expect(focus(chain, 'S1', { hops: 9 }).rings).toHaveLength(3)
    expect(focus(chain, 'S1', { hops: 0 }).rings).toHaveLength(1)
    expect(focus(chain, 'S1').hops).toBe(1)
    expect(focus(chain, 'S1', { hops: 9 }).hops).toBe(3)
    const seen = focus(chain, 'S3', { hops: 3 }).rings.flatMap((r) =>
      ids(r.neighbours),
    )
    expect(seen.sort()).toEqual(['S1', 'S2', 'S4', 'S5', 'S6'])
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('an unknown center gives an empty focus', () => {
    expect(focus(s, 'nope')).toMatchObject({
      centerId: 'nope',
      rings: [],
      ends: [],
    })
  })
})

describe('CM-10 groups say where they come from and how many circuits they hold', () => {
  const s = campusSnapshot()
  it('ring 1 groups come from the center, each with its circuits', () => {
    const groups = focus(s, 'AGG-1').rings[0].groups
    expect(groups.map((g) => [g.fromIds, g.circuitCount])).toEqual([
      [['AGG-1'], 10],
      [['AGG-1'], 10],
      [['AGG-1'], 10],
    ])
  })

  it('ring 2 groups come from the ring 1 equipment, sorted by name', () => {
    const f = focus(s, 'SW-01', { hops: 2 })
    expect(f.rings[0].neighbours.map((n) => n.equipmentId)).toEqual(['AGG-1'])
    const groups = f.rings[1].groups
    expect(groups.map((g) => g.equipmentIds.length)).toEqual([9, 10, 10])
    for (const g of groups) expect(g.fromIds).toEqual(['AGG-1'])
    expect(groups.map((g) => g.circuitCount)).toEqual([9, 10, 10])
  })

  it('several parents are listed once each, by name', () => {
    const t = campusSnapshot()
    // A second AGG cabled to SW-01 and SW-02 directly.
    t.equipment.push({
      id: 'AGG-0',
      name: 'AGG-0',
      kind: 'switch',
      role: 'aggregation',
      networkId: 'A',
      rackId: 'rack-core',
      unit: 2,
      height: 1,
    })
    t.endpoints.push(
      { id: 'AGG-0:p1', equipmentId: 'AGG-0', label: '1' },
      { id: 'AGG-0:p2', equipmentId: 'AGG-0', label: '2' },
      { id: 'SW-01:p2', equipmentId: 'SW-01', label: '2' },
      { id: 'SW-02:p2', equipmentId: 'SW-02', label: '2' },
    )
    t.links.push(
      { id: 'd1', kind: 'cable', a: 'AGG-0:p1', b: 'SW-01:p2' },
      { id: 'd2', kind: 'cable', a: 'AGG-0:p2', b: 'SW-02:p2' },
    )
    const f = focus(t, 'SW-01', { hops: 2, cap: 5 })
    const all = f.rings[1].groups
    expect(all.length).toBeGreaterThan(0)
    for (const g of all) expect(g.fromIds).toEqual([...g.fromIds].sort())
    expect(all.some((g) => g.fromIds.length === 2)).toBe(true)
  })
})
