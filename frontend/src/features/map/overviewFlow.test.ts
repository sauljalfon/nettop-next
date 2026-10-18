import { describe, expect, it } from 'vitest'
import { siteLineWidth } from '../physical/explorerModel'
import type { MapLayout } from '../../shared/types'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { networkColors } from './networkColors'
import { buildOverview } from './overview'
import {
  restoreMapPosition,
  withoutMapPositions,
  withSavedMapPosition,
  highlightedNodeIds,
  panIntoView,
  pillPoint,
  projectOverview,
} from './overviewFlow'
import {
  OVERVIEW_CARD_HEIGHT,
  overviewLayout,
  siteFrames,
} from './overviewLayout'
import { NODE_WIDTH } from '../physical/layout'
import { routeMarks } from '../physical/inventory'
import { indexSnapshot } from './snapshotIndex'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)
const colors = networkColors(s.networks)

type Flow = ReturnType<typeof projectOverview>['nodes']
function cardOf(nodes: Flow, id: string) {
  const n = nodes.find((x) => x.id === id)!
  if (n.type !== 'overviewCard') throw new Error(`${id} is not a card`)
  return n
}

function project(
  opts: { networkId?: string; open?: string[]; selected?: string } = {},
) {
  const overview = buildOverview(index, { networkId: opts.networkId })
  const positions = overviewLayout(overview, new Map())
  return {
    overview,
    positions,
    frames: siteFrames(overview, positions),
    ...projectOverview({
      overview,
      index,
      positions,
      frames: siteFrames(overview, positions),
      openNodes: new Set(opts.open ?? []),
      selected: opts.selected ?? '',
      colors,
    }),
  }
}

