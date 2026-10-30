import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { buildHierarchies, type NetworkHierarchy } from './hierarchy'
import { hierarchyFixture } from './hierarchyFixture'
import { hierarchyLayout, selectionBoxes } from './hierarchyLayout'
import { indexSnapshot } from './snapshotIndex'

const hierarchyOf = (s: Snapshot, net = 'A') =>
  buildHierarchies(indexSnapshot(s)).get(net)!
const layoutOf = (
  s: Snapshot,
  net = 'A',
  onlyProblems = false,
  open: ReadonlySet<string> = new Set(),
) => hierarchyLayout(hierarchyOf(s, net), { onlyProblems, open })

interface Box {
  x: number
  y: number
  w: number
  h: number
}
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const centreY = (b: Box) => b.y + b.h / 2
const none = new Set<string>()

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

/** One node holding three switches of A under AGG1, and `other` of network B (so a quiet line). */
function crowded(other: number) {
  const f = hierarchyFixture()
    .site('s1', 'Main')
    .node('n1', 's1', 'Hall')
    .node('n2', 's1', 'Hall 2')
    .sw('BB1', 'backbone', 'A')
    .sw('AGG1', 'aggregation', 'A')
    .sw('AGG2', 'aggregation', 'A')
  f.run('BB1', 'AGG1')
  f.run('BB1', 'AGG2')
  for (const id of ['S1', 'S2', 'S3']) {
    f.sw(id, 'access', 'A', 'n1')
    f.run(id, 'AGG1')
  }
  f.sw('T1', 'access', 'A', 'n2')
  f.run('T1', 'AGG2')
  for (let i = 0; i < other; i++) f.sw(`B${i}`, 'access', 'B', 'n1')
  return f.snapshot()
}

