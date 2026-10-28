import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { buildHierarchies, type NetworkHierarchy } from './hierarchy'
import { hierarchyFixture } from './hierarchyFixture'
import { hierarchyLayout } from './hierarchyLayout'
import { indexSnapshot } from './snapshotIndex'
import type { Snapshot } from '../../shared/types'

const hierarchyOf = (s: Snapshot, net = 'A') =>
  buildHierarchies(indexSnapshot(s)).get(net)!
const layoutOf = (s: Snapshot, net = 'A', onlyProblems = false) =>
  hierarchyLayout(hierarchyOf(s, net), { onlyProblems })

interface Box {
  x: number
  y: number
  w: number
  h: number
}
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h

/** A BB, two AGGs, and `count` access switches, one in each of `count` nodes, under both AGGs. */
function wide(count: number, withBB = true) {
  const f = hierarchyFixture().site('s1', 'Main')
  if (withBB) f.sw('BB1', 'backbone', 'A')
  f.sw('AGG1', 'aggregation', 'A').sw('AGG2', 'aggregation', 'A')
  for (let i = 0; i < count; i++) {
    f.node(`n${i}`, 's1', `Node ${String(i).padStart(3, '0')}`)
    f.sw(`S${i}`, 'access', 'A', `n${i}`)
    f.run(`S${i}`, 'AGG1')
    f.run(`S${i}`, 'AGG2')
  }
  if (withBB) {
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
  }
  return f.snapshot()
}

