import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { buildOverview } from './overview'
import { indexSnapshot } from './snapshotIndex'

const build = (s: Snapshot, opts: Parameters<typeof buildOverview>[1] = {}) =>
  buildOverview(indexSnapshot(s), opts)

/** Cables counted by hand from the raw snapshot: endpoint -> equipment -> rack -> node. */
function countCables(s: Snapshot) {
  const owner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId]))
  const rack = new Map(s.equipment.map((e) => [e.id, e.rackId]))
  const node = new Map(s.racks.map((r) => [r.id, r.nodeId]))
  const nodeOf = (endpoint: string) => node.get(rack.get(owner.get(endpoint)!)!)
  const pairs = new Map<string, number>()
  let inside = 0
  for (const l of s.links) {
    if (l.kind !== 'cable') continue
    const a = nodeOf(l.a)
    const b = nodeOf(l.b)
    if (!a || !b) continue
    if (a === b) inside++
    else {
      const key = [a, b].sort().join('|')
      pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }
  }
  return { pairs, inside }
}

describe('CM-02 overview cards', () => {
  const o = build(acceptanceSnapshot())
  const node = (id: string) => o.nodes.find((n) => n.id === id)!

  it('has one card per node, by site then name', () => {
    expect(o.nodes.map((n) => n.id)).toEqual([
      'node-dr1',
      'node-dr2',
      'node-a',
      'node-core',
      'node-sm',
    ])
    expect(o.sites.map((x) => x.id)).toEqual(['site-dr', 'site-main'])
  })

  it('counts equipment per node and reads tags from explicit roles', () => {
    expect(node('node-a')).toMatchObject({
      equipmentCount: 2,
      tags: {
        access: true,
        aggregation: false,
        backbone: false,
        passiveOnly: false,
      },
    })
    expect(node('node-sm')).toMatchObject({
      equipmentCount: 1,
      tags: { access: false, passiveOnly: true },
    })
    expect(node('node-core')).toMatchObject({
      equipmentCount: 5,
      tags: { aggregation: true, backbone: true, passiveOnly: false },
    })
    expect(node('node-dr2')).toMatchObject({
      equipmentCount: 1,
      tags: { aggregation: true, backbone: false },
    })
    expect(o.unplaced).toBe(0)
  })

  it('a node with no equipment is not passive-only', () => {
    const s = acceptanceSnapshot()
    s.nodes.push({ id: 'node-empty', siteId: 'site-main', name: 'Empty' })
    const empty = build(s).nodes.find((n) => n.id === 'node-empty')!
    expect(empty.equipmentCount).toBe(0)
    expect(empty.tags.passiveOnly).toBe(false)
  })

  it('counts equipment in no known node as unplaced and off the overview', () => {
    const s = acceptanceSnapshot()
    s.equipment.push({
      id: 'LOST',
      name: 'LOST',
      kind: 'switch',
      role: 'access',
      rackId: 'rack-gone',
      unit: 1,
      height: 1,
    })
    const lost = build(s)
    expect(lost.unplaced).toBe(1)
    expect(lost.nodes.reduce((n, x) => n + x.equipmentCount, 0)).toBe(11)
  })

  it('marks proposed nodes only when the installed node IDs are given', () => {
    expect(o.nodes.some((n) => n.proposed)).toBe(false)
    const installed = new Set(['node-a', 'node-sm', 'node-core', 'node-dr1'])
    const withSet = build(acceptanceSnapshot(), { installedNodeIds: installed })
    expect(withSet.nodes.filter((n) => n.proposed).map((n) => n.id)).toEqual([
      'node-dr2',
    ])
  })
})