describe('OV-02 the hierarchy layout, left to right', () => {
  it('is deterministic: the same hierarchy lays out the same', () => {
    const s = acceptanceSnapshot()
    const a = layoutOf(s)
    const b = layoutOf(s)
    expect([...a.boxes]).toEqual([...b.boxes])
    expect([...a.frames]).toEqual([...b.frames])
    expect(a.labels).toEqual(b.labels)
    expect(a.size).toEqual(b.size)
  })

  it('uses the demo sizes: top 120 × 30, frame 280 × 30, closed card 270 × 22', () => {
    const l = layoutOf(acceptanceSnapshot())
    expect(l.boxes.get('BB-01')).toMatchObject({ w: 120, h: 30 })
    expect(l.frames.get('AGG-03+AGG-08')).toMatchObject({ w: 280, h: 30 })
    expect(l.boxes.get('AGG-03+AGG-08|node-a')).toMatchObject({ w: 270, h: 22 })
    // The AGGs live inside their frame: only tops and cards have boxes.
    expect([...l.boxes.keys()].sort()).toEqual([
      'AGG-03+AGG-08|node-a',
      'BB-01',
    ])
  })

  it('puts the tops in the left column, the frames in the middle and the cards on the right', () => {
    const s = wide(5)
    const l = layoutOf(s)
    const top = l.boxes.get('BB1')!
    const frame = l.frames.get('AGG1+AGG2')!
    const cards = [...l.boxes]
      .filter(([k]) => k.includes('|'))
      .map(([, b]) => b)
    expect(cards).toHaveLength(5)
    expect(top.x + top.w).toBeLessThan(frame.x)
    for (const c of cards) expect(frame.x + frame.w).toBeLessThan(c.x)
    expect(new Set(cards.map((c) => c.x)).size).toBe(1)
  })

  it('gives the column heads: Backbone, Aggregation, Nodes above their columns', () => {
    const l = layoutOf(acceptanceSnapshot())
    expect(l.labels.map((x) => x.text)).toEqual([
      'Backbone',
      'Aggregation',
      'Nodes',
    ])
    expect(l.labels[0].x).toBe(l.boxes.get('BB-01')!.x)
    expect(l.labels[1].x).toBe(l.frames.get('AGG-03+AGG-08')!.x)
    expect(l.labels[2].x).toBe(l.boxes.get('AGG-03+AGG-08|node-a')!.x)
    const first = Math.min(
      ...[...l.boxes.values(), ...l.frames.values()].map((b) => b.y),
    )
    for (const label of l.labels) expect(label.y).toBeLessThan(first)
  })

  it('labels the top column "Top AGG" when the top is an AGG, and has no top head with no top', () => {
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
    expect([...b.boxes.keys()]).toEqual(['AGG-12|node-dr1'])
  })

  it('stacks cards 22 high with 4 between them, and frames 12 more apart', () => {
    const s = wide(3)
    const h = hierarchyOf(s)
    const l = hierarchyLayout(h, { onlyProblems: false, open: none })
    const cards = h.groups[0].nodes.map((c) => l.boxes.get(c.key)!)
    expect(cards[1].y - (cards[0].y + cards[0].h)).toBe(4)
    expect(cards[2].y - (cards[1].y + cards[1].h)).toBe(4)
    const two = layoutOf(acceptanceSnapshot())
    const a = [...two.frames.values()]
    expect(a[1].y).toBeGreaterThan(a[0].y + a[0].h)
  })

  it('has no two boxes overlap, frames included', () => {
    for (const s of [wide(7), wide(50), acceptanceSnapshot(), crowded(2)]) {
      const l = layoutOf(s, 'A', false, new Set(['AGG1|n1']))
      const all = [...l.boxes.values(), ...l.frames.values()]
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++)
          expect(overlap(all[i], all[j])).toBe(false)
    }
  })

  it('centres each frame on its cards’ rows, and gives a frame with no cards one empty row', () => {
    const s = acceptanceSnapshot()
    const l = layoutOf(s)
    const card = l.boxes.get('AGG-03+AGG-08|node-a')!
    expect(centreY(l.frames.get('AGG-03+AGG-08')!)).toBe(centreY(card))
    const empty = l.frames.get('AGG-15')!
    expect(empty.y).toBeGreaterThan(card.y + card.h)
    const wideS = wide(4)
    const h = hierarchyOf(wideS)
    const w = hierarchyLayout(h, { onlyProblems: false, open: none })
    const cards = h.groups[0].nodes.map((c) => w.boxes.get(c.key)!)
    const top = cards[0].y
    const bottom = cards[3].y + cards[3].h
    expect(centreY(w.frames.get('AGG1+AGG2')!)).toBe((top + bottom) / 2)
  })

  it('holds an open card’s rows and its quiet line: 42 + 20 per switch, + 30 with the quiet line', () => {
    const s = crowded(2)
    const h = hierarchyOf(s)
    const card = h.groups.find((g) => g.key === 'AGG1')!.nodes[0]
    expect(card.switchIds).toHaveLength(3)
    expect(card.elsewhere.length).toBeGreaterThan(0)
    const open = hierarchyLayout(h, {
      onlyProblems: false,
      open: new Set([card.key]),
    })
    expect(open.boxes.get(card.key)!.h).toBe(42 + 3 * 20 + 30)
    const closed = hierarchyLayout(h, { onlyProblems: false, open: none })
    expect(closed.boxes.get(card.key)!.h).toBe(22)
    // With nothing elsewhere, no quiet line.
    const t = h.groups.find((g) => g.key === 'AGG2')!.nodes[0]
    expect(t.elsewhere).toEqual([])
    const openT = hierarchyLayout(h, {
      onlyProblems: false,
      open: new Set([t.key]),
    })
    expect(openT.boxes.get(t.key)!.h).toBe(42 + 1 * 20)
  })

  it('moves the cards below an opened card down, and nothing sideways', () => {
    const s = wide(4)
    const h = hierarchyOf(s)
    const keys = h.groups[0].nodes.map((c) => c.key)
    const closed = hierarchyLayout(h, { onlyProblems: false, open: none })
    const open = hierarchyLayout(h, {
      onlyProblems: false,
      open: new Set([keys[1]]),
    })
    const grow = open.boxes.get(keys[1])!.h - closed.boxes.get(keys[1])!.h
    expect(grow).toBe(42 + 20 - 22)
    expect(open.boxes.get(keys[0])).toEqual(closed.boxes.get(keys[0]))
    for (const k of keys.slice(2)) {
      const a = closed.boxes.get(k)!
      const b = open.boxes.get(k)!
      expect(b.x).toBe(a.x)
      expect(b.y).toBe(a.y + grow)
    }
    for (const [id, a] of closed.boxes) {
      expect(open.boxes.get(id)!.x).toBe(a.x)
      expect(open.boxes.get(id)!.w).toBe(a.w)
    }
    for (const [key, a] of closed.frames) {
      expect(open.frames.get(key)!.x).toBe(a.x)
      expect(open.frames.get(key)!.w).toBe(a.w)
    }
  })

  it('keeps the tops on screen: their y never goes below the cap, however long the list', () => {
    const l = layoutOf(wide(50))
    const top = l.boxes.get('BB1')!
    expect(top.y).toBe(140)
    const small = layoutOf(acceptanceSnapshot())
    expect(small.boxes.get('BB-01')!.y).toBeLessThan(140)
    // Several tops stack, the first no higher than the first row.
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .sw('BB1', 'backbone', 'A')
      .sw('BB2', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
    f.run('BB1', 'AGG1')
    f.run('BB2', 'AGG1')
    const two = layoutOf(f.snapshot())
    const a = two.boxes.get('BB1')!
    const b = two.boxes.get('BB2')!
    expect(a.x).toBe(b.x)
    expect(b.y).toBeGreaterThan(a.y + a.h)
    expect(a.y).toBeGreaterThanOrEqual(44)
  })

  it('lays out a 50-node group without overlap, the size holding everything', () => {
    const s = wide(50)
    const h = hierarchyOf(s)
    const l = hierarchyLayout(h, { onlyProblems: false, open: none })
    const cards = h.groups[0].nodes.map((c) => l.boxes.get(c.key)!)
    expect(cards).toHaveLength(50)
    for (const b of [...l.boxes.values(), ...l.frames.values()]) {
      expect(l.size.width).toBeGreaterThanOrEqual(b.x + b.w)
      expect(l.size.height).toBeGreaterThanOrEqual(b.y + b.h)
    }
  })

  it('gives "Direct to BB" and "No AGG" a frame and no box of their own', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall')
      .sw('BB1', 'backbone', 'A')
      .sw('LOST', 'access', 'A', 'n1')
      .sw('BBONLY', 'access', 'A', 'n1')
    f.run('BBONLY', 'BB1')
    const h = hierarchyOf(f.snapshot())
    expect(h.groups.map((g) => g.key)).toEqual(['top', 'none'])
    const l = hierarchyLayout(h, { onlyProblems: false, open: none })
    expect(l.frames.has('top')).toBe(true)
    expect(l.frames.has('none')).toBe(true)
    expect(l.boxes.has('none')).toBe(false)
    expect(l.boxes.has('top')).toBe(false)
    expect(l.boxes.has('top|n1')).toBe(true)
  })

  it('with Only problems lays out only the cards with a mark', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall 1')
      .node('n2', 's1', 'Hall 2')
      .node('n3', 's1', 'Hall 3')
      .sw('BB1', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .sw('AGG2', 'aggregation', 'A')
      .sw('ONE', 'access', 'A', 'n1') // chained behind BOTH: the one problem
      .sw('BOTH', 'access', 'A', 'n2')
      .sw('FINE', 'access', 'A', 'n3')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('ONE', 'BOTH')
    f.run('BOTH', 'AGG1')
    f.run('BOTH', 'AGG2')
    f.run('FINE', 'AGG1')
    f.run('FINE', 'AGG2')
    const h = hierarchyOf(f.snapshot())
    const all = hierarchyLayout(h, { onlyProblems: false, open: none })
    const some = hierarchyLayout(h, { onlyProblems: true, open: none })
    expect([...all.boxes.keys()].filter((k) => k.includes('|'))).toHaveLength(3)
    expect([...some.boxes.keys()].filter((k) => k.includes('|'))).toEqual([
      'AGG1+AGG2|n1',
    ])
    expect(some.frames.has('AGG1+AGG2')).toBe(true)
  })

  it('with Only problems keeps a frame whose AGG has no BB, and drops a clean frame', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall 1')
      .node('n2', 's1', 'Hall 2')
      .sw('BB1', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .sw('AGG2', 'aggregation', 'A') // no cable to the BB
      .sw('S1', 'access', 'A', 'n1')
      .sw('S2', 'access', 'A', 'n2')
    f.run('BB1', 'AGG1')
    f.run('S1', 'AGG1')
    f.run('S2', 'AGG2')
    const h = hierarchyOf(f.snapshot())
    expect([...h.noTop]).toEqual(['AGG2'])
    const l = hierarchyLayout(h, { onlyProblems: true, open: none })
    expect([...l.frames.keys()]).toEqual(['AGG2'])
    expect([...l.boxes.keys()].filter((k) => k.includes('|'))).toEqual([])
    // A clean network shows no frame at all.
    const clean = hierarchyOf(wide(2))
    const none2 = hierarchyLayout(clean, { onlyProblems: true, open: none })
    expect(none2.frames.size).toBe(0)
  })

  it('gives an empty layout for a network with nothing in it', () => {
    const base = hierarchyOf(acceptanceSnapshot())
    const empty: NetworkHierarchy = {
      ...base,
      topKind: 'none',
      topIds: [],
      aggIds: [],
      groups: [],
      lines: [],
      noTop: new Set(),
    }
    const l = hierarchyLayout(empty, { onlyProblems: false, open: none })
    expect(l.boxes.size).toBe(0)
    expect(l.frames.size).toBe(0)
    expect(l.labels).toEqual([])
    expect(l.size).toEqual({ width: 0, height: 0 })
  })
})

