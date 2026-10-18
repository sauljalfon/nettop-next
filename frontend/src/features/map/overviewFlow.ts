import type { Edge, Node } from '@xyflow/react'
import type { MapLayout, NodePosition } from '../../shared/types'
import { siteLineWidth } from '../physical/explorerModel'
import {
  clipSegment,
  NODE_WIDTH,
  type Position,
  type Rect,
} from '../physical/layout'
import { colorOf } from './networkColors'
import type { RouteMarks } from '../physical/inventory'
import type { LocationRef } from './highlight'
import type { Overview, OverviewNode } from './overview'
import { OVERVIEW_CARD_HEIGHT, type SiteFrame } from './overviewLayout'
import type { SnapshotIndex } from './snapshotIndex'

export interface OverviewRack {
  id: string
  name: string
  equipment: { id: string; name: string; unit: number; onRoute: boolean }[]
}

export interface OverviewCardData extends Record<string, unknown> {
  id: string
  name: string
  equipmentCount: number
  tags: OverviewNode['tags']
  proposed: boolean
  dimmed: boolean
  open: boolean
  /** The equipment by rack; empty while the card is closed. */
  racks: OverviewRack[]
  /** Set only on the card that holds the selected equipment. */
  selectedId?: string
  /** The selected route passes through this node (teal; never dimmed). */
  onRoute: boolean
  /** The location highlight marks this node (amber). */
  highlighted: boolean
}

export type OverviewCardNode = Node<OverviewCardData, 'overviewCard'>
export type OverviewSiteNode = Node<{ name: string }, 'overviewSite'>
export type OverviewFlowNode = OverviewSiteNode | OverviewCardNode

export interface OverviewLineData extends Record<string, unknown> {
  linkIds: string[]
  count: number
  /** The two node names, for the pill's accessible name. */
  names: [string, string]
  pair: string
  dimmed: boolean
  /** A cable of the selected route is among the pair's cables. */
  onRoute: boolean
  /** Where the count pill is drawn: on the line, clear of every card. */
  pill: Position
}

const MIXED = 'var(--mixed-networks)'
const ROUTE = 'var(--route)'
/** Frames sit behind every card; an open card sits above its neighbours. */
const FRAME_Z = -1
const OPEN_Z = 30

const byName = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

/** The equipment of the open nodes, by rack (name order) and then unit, name. */
function racksOf(
  index: SnapshotIndex,
  open: ReadonlySet<string>,
  marks?: RouteMarks,
): Map<string, OverviewRack[]> {
  const byNode = new Map<string, Map<string, OverviewRack>>()
  for (const e of index.equipment.values()) {
    const nodeId = index.places.get(e.id)?.nodeId
    if (!nodeId || !open.has(nodeId)) continue
    const rack = index.racks.get(e.rackId)
    if (!rack) continue
    let racks = byNode.get(nodeId)
    if (!racks) byNode.set(nodeId, (racks = new Map()))
    let r = racks.get(rack.id)
    if (!r)
      racks.set(rack.id, (r = { id: rack.id, name: rack.name, equipment: [] }))
    r.equipment.push({
      id: e.id,
      name: e.name,
      unit: e.unit,
      onRoute: !!marks?.equipment.has(e.id),
    })
  }
  return new Map(
    [...byNode].map(([nodeId, racks]) => [
      nodeId,
      [...racks.values()].sort(byName).map((r) => ({
        ...r,
        equipment: r.equipment.sort((a, b) => a.unit - b.unit || byName(a, b)),
      })),
    ]),
  )
}

/**
 * The overview as React Flow nodes and edges: one site frame behind everything,
 * one draggable card per node, one straight line per cabled pair labeled with
 * its cable count. A projection of the overview only: it never feeds a trace.
 */
