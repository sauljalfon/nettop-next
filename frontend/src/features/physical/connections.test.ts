import { describe, expect, it } from 'vitest'
import { agg03Route } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { routeMarks } from './inventory'
import { nodeConnections } from './connections'
import {
  defaultNodeLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  segmentCrossesRect,
} from './layout'

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

describe('PHY-13 default layout puts unsaved nodes on a ring, clear of saved ones', () => {
  const nodes = [
    { id: 'n1', name: 'Charlie' },
    { id: 'n2', name: 'Alpha' },
    { id: 'n3', name: 'Bravo' },
    { id: 'n4', name: 'Delta' },
    { id: 'n5', name: 'Echo' },
  ]
  const rect = (p: { x: number; y: number }) => ({
    left: p.x,
    top: p.y,
    right: p.x + NODE_WIDTH,
    bottom: p.y + NODE_HEIGHT,
  })
  const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT
  const center = (p: { x: number; y: number }) => ({
    x: p.x + NODE_WIDTH / 2,
    y: p.y + NODE_HEIGHT / 2,
  })
  const named = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id${i}`,
      name: `Node ${String(i).padStart(2, '0')}`,
    }))

  it('lays out every node deterministically, whatever the input order', () => {
    const a = defaultNodeLayout(nodes, new Map())
    const b = defaultNodeLayout([...nodes].reverse(), new Map())
    expect(a.size).toBe(5)
    expect(b).toEqual(a)
  })

  it('centers the ring on the origin, every card the same distance from it', () => {
    const a = defaultNodeLayout(nodes, new Map())
    const cs = [...a.values()].map(center)
    const cx = cs.reduce((n, c) => n + c.x, 0) / cs.length
    const cy = cs.reduce((n, c) => n + c.y, 0) / cs.length
    expect(Math.abs(cx)).toBeLessThan(0.5)
    expect(Math.abs(cy)).toBeLessThan(0.5)
    const radii = cs.map((c) => Math.hypot(c.x, c.y))
    for (const r of radii) expect(Math.abs(r - radii[0])).toBeLessThan(0.5)
  })

  it('goes around in name order, starting at the top, clockwise', () => {
    const a = defaultNodeLayout(nodes, new Map())
    const order = ['n2', 'n3', 'n1', 'n4', 'n5'] // Alpha Bravo Charlie Delta Echo
    const angles = order.map((id) => {
      const c = center(a.get(id)!)
      return (Math.atan2(c.y, c.x) * 180) / Math.PI // 0 = right, 90 = down
    })
    expect(angles[0]).toBeCloseTo(-90, 0) // Alpha at the top
    // Clockwise on screen means increasing angle.
    const unwound = angles.map((g) => (g < -90 ? g + 360 : g))
    expect([...unwound].sort((x, y) => x - y)).toEqual(unwound)
  })

  it('never overlaps for 1 to 12 nodes, and a single node sits at the origin', () => {
    for (let n = 1; n <= 12; n++) {
      const cells = [...defaultNodeLayout(named(n), new Map()).values()]
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++)
          expect(overlap(cells[i], cells[j]), `${n} nodes: ${i}/${j}`).toBe(
            false,
          )
    }
    const one = defaultNodeLayout(named(1), new Map()).get('id0')!
    expect(center(one)).toEqual({ x: 0, y: 0 })
  })

  it('uses a grid for more than 12 nodes, in name order', () => {
    const cells = defaultNodeLayout(named(13), new Map())
    const xs = new Set([...cells.values()].map((p) => p.x))
    const ys = new Set([...cells.values()].map((p) => p.y))
    expect(xs.size).toBe(3)
    expect(ys.size).toBe(5)
    expect(cells.get('id0')).toEqual({ x: 0, y: 0 })
    expect(cells.get('id1')!.y).toBe(0)
    expect(cells.get('id3')!.y).toBeGreaterThan(0)
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
    const all = [...saved.values(), ...r.values()]
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

  it('Main Campus: no line crosses the third card and no pill lands inside a card', () => {
    const main = s.nodes.filter((n) => n.siteId === 'site-main')
    const layout = defaultNodeLayout(main, new Map())
    expect(layout.size).toBe(3)
    const ids = [...layout.keys()]
    for (const a of ids)
      for (const b of ids) {
        if (a >= b) continue
        const from = center(layout.get(a)!)
        const to = center(layout.get(b)!)
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
        for (const other of ids) {
          const r = rect(layout.get(other)!)
          if (other !== a && other !== b)
            expect(
              segmentCrossesRect(from, to, r),
              `${a}-${b} vs ${other}`,
            ).toBe(false)
          expect(
            mid.x > r.left &&
              mid.x < r.right &&
              mid.y > r.top &&
              mid.y < r.bottom,
            `pill of ${a}-${b} inside ${other}`,
          ).toBe(false)
        }
      }
  })

  it('segmentCrossesRect sees a crossing, a miss and a touch from inside', () => {
    const r = { left: 0, top: 0, right: 10, bottom: 10 }
    expect(segmentCrossesRect({ x: -5, y: 5 }, { x: 15, y: 5 }, r)).toBe(true)
    expect(segmentCrossesRect({ x: -5, y: 20 }, { x: 15, y: 20 }, r)).toBe(
      false,
    )
    expect(segmentCrossesRect({ x: 5, y: 5 }, { x: 20, y: 5 }, r)).toBe(true)
    expect(segmentCrossesRect({ x: -5, y: -5 }, { x: -1, y: 20 }, r)).toBe(
      false,
    )
  })
})
