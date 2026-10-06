import { describe, expect, it } from 'vitest'
import { agg03Route } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { routeMarks } from './inventory'
import { nodeConnections } from './connections'
import { defaultNodeLayout, NODE_HEIGHT, NODE_WIDTH } from './layout'

const s = physicalSnapshot()
const index = indexSnapshot(s)

describe('PHY-12 node connections are counted from real cables', () => {
  const main = nodeConnections(index, 'site-main')
  const pair = (a: string, b: string) =>
    main.pairs.find((p) => p.nodeIds.join() === [a, b].sort().join())

  it('Building A <-> North Sub-main: 3 cables, Network A', () => {
    const p = pair('node-a', 'node-sm')!
    expect(p.linkIds).toEqual(['A02', 'A06', 'A10'])
    expect(p.networkId).toBe('A')
    expect(p.perNetwork.get('A')).toBe(3)
  })

  it('North Sub-main <-> Main Distribution: 4 cables, mixed so no single network', () => {
    const p = pair('node-sm', 'node-core')!
    expect(p.linkIds).toEqual(['A03', 'A07', 'A11', 'B03'])
    expect(p.networkId).toBeUndefined()
    expect(p.perNetwork.get('A')).toBe(3)
    expect(p.perNetwork.get('B')).toBe(1)
  })

  it('has exactly those two lines inside Main Campus', () => {
    expect(main.pairs).toHaveLength(2)
  })

  it('counts cables inside a node (both ends in it)', () => {
    expect(main.byNode.get('node-a')?.inside).toBe(3) // A01, A05, A09
    expect(main.byNode.get('node-core')?.inside).toBe(3) // A04, A08, A12
    expect(main.byNode.get('node-sm')?.inside).toBe(0)
  })

  it('counts cables to other sites per node and lists them', () => {
    const sm = main.byNode.get('node-sm')!
    expect(sm.otherSites).toBe(1)
    expect(sm.otherSiteLinkIds).toEqual(['B02'])
    const core = main.byNode.get('node-core')!
    expect(core.otherSiteLinkIds).toEqual(['B04'])
    expect(main.byNode.get('node-a')?.otherSites).toBe(0)
  })

  it('DR Access <-> DR Distribution has no line', () => {
    const dr = nodeConnections(index, 'site-dr')
    expect(dr.pairs).toHaveLength(0)
    expect(dr.byNode.get('node-dr1')?.inside).toBe(1) // B01
    expect(dr.byNode.get('node-dr1')?.otherSiteLinkIds).toEqual(['B02'])
    expect(dr.byNode.get('node-dr2')?.otherSiteLinkIds).toEqual(['B04'])
  })

  it('marks the line that carries a cable of the selected route', () => {
    const marks = routeMarks(index, agg03Route())
    const withRoute = nodeConnections(index, 'site-main', marks)
    const a = withRoute.pairs.find((p) => p.nodeIds.includes('node-a'))!
    expect(a.onRoute).toBe(true)
    expect(
      nodeConnections(index, 'site-main').pairs.some((p) => p.onRoute),
    ).toBe(false)
  })

  it('resolves through equipment, rack and node, never names', () => {
    // Move AGG-12 into a Main Campus rack by ID: B04 becomes a line, no matter its name.
    const moved = {
      ...s,
      equipment: s.equipment.map((e) =>
        e.id === 'AGG-12' ? { ...e, rackId: 'rack-core-03' } : e,
      ),
    }
    const c = nodeConnections(indexSnapshot(moved), 'site-main')
    expect(c.pairs.some((x) => x.linkIds.includes('B04'))).toBe(false)
    expect(c.byNode.get('node-core')?.inside).toBe(4) // B04 is inside now
  })
})

describe('PHY-13 default layout places unsaved nodes without overlapping saved ones', () => {
  const nodes = [
    { id: 'n1', name: 'Charlie' },
    { id: 'n2', name: 'Alpha' },
    { id: 'n3', name: 'Bravo' },
    { id: 'n4', name: 'Delta' },
    { id: 'n5', name: 'Echo' },
  ]
  const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT

  it('lays out every node deterministically by name when none is saved', () => {
    const a = defaultNodeLayout(nodes, new Map())
    const b = defaultNodeLayout([...nodes].reverse(), new Map())
    expect(a.size).toBe(5)
    expect(b).toEqual(a)
    expect(a.get('n2')).toEqual({ x: 0, y: 0 }) // Alpha first
    expect(a.get('n3')!.x).toBeGreaterThan(a.get('n2')!.x) // Bravo next
  })

  it('returns positions only for unsaved nodes', () => {
    const saved = new Map([['n1', { x: 10, y: 10 }]])
    const r = defaultNodeLayout(nodes, saved)
    expect(r.has('n1')).toBe(false)
    expect(r.size).toBe(4)
  })

  it('never overlaps saved nodes or each other, even saved ones far down or far left', () => {
    const saved = new Map([
      ['n1', { x: 0, y: 0 }],
      ['n2', { x: 300, y: 500 }],
      ['n3', { x: -900, y: 40 }],
    ])
    const r = defaultNodeLayout(nodes, saved)
    const all = [...saved.values(), ...[...r.values()]]
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(overlap(all[i], all[j])).toBe(false)
    for (const p of r.values()) expect(p.y).toBeGreaterThan(500) // below every saved node
  })

  it('does not move saved positions when more nodes appear', () => {
    const first = defaultNodeLayout(nodes.slice(0, 2), new Map())
    const saved = new Map(first)
    const later = defaultNodeLayout(nodes.slice(0, 3), saved)
    expect(later.size).toBe(1)
  })
})