describe('CM-03 pairs are the real cables', () => {
  const s = acceptanceSnapshot()
  const o = build(s)

  it('matches a hand count of the fixture, within and between sites', () => {
    const real = countCables(s)
    expect(real.inside).toBe(7)
    const got = new Map(o.pairs.map((p) => [p.nodeIds.join('|'), p.count]))
    expect(got).toEqual(real.pairs)
    expect(o.pairs.reduce((n, p) => n + p.count, 0) + real.inside).toBe(16)
    for (const p of o.pairs) {
      expect(p.linkIds).toHaveLength(p.count)
      expect(p.nodeIds).toEqual([...p.nodeIds].sort())
    }
  })

  it('has cross-site pairs and mixed networks have no single network', () => {
    const cross = o.pairs.filter(
      (p) => p.nodeIds.join('|') === 'node-dr1|node-sm',
    )
    expect(cross).toHaveLength(1)
    expect(cross[0].networkId).toBe('B')
    const mixed = o.pairs.find(
      (p) => p.nodeIds.join('|') === 'node-core|node-sm',
    )!
    expect(mixed.count).toBe(4)
    expect(mixed.networkId).toBeUndefined()
    expect(Object.fromEntries(mixed.perNetwork)).toEqual({ A: 3, B: 1 })
  })

  it('a cable inside one node is not a pair; a cable to no known node is not counted', () => {
    const copy = acceptanceSnapshot()
    copy.links.push({
      id: 'X1',
      kind: 'cable',
      a: 'PANEL-A:7:f',
      b: 'EDGE-17:p9',
    })
    copy.equipment.push({
      id: 'LOST',
      name: 'LOST',
      kind: 'switch',
      role: 'access',
      networkId: 'A',
      rackId: 'rack-gone',
      unit: 1,
      height: 1,
    })
    copy.endpoints.push({ id: 'LOST:p1', equipmentId: 'LOST', label: '1' })
    copy.links.push({
      id: 'X2',
      kind: 'cable',
      a: 'LOST:p1',
      b: 'HDF-01:4A/1:f',
    })
    const after = build(copy)
    expect(after.pairs.map((p) => [p.nodeIds.join('|'), p.count])).toEqual(
      o.pairs.map((p) => [p.nodeIds.join('|'), p.count]),
    )
  })

  it('a second cable between the same nodes adds to the count', () => {
    const copy = acceptanceSnapshot()
    copy.links.push({
      id: 'X3',
      kind: 'cable',
      a: 'HDF-02:3C/1:f',
      b: 'AGG-12:p2',
    })
    copy.endpoints.push({
      id: 'HDF-02:3C/1:f',
      equipmentId: 'HDF-02',
      label: '3C/1 front',
      position: 1,
      side: 'front',
    })
    const pair = build(copy).pairs.find(
      (p) => p.nodeIds.join('|') === 'node-core|node-dr2',
    )!
    expect(pair.count).toBe(2)
  })
})

describe('CM-04 the network selector dims and never hides', () => {
  const s = acceptanceSnapshot()
  const dimmedNodes = (networkId: string) =>
    build(s, { networkId })
      .nodes.filter((n) => n.dimmed)
      .map((n) => n.id)

  it('Network B dims the Network-A-only node but not nodes with shared passive equipment', () => {
    expect(dimmedNodes('B')).toEqual(['node-a'])
  })

  it('Network A dims the Network-B-only nodes; HDF-01 carries both so North Sub-main stays', () => {
    expect(dimmedNodes('A')).toEqual(['node-dr1', 'node-dr2'])
  })

  it('never removes a node or a pair, and no filter dims nothing', () => {
    const all = build(s)
    const b = build(s, { networkId: 'B' })
    expect(b.nodes.map((n) => n.id)).toEqual(all.nodes.map((n) => n.id))
    expect(b.pairs.map((p) => p.nodeIds)).toEqual(
      all.pairs.map((p) => p.nodeIds),
    )
    expect(all.nodes.some((n) => n.dimmed)).toBe(false)
    expect(all.pairs.some((p) => p.dimmed)).toBe(false)
  })

  it('dims pairs with no cable of the network', () => {
    const b = build(s, { networkId: 'B' })
    const dimmed = b.pairs
      .filter((p) => p.dimmed)
      .map((p) => p.nodeIds.join('|'))
    expect(dimmed).toEqual(['node-a|node-sm'])
  })
})
