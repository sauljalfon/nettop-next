import { describe, expect, it } from 'vitest'
import { NODE_HEIGHT, NODE_WIDTH, type Position } from '../physical/layout'
import { acceptanceSnapshot } from './acceptanceFixture'
import { buildOverview, type Overview } from './overview'
import {
  FRAME_PADDING,
  FRAME_TITLE,
  SITE_GAP,
  overviewLayout,
  siteFrames,
} from './overviewLayout'
import { indexSnapshot } from './snapshotIndex'

const acceptance = () => buildOverview(indexSnapshot(acceptanceSnapshot()), {})

const tags = {
  access: false,
  aggregation: false,
  backbone: false,
  passiveOnly: false,
}
function manual(siteSizes: Record<string, number>): Overview {
  const nodes: Overview['nodes'] = []
  for (const [siteId, n] of Object.entries(siteSizes))
    for (let i = 0; i < n; i++)
      nodes.push({
        id: `${siteId}-n${String(i).padStart(2, '0')}`,
        name: `N${String(i).padStart(2, '0')}`,
        siteId,
        equipmentCount: 1,
        tags,
        proposed: false,
        dimmed: false,
      })
  return {
    sites: Object.keys(siteSizes).map((id) => ({ id, name: id })),
    nodes,
    pairs: [],
    unplaced: 0,
  }
}

const overlaps = (a: Position, b: Position) =>
  a.x < b.x + NODE_WIDTH &&
  b.x < a.x + NODE_WIDTH &&
  a.y < b.y + NODE_HEIGHT &&
  b.y < a.y + NODE_HEIGHT
function expectNoOverlap(positions: Map<string, Position>) {
  const all = [...positions]
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      expect(
        overlaps(all[i][1], all[j][1]),
        `${all[i][0]} vs ${all[j][0]}`,
      ).toBe(false)
}

describe('CM-05 the default arrangement', () => {
  it('gives every node a position and is deterministic', () => {
    const o = acceptance()
    const a = overviewLayout(o, new Map())
    const b = overviewLayout(acceptance(), new Map())
    expect([...a.keys()].sort()).toEqual(o.nodes.map((n) => n.id).sort())
    expect([...b]).toEqual([...a])
  })

  it('never overlaps two cards, also across sites', () => {
    expectNoOverlap(overviewLayout(acceptance(), new Map()))
    expectNoOverlap(
      overviewLayout(manual({ a: 3, b: 14, c: 1, d: 12 }), new Map()),
    )
  })

  it('puts sites side by side, the core site last, SITE_GAP apart', () => {
    const o = acceptance()
    const frames = overviewLayout(o, new Map())
    const right = (siteId: string) =>
      Math.max(
        ...o.nodes
          .filter((n) => n.siteId === siteId)
          .map((n) => frames.get(n.id)!.x + NODE_WIDTH),
      )
    const left = (siteId: string) =>
      Math.min(
        ...o.nodes
          .filter((n) => n.siteId === siteId)
          .map((n) => frames.get(n.id)!.x),
      )
    // DR has one aggregation node, Main Campus has one too: ties go by name.
    expect(left('site-main') - right('site-dr')).toBe(SITE_GAP)
    for (const site of ['site-dr', 'site-main'])
      expect(
        Math.min(
          ...o.nodes
            .filter((n) => n.siteId === site)
            .map((n) => frames.get(n.id)!.y),
        ),
      ).toBe(0)
  })

  it('returns saved positions unchanged and moves no other card: a drag moves one card', () => {
    const o = acceptance()
    const before = overviewLayout(o, new Map())
    const saved = new Map<string, Position>([
      ['node-sm', { x: 1234.5, y: -77 }],
      ['node-dr2', { x: -3000, y: 40 }],
    ])
    const out = overviewLayout(o, saved)
    expect(out.get('node-sm')).toEqual({ x: 1234.5, y: -77 })
    expect(out.get('node-dr2')).toEqual({ x: -3000, y: 40 })
    expect(out.size).toBe(o.nodes.length)
    for (const [id, p] of before)
      if (!saved.has(id)) expect(out.get(id)).toEqual(p)
  })

  it('ignores a saved position for a node that is gone', () => {
    const out = overviewLayout(
      acceptance(),
      new Map([['node-gone', { x: 1, y: 1 }]]),
    )
    expect(out.has('node-gone')).toBe(false)
  })
})

describe('CM-05 site frames', () => {
  it('contain their cards with padding and room for the title', () => {
    const o = acceptance()
    const pos = overviewLayout(o, new Map())
    const frames = siteFrames(o, pos)
    expect(frames.map((f) => f.siteId).sort()).toEqual(['site-dr', 'site-main'])
    for (const f of frames) {
      for (const n of o.nodes.filter((x) => x.siteId === f.siteId)) {
        const p = pos.get(n.id)!
        expect(p.x - f.x).toBeGreaterThanOrEqual(FRAME_PADDING - 1e-6)
        expect(f.x + f.width - (p.x + NODE_WIDTH)).toBeGreaterThanOrEqual(
          FRAME_PADDING - 1e-6,
        )
        expect(p.y - f.y).toBeGreaterThanOrEqual(
          FRAME_PADDING + FRAME_TITLE - 1e-6,
        )
        expect(f.y + f.height - (p.y + NODE_HEIGHT)).toBeGreaterThanOrEqual(
          FRAME_PADDING - 1e-6,
        )
      }
    }
  })

  it('has no frame for a site with no nodes', () => {
    const o = manual({ a: 2 })
    o.sites.push({ id: 'empty', name: 'Empty' })
    expect(
      siteFrames(o, overviewLayout(o, new Map())).map((f) => f.siteId),
    ).toEqual(['a'])
  })

  it('exports the fixed gaps', () => {
    expect([SITE_GAP, FRAME_PADDING, FRAME_TITLE]).toEqual([240, 32, 28])
  })
})