describe('HI-06 the hierarchy layout', () => {
  it('is deterministic: the same hierarchy lays out the same', () => {
    const s = acceptanceSnapshot()
    const a = layoutOf(s)
    const b = layoutOf(s)
    expect([...a.boxes]).toEqual([...b.boxes])
    expect([...a.frames]).toEqual([...b.frames])
    expect(a.labels).toEqual(b.labels)
    expect(a.size).toEqual(b.size)
  })

  it('uses the demo sizes: tier card 140 × 58, node card 178 × 86', () => {
    const l = layoutOf(acceptanceSnapshot())
    expect(l.boxes.get('BB-01')).toMatchObject({ w: 140, h: 58 })
    expect(l.boxes.get('AGG-03')).toMatchObject({ w: 140, h: 58 })
    expect(l.boxes.get('AGG-03+AGG-08|node-a')).toMatchObject({ w: 178, h: 86 })
  })

  it('puts the top row above Aggregation above the frames, and gives the labels', () => {
    const l = layoutOf(acceptanceSnapshot())
    const top = l.boxes.get('BB-01')!
    const agg = l.boxes.get('AGG-03')!
    const frame = l.frames.get('AGG-03+AGG-08')!
    expect(top.y + top.h).toBeLessThan(agg.y)
    expect(agg.y + agg.h).toBeLessThan(frame.y)
    expect(l.labels.map((x) => x.text)).toEqual([
      'Backbone',
      'Aggregation',
      'Nodes',
    ])
  })

  it('labels the top row "Top AGG" when the top is an AGG, and has no top label with no top', () => {
    const f = hierarchyFixture()
      .node('n1', 's1')
      .sw('TOP', 'aggregation', 'A')
      .sw('MID', 'aggregation', 'A')
      .sw('ACC', 'access', 'A', 'n1')
    f.run('TOP', 'MID')
    f.run('ACC', 'MID')
    expect(layoutOf(f.snapshot()).labels.map((x) => x.text)).toEqual([
      'Top AGG',
      'Aggregation',
      'Nodes',
    ])
    const b = layoutOf(acceptanceSnapshot(), 'B')
    expect(b.labels.map((x) => x.text)).toEqual(['Aggregation', 'Nodes'])
  })

  it('gives AGGs of a group 40 px apart, and groups 48 px apart', () => {
    const l = layoutOf(acceptanceSnapshot())
    const a = l.boxes.get('AGG-03')!
    const b = l.boxes.get('AGG-08')!
    expect(b.x - (a.x + a.w)).toBe(40)
    const g1 = l.frames.get('AGG-03+AGG-08')!
    const g2 = l.frames.get('AGG-15')!
    expect(g2.x - (g1.x + g1.w)).toBeGreaterThanOrEqual(48)
  })

  it('has no two boxes overlap, and every frame holds its cards', () => {
    const s = wide(7)
    const h = hierarchyOf(s)
    const l = hierarchyLayout(h, { onlyProblems: false })
    const all = [...l.boxes.values()]
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(overlap(all[i], all[j])).toBe(false)
    for (const g of h.groups) {
      const frame = l.frames.get(g.key)!
      for (const c of g.nodes)
        expect(inside(l.boxes.get(c.key)!, frame)).toBe(true)
      for (const other of h.groups)
        if (other !== g)
          expect(overlap(frame, l.frames.get(other.key)!)).toBe(false)
    }
    for (const [key, box] of l.boxes)
      if (!key.includes('|'))
        for (const frame of l.frames.values())
          expect(overlap(box, frame)).toBe(false)
  })

  it('uses max(1, min(max(AGGs, 2), nodes)) node columns', () => {
    const cols = (s: Snapshot) => {
      const h = hierarchyOf(s)
      const l = hierarchyLayout(h, { onlyProblems: false })
      const xs = new Set(h.groups[0].nodes.map((c) => l.boxes.get(c.key)!.x))
      return xs.size
    }
    expect(cols(wide(1))).toBe(1)
    expect(cols(wide(2))).toBe(2)
    expect(cols(wide(9))).toBe(2)
  })

  it('centres the top row over all groups', () => {
    const s = acceptanceSnapshot()
    const l = layoutOf(s)
    const top = l.boxes.get('BB-01')!
    const frames = [...l.frames.values()]
    const aggs = ['AGG-03', 'AGG-08', 'AGG-15'].map((id) => l.boxes.get(id)!)
    const left = Math.min(...frames.map((f) => f.x), ...aggs.map((a) => a.x))
    const right = Math.max(
      ...frames.map((f) => f.x + f.w),
      ...aggs.map((a) => a.x + a.w),
    )
    expect(top.x + top.w / 2).toBeCloseTo((left + right) / 2, 5)
  })

  it('lays out a 50-node group without overlap, the frame growing downward', () => {
    const s = wide(50)
    const h = hierarchyOf(s)
    const l = hierarchyLayout(h, { onlyProblems: false })
    const cards = h.groups[0].nodes.map((c) => l.boxes.get(c.key)!)
    expect(cards).toHaveLength(50)
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++)
        expect(overlap(cards[i], cards[j])).toBe(false)
    const frame = l.frames.get('AGG1+AGG2')!
    for (const c of cards) expect(inside(c, frame)).toBe(true)
    expect(frame.h).toBeGreaterThan((50 * 86) / 2)
    expect(l.size.height).toBeGreaterThanOrEqual(frame.y + frame.h)
    expect(l.size.width).toBeGreaterThanOrEqual(frame.x + frame.w)
  })

  it('gives No AGG one "No AGG" card in the Aggregation row, and Under the top no AGG card', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall')
      .sw('BB1', 'backbone', 'A')
      .sw('LOST', 'access', 'A', 'n1')
      .sw('BBONLY', 'access', 'A', 'n1')
    f.run('BBONLY', 'BB1')
    const s = f.snapshot()
    const h = hierarchyOf(s)
    expect(h.groups.map((g) => g.key)).toEqual(['top', 'none'])
    const l = hierarchyLayout(h, { onlyProblems: false })
    const none = l.boxes.get('none')!
    expect(none).toMatchObject({ w: 140, h: 58 })
    const agg = l.labels.find((x) => x.text === 'Aggregation')!
    expect(none.y).toBeLessThan(l.frames.get('none')!.y)
    expect(agg.y).toBeGreaterThanOrEqual(none.y)
    expect(l.boxes.has('top')).toBe(false)
    expect(l.frames.has('top')).toBe(true)
  })

  it('with Only problems lays out only the cards with a problem, and keeps every frame', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall 1')
      .node('n2', 's1', 'Hall 2')
      .node('n3', 's1', 'Hall 3')
      .sw('AGG1', 'aggregation', 'A')
      .sw('AGG2', 'aggregation', 'A')
      .sw('ONE', 'access', 'A', 'n1') // chained behind BOTH: the one problem
      .sw('BOTH', 'access', 'A', 'n2')
      .sw('FINE', 'access', 'A', 'n3')
    f.run('ONE', 'BOTH')
    f.run('BOTH', 'AGG1')
    f.run('BOTH', 'AGG2')
    f.run('FINE', 'AGG1')
    f.run('FINE', 'AGG2')
    const s = f.snapshot()
    const h = hierarchyOf(s)
    const all = hierarchyLayout(h, { onlyProblems: false })
    const some = hierarchyLayout(h, { onlyProblems: true })
    expect([...all.boxes.keys()].filter((k) => k.includes('|'))).toHaveLength(3)
    expect([...some.boxes.keys()].filter((k) => k.includes('|'))).toEqual([
      'AGG1+AGG2|n1',
    ])
    expect(some.frames.has('AGG1+AGG2')).toBe(true)
    expect(some.frames.get('AGG1+AGG2')!.h).toBeLessThan(
      all.frames.get('AGG1+AGG2')!.h,
    )
    // None with a problem: the frame stays, with room for "No problems here".
    const clean = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall 1')
      .sw('AGG1', 'aggregation', 'A')
      .sw('S', 'access', 'A', 'n1')
    clean.run('S', 'AGG1')
    const none = hierarchyLayout(hierarchyOf(clean.snapshot()), {
      onlyProblems: true,
    })
    const frame = none.frames.get('AGG1')!
    expect(frame.h).toBeGreaterThanOrEqual(24)
    expect([...none.boxes.keys()]).toEqual(['AGG1'])
  })

  it('gives an empty layout for a network with nothing in it', () => {
    const empty: NetworkHierarchy = {
      networkId: 'A',
      topKind: 'none',
      topIds: [],
      aggIds: [],
      topsReached: new Map(),
      noTop: new Set(),
      ups: new Map(),
      lines: [],
      groups: [],
      switches: new Map(),
      proposed: new Set(),
      counts: { bb: 0, agg: 0, nodes: 0, switches: 0, marked: 0 },
    }
    const l = hierarchyLayout(empty, { onlyProblems: false })
    expect(l.boxes.size).toBe(0)
    expect(l.frames.size).toBe(0)
    expect(l.labels).toEqual([])
    expect(l.size).toEqual({ width: 0, height: 0 })
  })
})