describe('CM-09 overview projection', () => {
  it('puts the site frames first and behind, then one card per node', () => {
    const { nodes, positions, frames } = project()
    expect(nodes.map((n) => n.id)).toEqual([
      'site:site-dr',
      'site:site-main',
      'node-dr1',
      'node-dr2',
      'node-a',
      'node-core',
      'node-sm',
    ])
    const frame = nodes[1]
    expect(frame).toMatchObject({
      type: 'overviewSite',
      draggable: false,
      selectable: false,
      focusable: false,
      data: { name: 'Main Campus' },
    })
    expect(frame.zIndex).toBeLessThan(0)
    const f = frames.find((x) => x.siteId === 'site-main')!
    expect(frame.position).toEqual({ x: f.x, y: f.y })
    expect(frame.style).toMatchObject({ width: f.width, height: f.height })
    const card = cardOf(nodes, 'node-a')
    expect(card.type).toBe('overviewCard')
    expect(card.position).toEqual(positions.get('node-a'))
    expect(card.draggable).not.toBe(false)
    expect(card.zIndex ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('carries the card facts and no equipment list while closed', () => {
    const { nodes } = project()
    const core = cardOf(nodes, 'node-core')
    expect(core.data).toMatchObject({
      id: 'node-core',
      name: 'Main Distribution',
      equipmentCount: 5,
      open: false,
      racks: [],
      proposed: false,
      dimmed: false,
    })
  })

  it('draws one straight line per pair: id, count label, width, network colour', () => {
    const { edges } = project()
    expect(edges.map((e) => e.id)).toEqual([
      'pair:node-a:node-sm',
      'pair:node-core:node-dr2',
      'pair:node-core:node-sm',
      'pair:node-dr1:node-sm',
    ])
    const a = edges[0]
    expect(a).toMatchObject({
      source: 'node-a',
      target: 'node-sm',
      label: '3',
      type: 'overviewLine',
    })
    expect(a.style).toMatchObject({
      stroke: colors.get('A'),
      strokeWidth: siteLineWidth(3),
    })
    const mixed = edges[2]
    expect(mixed.label).toBe('4')
    expect(mixed.style).toMatchObject({
      stroke: 'var(--mixed-networks)',
      strokeWidth: siteLineWidth(4),
    })
    expect(edges[3].style).toMatchObject({ stroke: colors.get('B') })
    expect(edges.some((e) => e.className?.includes('dimmed'))).toBe(false)
  })

  it('a dimmed pair and a dimmed card carry the dimmed state; nothing is hidden', () => {
    const { nodes, edges } = project({ networkId: 'B' })
    expect(nodes.filter((n) => n.type === 'overviewCard')).toHaveLength(5)
    expect(
      nodes.flatMap((n) =>
        n.type === 'overviewCard' && n.data.dimmed ? [n.id] : [],
      ),
    ).toEqual(['node-a'])
    expect(edges).toHaveLength(4)
    expect(
      edges.filter((e) => e.className?.includes('dimmed')).map((e) => e.id),
    ).toEqual(['pair:node-a:node-sm'])
  })

  it('an open card lists its equipment by rack, in unit order, and marks the selected one', () => {
    const { nodes } = project({ open: ['node-core'], selected: 'AGG-08' })
    const core = cardOf(nodes, 'node-core')
    expect(core.data.open).toBe(true)
    expect(
      core.data.racks.map((r) => [r.name, r.equipment.map((e) => e.id)]),
    ).toEqual([
      ['Rack Core 01', ['AGG-03', 'HDF-02']],
      ['Rack Core 02', ['AGG-08', 'AGG-15']],
      ['Rack Core 03', ['BB-01']],
    ])
    expect(core.data.racks[0].equipment[0]).toMatchObject({
      id: 'AGG-03',
      name: 'AGG-03',
      unit: 1,
    })
    expect(core.data.selectedId).toBe('AGG-08')
    expect(core.zIndex).toBeGreaterThan(0)
    const other = cardOf(nodes, 'node-a')
    expect(other.data.selectedId).toBeUndefined()
    expect(other.data.racks).toEqual([])
  })

  it('orders equipment by unit, then name', () => {
    const copy = acceptanceSnapshot()
    copy.equipment.find((e) => e.id === 'HDF-02')!.unit = 4
    copy.equipment.find((e) => e.id === 'AGG-03')!.unit = 8
    const idx = indexSnapshot(copy)
    const overview = buildOverview(idx)
    const positions = overviewLayout(overview, new Map())
    const { nodes } = projectOverview({
      overview,
      index: idx,
      positions,
      frames: siteFrames(overview, positions),
      openNodes: new Set(['node-core']),
      selected: '',
      colors,
    })
    const core = cardOf(nodes, 'node-core')
    expect(core.data.racks[0].equipment.map((e) => e.id)).toEqual([
      'HDF-02',
      'AGG-03',
    ])
  })

  it('marks a proposed node', () => {
    const overview = buildOverview(index, {
      installedNodeIds: new Set(['node-a']),
    })
    const positions = overviewLayout(overview, new Map())
    const { nodes } = projectOverview({
      overview,
      index,
      positions,
      frames: siteFrames(overview, positions),
      openNodes: new Set(),
      selected: '',
      colors,
    })
    expect(cardOf(nodes, 'node-sm').data.proposed).toBe(true)
    expect(cardOf(nodes, 'node-a').data.proposed).toBe(false)
  })
})

describe('CM-09 saved layout cache updates', () => {
  const layout: MapLayout = { positions: [{ nodeId: 'a', x: 1, y: 2 }] }
  it('replaces or adds one node and leaves the others', () => {
    expect(withSavedMapPosition(layout, 'a', 5, 6).positions).toEqual([
      { nodeId: 'a', x: 5, y: 6 },
    ])
    expect(withSavedMapPosition(layout, 'b', 5, 6).positions).toEqual([
      { nodeId: 'a', x: 1, y: 2 },
      { nodeId: 'b', x: 5, y: 6 },
    ])
  })
  it('restores the prior position, or removes the node if it had none', () => {
    const moved = withSavedMapPosition(layout, 'a', 5, 6)
    expect(
      restoreMapPosition(moved, 'a', layout.positions[0]).positions,
    ).toEqual(layout.positions)
    const added = withSavedMapPosition(layout, 'b', 5, 6)
    expect(restoreMapPosition(added, 'b', undefined).positions).toEqual(
      layout.positions,
    )
  })
  it('clears every position', () => {
    expect(withoutMapPositions(layout).positions).toEqual([])
  })
})

describe('CM-09 panIntoView', () => {
  const area = { left: 100, top: 50, right: 1000, bottom: 700 }
  const box = (left: number, top: number, w = 300, h = 200) => ({
    left,
    top,
    right: left + w,
    bottom: top + h,
  })
  it('does not pan a card that is fully inside', () => {
    expect(panIntoView(box(400, 200), area)).toEqual({ dx: 0, dy: 0 })
  })
  it('pans by the smallest amount that brings a card in, per axis', () => {
    expect(panIntoView(box(900, 200), area, 16)).toEqual({ dx: -216, dy: 0 })
    expect(panIntoView(box(50, 200), area, 16)).toEqual({ dx: 66, dy: 0 })
    expect(panIntoView(box(400, 600), area, 16)).toEqual({ dx: 0, dy: -116 })
    expect(panIntoView(box(400, 0), area, 16)).toEqual({ dx: 0, dy: 66 })
  })
  it('lines a card up with the near edge when it is larger than the area', () => {
    expect(panIntoView(box(500, 200, 2000, 200), area, 16)).toEqual({
      dx: -384,
      dy: 0,
    })
  })
})

describe('CM-09 pillPoint', () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({
    left,
    top,
    right,
    bottom,
  })
  const from = { x: 0, y: 0 }
  const to = { x: 1000, y: 0 }
  const ends = [box(-50, -20, 50, 20), box(950, -20, 1050, 20)]
  const inside = (
    p: { x: number; y: number },
    r: ReturnType<typeof box>,
    m = 12,
  ) =>
    p.x > r.left - m &&
    p.x < r.right + m &&
    p.y > r.top - m &&
    p.y < r.bottom + m

  it('is the midpoint when no card is in the way (the end cards are clear of it)', () => {
    expect(pillPoint(from, to, ends)).toEqual({ x: 500, y: 0 })
    expect(pillPoint(from, { x: 100, y: 50 }, [])).toEqual({ x: 50, y: 25 })
  })

  it('is the midpoint of the longer free stretch when a card covers the middle', () => {
    const cards = [...ends, box(400, -20, 500, 20)]
    // Free: 62..388 (326) and 512..938 (426).
    const p = pillPoint(from, to, cards)
    expect(p.x).toBeCloseTo(725, 6)
    expect(p.y).toBeCloseTo(0, 6)
    for (const c of cards) expect(inside(p, c)).toBe(false)
  })

  it('takes a free stretch at either end of the line, and skips cards it does not cross', () => {
    const p = pillPoint(from, to, [
      ...ends,
      box(300, -20, 1000, 20),
      box(0, 500, 1000, 600),
    ])
    expect(p.x).toBeCloseTo((62 + 288) / 2, 6)
  })

  it('is the plain midpoint when the whole line is under cards', () => {
    expect(pillPoint(from, to, [box(-100, -50, 1100, 50)])).toEqual({
      x: 500,
      y: 0,
    })
    expect(pillPoint(from, to, [...ends, box(40, -20, 960, 20)])).toEqual({
      x: 500,
      y: 0,
    })
  })

  it('grows each card by the margin', () => {
    const p = pillPoint(from, to, [...ends, box(400, -20, 500, 20)], 0)
    // Free: 50..400 (350) and 500..950 (450).
    expect(p.x).toBeCloseTo(725, 6)
    const q = pillPoint(from, to, [...ends, box(400, -20, 500, 20)], 100)
    // Free: 150..300 (150) and 600..850 (250).
    expect(q.x).toBeCloseTo(725, 6)
  })
})

describe('CM-09 pills are placed where no card is', () => {
  it('B04 sits clear of North Sub-main, off the plain midpoint', () => {
    const { edges, positions, overview } = project()
    const box = (id: string) => {
      const p = positions.get(id)!
      return {
        left: p.x,
        top: p.y,
        right: p.x + NODE_WIDTH,
        bottom: p.y + OVERVIEW_CARD_HEIGHT,
      }
    }
    const edge = edges.find((e) => e.id === 'pair:node-core:node-dr2')!
    const pill = (edge.data as { pill: { x: number; y: number } }).pill
    const centre = (id: string) => {
      const b = box(id)
      return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }
    }
    const mid = {
      x: (centre('node-core').x + centre('node-dr2').x) / 2,
      y: (centre('node-core').y + centre('node-dr2').y) / 2,
    }
    expect(pill).not.toEqual(mid)
    for (const n of overview.nodes) {
      const b = box(n.id)
      const hit =
        pill.x > b.left - 12 &&
        pill.x < b.right + 12 &&
        pill.y > b.top - 12 &&
        pill.y < b.bottom + 12
      expect(hit, n.id).toBe(false)
    }
  })

  it('an open card is clipped by its measured size', () => {
    const overview = buildOverview(index)
    const positions = overviewLayout(overview, new Map())
    const frames = siteFrames(overview, positions)
    const args = {
      overview,
      index,
      positions,
      frames,
      openNodes: new Set(['node-sm']),
      selected: '',
      colors,
    }
    const closed = projectOverview(args).edges.map((e) => e.data!.pill)
    const sizes = new Map([['node-sm', { width: 340, height: 500 }]])
    const open = projectOverview({ ...args, sizes }).edges.map(
      (e) => e.data!.pill,
    )
    expect(open).not.toEqual(closed)
  })
})

describe('CM-11 the route and the highlight on the overview', () => {
  const marks = routeMarks(index, agg03Route())
  const run = (
    opts: {
      networkId?: string
      open?: string[]
      withRoute?: boolean
      highlighted?: string[]
    } = {},
  ) => {
    const overview = buildOverview(index, { networkId: opts.networkId })
    const positions = overviewLayout(overview, new Map())
    return projectOverview({
      overview,
      index,
      positions,
      frames: siteFrames(overview, positions),
      openNodes: new Set(opts.open ?? []),
      selected: '',
      colors,
      marks: opts.withRoute === false ? undefined : marks,
      highlighted: new Set(opts.highlighted ?? []),
    })
  }
  const on = (nodes: ReturnType<typeof run>['nodes'], id: string) =>
    cardOf(nodes, id).data.onRoute

  it('marks the cards of the route’s nodes and no others', () => {
    const { nodes } = run()
    expect(
      ['node-a', 'node-sm', 'node-core', 'node-dr1', 'node-dr2'].map((id) =>
        on(nodes, id),
      ),
    ).toEqual([true, true, true, false, false])
  })

  it('marks the pairs that carry the route’s cables (A02 and A03; A01 and A04 are inside a node)', () => {
    const { edges } = run()
    const state = Object.fromEntries(
      edges.map((e) => [e.id, (e.data as { onRoute: boolean }).onRoute]),
    )
    expect(state).toEqual({
      'pair:node-a:node-sm': true,
      'pair:node-core:node-dr2': false,
      'pair:node-core:node-sm': true,
      'pair:node-dr1:node-sm': false,
    })
    const lit = edges.find((e) => e.id === 'pair:node-a:node-sm')!
    expect(lit.style).toMatchObject({ stroke: 'var(--route)' })
    expect(lit.style!.strokeWidth).toBeGreaterThan(siteLineWidth(3))
    const plain = edges.find((e) => e.id === 'pair:node-dr1:node-sm')!
    expect(plain.style).toMatchObject({ stroke: colors.get('B') })
  })

  it('is empty without a route', () => {
    const { nodes, edges } = run({ withRoute: false })
    expect(
      nodes.flatMap((n) =>
        n.type === 'overviewCard' && n.data.onRoute ? [n.id] : [],
      ),
    ).toEqual([])
    expect(edges.some((e) => (e.data as { onRoute: boolean }).onRoute)).toBe(
      false,
    )
  })

  it('an on-route node or pair is not dimmed by the network selector (D11)', () => {
    const { nodes, edges } = run({ networkId: 'B' })
    // Building A is Network A only, but the route goes through it.
    expect(cardOf(nodes, 'node-a').data.dimmed).toBe(false)
    expect(cardOf(nodes, 'node-a').data.onRoute).toBe(true)
    const pair = edges.find((e) => e.id === 'pair:node-a:node-sm')!
    expect(pair.className ?? '').not.toContain('dimmed')
    // Without the route the same node and pair are dimmed.
    const without = run({ networkId: 'B', withRoute: false })
    expect(cardOf(without.nodes, 'node-a').data.dimmed).toBe(true)
    expect(
      without.edges.find((e) => e.id === 'pair:node-a:node-sm')!.className,
    ).toContain('dimmed')
  })

  it('an open card marks the route’s equipment rows', () => {
    const { nodes } = run({ open: ['node-core'] })
    const rows = cardOf(nodes, 'node-core').data.racks.flatMap(
      (r) => r.equipment,
    )
    expect(Object.fromEntries(rows.map((e) => [e.id, e.onRoute]))).toEqual({
      'AGG-03': true,
      'HDF-02': true,
      'AGG-08': false,
      'AGG-15': false,
      'BB-01': false,
    })
  })

  it('a highlight marks a node, or every node of a site', () => {
    const overview = buildOverview(index)
    expect([
      ...highlightedNodeIds(overview, { kind: 'node', id: 'node-sm' }),
    ]).toEqual(['node-sm'])
    expect(
      [
        ...highlightedNodeIds(overview, { kind: 'site', id: 'site-main' }),
      ].sort(),
    ).toEqual(['node-a', 'node-core', 'node-sm'])
    expect(
      highlightedNodeIds(overview, { kind: 'node', id: 'gone' }).size,
    ).toBe(0)
    expect(highlightedNodeIds(overview, undefined).size).toBe(0)
    const { nodes } = run({ highlighted: ['node-sm'] })
    expect(cardOf(nodes, 'node-sm').data.highlighted).toBe(true)
    expect(cardOf(nodes, 'node-a').data.highlighted).toBe(false)
  })
})