export function projectOverview(args: {
  overview: Overview
  index: SnapshotIndex
  positions: ReadonlyMap<string, Position>
  frames: readonly SiteFrame[]
  openNodes: ReadonlySet<string>
  selected: string
  colors: ReadonlyMap<string, string>
  /** What the selected route touches; D11: it is never dimmed. */
  marks?: RouteMarks
  /** Nodes the location highlight marks. */
  highlighted?: ReadonlySet<string>
  /** Measured sizes of cards that are not the closed size (open cards). */
  sizes?: ReadonlyMap<string, { width: number; height: number }>
}): { nodes: OverviewFlowNode[]; edges: Edge[] } {
  const { overview, index, positions, frames, openNodes, selected, colors } =
    args
  const siteName = new Map(overview.sites.map((s) => [s.id, s.name]))
  const racks = openNodes.size
    ? racksOf(index, openNodes, args.marks)
    : new Map()
  const selectedNode = selected ? index.places.get(selected)?.nodeId : undefined

  const nodes: OverviewFlowNode[] = frames.map((f) => ({
    id: `site:${f.siteId}`,
    type: 'overviewSite',
    position: { x: f.x, y: f.y },
    data: { name: siteName.get(f.siteId) ?? f.siteId },
    style: { width: f.width, height: f.height },
    draggable: false,
    selectable: false,
    focusable: false,
    connectable: false,
    zIndex: FRAME_Z,
  }))
  for (const n of overview.nodes) {
    const open = openNodes.has(n.id)
    const onRoute = !!args.marks?.nodes.has(n.id)
    nodes.push({
      id: n.id,
      type: 'overviewCard',
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      focusable: false,
      zIndex: open ? OPEN_Z : 0,
      data: {
        id: n.id,
        name: n.name,
        equipmentCount: n.equipmentCount,
        tags: n.tags,
        proposed: n.proposed,
        dimmed: n.dimmed && !onRoute,
        onRoute,
        highlighted: !!args.highlighted?.has(n.id),
        open,
        racks: open ? (racks.get(n.id) ?? []) : [],
        selectedId: selectedNode === n.id ? selected : undefined,
      },
    })
  }

  const nodeName = new Map(overview.nodes.map((n) => [n.id, n.name]))
  const rects = new Map<string, Rect>()
  const centres = new Map<string, Position>()
  for (const n of overview.nodes) {
    const at = positions.get(n.id) ?? { x: 0, y: 0 }
    const size = args.sizes?.get(n.id) ?? {
      width: NODE_WIDTH,
      height: OVERVIEW_CARD_HEIGHT,
    }
    rects.set(n.id, {
      left: at.x,
      top: at.y,
      right: at.x + size.width,
      bottom: at.y + size.height,
    })
    centres.set(n.id, { x: at.x + size.width / 2, y: at.y + size.height / 2 })
  }
  const allRects = [...rects.values()]
  const edges: Edge[] = overview.pairs.map((p) => {
    const [a, b] = p.nodeIds
    const onRoute =
      !!args.marks && p.linkIds.some((id) => args.marks!.links.has(id))
    const data: OverviewLineData = {
      linkIds: p.linkIds,
      count: p.count,
      names: [nodeName.get(a) ?? a, nodeName.get(b) ?? b],
      pair: `${a}|${b}`,
      dimmed: p.dimmed && !onRoute,
      onRoute,
      pill: pillPoint(centres.get(a)!, centres.get(b)!, allRects),
    }
    return {
      id: `pair:${a}:${b}`,
      source: a,
      target: b,
      type: 'overviewLine',
      label: String(p.count),
      className: p.dimmed && !onRoute ? 'dimmed' : undefined,
      interactionWidth: 20,
      data,
      style: {
        stroke: onRoute
          ? ROUTE
          : p.networkId
            ? colorOf(colors, p.networkId)
            : MIXED,
        strokeWidth: siteLineWidth(p.count) + (onRoute ? 2 : 0),
        strokeLinecap: 'round' as const,
      },
    }
  })
  return { nodes, edges }
}

/** The cached layout with one node's position replaced (the optimistic update). */
export function withSavedMapPosition(
  layout: MapLayout,
  nodeId: string,
  x: number,
  y: number,
): MapLayout {
  const exists = layout.positions.some((p) => p.nodeId === nodeId)
  return {
    positions: exists
      ? layout.positions.map((p) =>
          p.nodeId === nodeId ? { nodeId, x, y } : p,
        )
      : [...layout.positions, { nodeId, x, y }],
  }
}

/** Puts a failed save back: the prior position, or none if the node had none. */
export function restoreMapPosition(
  layout: MapLayout,
  nodeId: string,
  prior: NodePosition | undefined,
): MapLayout {
  const rest = layout.positions.filter((p) => p.nodeId !== nodeId)
  return { positions: prior ? [...rest, prior] : rest }
}

export const withoutMapPositions = (_layout: MapLayout): MapLayout => ({
  positions: [],
})

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The smallest pan (in pixels, to add to the viewport) that brings `card` fully
 * inside `area`, keeping `margin` from its edges. A card larger than the area
 * is lined up with its near edge. The zoom is never part of it.
 */
export function panIntoView(
  card: Box,
  area: Box,
  margin = 16,
): { dx: number; dy: number } {
  const axis = (lo: number, hi: number, from: number, to: number) => {
    if (lo < from + margin) return from + margin - lo
    if (hi > to - margin) return Math.max(to - margin - hi, from + margin - lo)
    return 0
  }
  return {
    dx: axis(card.left, card.right, area.left, area.right),
    dy: axis(card.top, card.bottom, area.top, area.bottom),
  }
}

/**
 * Where to draw a pill on the line from `from` to `to` (the card centres the
 * edge joins): the midpoint of the longest stretch of the line that is outside
 * every card grown by `margin`. When the whole line is under cards, the plain
 * midpoint. The end cards belong in `cards`, so a pill never sits on them.
 */
export function pillPoint(
  from: Position,
  to: Position,
  cards: readonly Rect[],
  margin = 12,
): Position {
  const covered: [number, number][] = []
  for (const c of cards) {
    const t = clipSegment(from, to, {
      left: c.left - margin,
      top: c.top - margin,
      right: c.right + margin,
      bottom: c.bottom + margin,
    })
    if (t) covered.push(t)
  }
  covered.sort((x, y) => x[0] - y[0])
  let best: [number, number] | undefined
  const consider = (lo: number, hi: number) => {
    if (hi - lo > 1e-9 && (!best || hi - lo > best[1] - best[0]))
      best = [lo, hi]
  }
  let at = 0
  for (const [lo, hi] of covered) {
    if (lo > at) consider(at, lo)
    at = Math.max(at, hi)
  }
  consider(at, 1)
  const t = best ? (best[0] + best[1]) / 2 : 0.5
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

/** The nodes a location highlight marks: the node, or every node of the site. */
export function highlightedNodeIds(
  overview: Overview,
  location: LocationRef | undefined,
): Set<string> {
  if (!location) return new Set()
  return new Set(
    overview.nodes
      .filter(
        (n) => (location.kind === 'node' ? n.id : n.siteId) === location.id,
      )
      .map((n) => n.id),
  )
}