describe('OV-07 what a selection pans to', () => {
  const f = () => {
    const s = crowded(0)
    const h = hierarchyOf(s)
    return {
      h,
      layout: hierarchyLayout(h, { onlyProblems: false, open: none }),
    }
  }

  it('gives a card together with its frame first, then the card alone', () => {
    const { h, layout } = f()
    const card = h.groups[0].nodes[0]
    const own = layout.boxes.get(card.key)!
    const frame = layout.frames.get(card.groupKey)!
    const [union, alone] = selectionBoxes(h, layout, card.key)
    expect(alone).toEqual(own)
    expect(union.x).toBe(Math.min(own.x, frame.x))
    expect(union.x + union.w).toBe(Math.max(own.x + own.w, frame.x + frame.w))
    expect(union.y).toBe(Math.min(own.y, frame.y))
    expect(union.y + union.h).toBe(Math.max(own.y + own.h, frame.y + frame.h))
  })

  it('gives an AGG’s frame, a top itself, and nothing for an unknown key', () => {
    const { h, layout } = f()
    expect(selectionBoxes(h, layout, h.groups[0].key)).toEqual([
      layout.frames.get(h.groups[0].key),
    ])
    expect(selectionBoxes(h, layout, 'BB1')).toEqual([layout.boxes.get('BB1')])
    expect(selectionBoxes(h, layout, 'nope')).toEqual([])
    expect(selectionBoxes(h, layout, undefined)).toEqual([])
  })
})
