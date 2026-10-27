import type { Edge, Node } from '@xyflow/react'
import type { RouteMarks } from '../physical/inventory'
import { resolveLocation, type LocationRef } from './highlight'
import type { HierarchyGroup, NetworkHierarchy } from './hierarchy'
import type { HierarchyLayout } from './hierarchyLayout'
import { colorOf } from './networkColors'
import type { SnapshotIndex } from './snapshotIndex'

export interface HierarchyTierData extends Record<string, unknown> {
  id: string
  /** A top, a mid AGG, or the "No AGG" card. */
  kind: 'top' | 'agg' | 'none'
  name: string
  role: string
  /** The place, as plain names for `Name`. */
  siteName: string
  nodeName: string
  color: string
  /** "N uplink to the top": the AGG reaches fewer of the tops than there are. */
  uplinkText?: string
  proposed: boolean
  onRoute: boolean
  highlighted: boolean
  hot: boolean
}

export interface HierarchyNodeData extends Record<string, unknown> {
  key: string
  nodeId?: string
  /** Empty when the switches have no node ("Not in a node"). */
  name: string
  siteName: string
  noNode: boolean
  switches: number
  single: number
  chained: number
  problem: boolean
  color: string
  proposed: boolean
  onRoute: boolean
  highlighted: boolean
  hot: boolean
}

export interface HierarchyFrameData extends Record<string, unknown> {
  groupKey: string
  kind: HierarchyGroup['kind']
  nodes: number
  switches: number
  withProblems: number
  /** Only the nodes with problems are drawn. */
  onlyProblems: boolean
  /** Only problems is on and none is drawn: "No problems here". */
  empty: boolean
}

export interface HierarchyLabelData extends Record<string, unknown> {
  text: string
}

export type HierarchyTierNode = Node<HierarchyTierData, 'hierarchyTier'>
export type HierarchyNodeNode = Node<HierarchyNodeData, 'hierarchyNode'>
export type HierarchyFrameNode = Node<HierarchyFrameData, 'hierarchyFrame'>
export type HierarchyLabelNode = Node<HierarchyLabelData, 'hierarchyLabel'>
export type HierarchyFlowNode =
  | HierarchyFrameNode
  | HierarchyLabelNode
  | HierarchyTierNode
  | HierarchyNodeNode

export interface HierarchyLineData extends Record<string, unknown> {
  /** A tier line, or the line from an AGG (or top) to its frame. */
  kind: 'uplink' | 'peer' | 'group'
  linkIds: string[]
  count: number
  weak: boolean
  proposed: boolean
  onRoute: boolean
  hot: boolean
}

const ROUTE = 'var(--route)'
const HOT = 'var(--amber)'
const PROPOSED = 'var(--proposed)'
/** Frames sit behind every card. */
const FRAME_Z = -1

/** The node cards of the site or node, and the tier cards placed there. */
export function highlightedCards(
  h: NetworkHierarchy,
  index: SnapshotIndex,
  location: LocationRef | undefined,
): ReadonlySet<string> {
  const at = resolveLocation(index, location)
  const out = new Set<string>()
  if (!at) return out
  const here = (place: { nodeId?: string; siteId?: string } | undefined) =>
    (at.kind === 'node' ? place?.nodeId : place?.siteId) === at.id
  for (const g of h.groups)
    for (const c of g.nodes)
      if (here({ nodeId: c.nodeId, siteId: c.siteId })) out.add(c.key)
  for (const id of [...h.topIds, ...h.aggIds])
    if (here(index.places.get(id))) out.add(id)
  return out
}

/** The selected card, and for a node card the AGGs of its switches. */
export function hotCards(
  h: NetworkHierarchy,
  selected: string | undefined,
): ReadonlySet<string> {
  const out = new Set<string>()
  if (selected === undefined) return out
  for (const g of h.groups) {
    const card = g.nodes.find((c) => c.key === selected)
    if (!card) continue
    out.add(card.key)
    for (const id of card.switchIds)
      for (const agg of h.switches.get(id)?.aggIds ?? []) out.add(agg)
    return out
  }
  if (h.topIds.includes(selected) || h.aggIds.includes(selected))
    out.add(selected)
  return out
}

/**
 * The hierarchy as React Flow nodes and edges: a frame per group behind
 * everything, the tier labels, a card per top and AGG, a card per node, a line
 * per tier line and one from each AGG (or top) to its frame. A projection of
 * the hierarchy only: it never feeds a trace, the route lights what it touches
 * and nothing moves or dims.
 */
export function projectHierarchy(args: {
  h: NetworkHierarchy
  layout: HierarchyLayout
  index: SnapshotIndex
  colors: ReadonlyMap<string, string>
  /** What the selected route touches; D11: it is never dimmed. */
  marks: RouteMarks
  /** Cards the location highlight marks (`highlightedCards`). */
  highlighted: ReadonlySet<string>
  /** The selected card and its AGGs (`hotCards`). */
  hot: ReadonlySet<string>
}): { nodes: HierarchyFlowNode[]; edges: Edge[] } {
  const { h, layout, index, marks, highlighted, hot } = args
  const color = colorOf(args.colors, h.networkId)
  const lit = (id: string) => marks.equipment.has(id)
  const style = (b: { w: number; h: number }) => ({ width: b.w, height: b.h })
  const fixed = {
    draggable: false,
    selectable: false,
    focusable: false,
    connectable: false,
  } as const

  const nodes: HierarchyFlowNode[] = []
  const cardOnRoute = new Map<string, boolean>()
  for (const g of h.groups) {
    const frame = layout.frames.get(g.key)
    if (!frame) continue
    const visible = g.nodes.filter((c) => layout.boxes.has(c.key))
    nodes.push({
      id: `frame:${g.key}`,
      type: 'hierarchyFrame',
      position: { x: frame.x, y: frame.y },
      style: style(frame),
      zIndex: FRAME_Z,
      ...fixed,
      data: {
        groupKey: g.key,
        kind: g.kind,
        nodes: g.nodes.length,
        switches: g.switches,
        withProblems: g.problemNodes,
        onlyProblems: layout.onlyProblems,
        empty: layout.onlyProblems && visible.length === 0,
      },
    })
  }
  for (const l of layout.labels)
    nodes.push({
      id: `label:${l.text}`,
      type: 'hierarchyLabel',
      position: { x: l.x, y: l.y },
      ...fixed,
      data: { text: l.text },
    })

  const tier = (id: string, kind: 'top' | 'agg' | 'none') => {
    const box = layout.boxes.get(id)
    if (!box) return
    const e = index.equipment.get(id)
    const place = index.places.get(id)
    const reached = h.topsReached.get(id) ?? 0
    nodes.push({
      id: kind === 'none' ? 'none' : id,
      type: 'hierarchyTier',
      position: { x: box.x, y: box.y },
      style: style(box),
      ...fixed,
      data: {
        id,
        kind,
        name: e?.name ?? '',
        role: e?.role ?? '',
        siteName: index.sites.get(place?.siteId ?? '')?.name ?? '',
        nodeName: index.nodes.get(place?.nodeId ?? '')?.name ?? '',
        color,
        uplinkText:
          kind === 'agg' && reached > 0 && reached < h.topIds.length
            ? `${reached} uplink${reached === 1 ? '' : 's'} to the top`
            : undefined,
        proposed: h.proposed.has(id),
        onRoute: kind !== 'none' && lit(id),
        highlighted: highlighted.has(id),
        hot: hot.has(id),
      },
    })
  }
  for (const id of h.topIds) tier(id, 'top')
  for (const g of h.groups) {
    if (g.kind === 'none') tier('none', 'none')
    for (const id of g.kind === 'aggs' ? g.aggIds : []) tier(id, 'agg')
  }

  for (const g of h.groups)
    for (const c of g.nodes) {
      const box = layout.boxes.get(c.key)
      if (!box) continue
      const node = c.nodeId ? index.nodes.get(c.nodeId) : undefined
      const onRoute = c.switchIds.some(lit)
      cardOnRoute.set(c.key, onRoute)
      nodes.push({
        id: c.key,
        type: 'hierarchyNode',
        position: { x: box.x, y: box.y },
        style: style(box),
        ...fixed,
        data: {
          key: c.key,
          nodeId: c.nodeId,
          name: node?.name ?? '',
          siteName: index.sites.get(c.siteId ?? '')?.name ?? '',
          noNode: c.nodeId === undefined,
          switches: c.switchIds.length,
          single: c.single,
          chained: c.chained,
          problem: c.problem,
          color,
          proposed: c.proposed,
          onRoute,
          highlighted: highlighted.has(c.key),
          hot: hot.has(c.key),
        },
      })
    }

  const edges: Edge[] = []
  const line = (
    id: string,
    source: string,
    target: string,
    handles: [string, string],
    data: HierarchyLineData,
  ) => {
    const classes = [
      data.weak && 'weak',
      data.kind === 'peer' && 'peer',
      data.proposed && 'proposed',
      data.onRoute && 'on-route',
      data.hot && 'hot',
    ].filter(Boolean)
    edges.push({
      id,
      source,
      target,
      sourceHandle: handles[0],
      targetHandle: handles[1],
      type: 'hierarchyLine',
      className: classes.join(' ') || undefined,
      interactionWidth: 20,
      data,
      style: {
        stroke: data.onRoute
          ? ROUTE
          : data.hot
            ? HOT
            : data.proposed
              ? PROPOSED
              : color,
        strokeWidth: 2 + (data.onRoute ? 2 : 0),
        strokeLinecap: 'round' as const,
      },
    })
  }
  for (const l of h.lines) {
    const linkIds = l.circuits.flatMap((c) => c.linkIds)
    const data: HierarchyLineData = {
      kind: l.kind,
      linkIds,
      count: l.circuits.length,
      weak: l.weak,
      proposed: l.proposed,
      onRoute: linkIds.some((id) => marks.links.has(id)),
      hot: l.kind === 'uplink' ? hot.has(l.b) : hot.has(l.a) && hot.has(l.b),
    }
    if (l.kind === 'uplink') {
      line(`line:${l.key}`, l.a, l.b, ['bottom', 'top'], data)
      continue
    }
    const [left, right] =
      layout.boxes.get(l.a)!.x <= layout.boxes.get(l.b)!.x
        ? [l.a, l.b]
        : [l.b, l.a]
    line(`line:${l.key}`, left, right, ['right', 'left'], data)
  }
  for (const g of h.groups) {
    if (g.kind === 'none' || !layout.frames.has(g.key)) continue
    const from = g.kind === 'top' ? g.topIds : g.aggIds
    const cardsHot = g.nodes.some((c) => hot.has(c.key))
    const cardsLit = g.nodes.some((c) => cardOnRoute.get(c.key))
    for (const id of from)
      line(`group:${g.key}:${id}`, id, `frame:${g.key}`, ['bottom', 'top'], {
        kind: 'group',
        linkIds: [],
        count: 0,
        weak: false,
        proposed: g.proposedFrom.includes(id),
        onRoute: lit(id) && cardsLit,
        hot: hot.has(id) && cardsHot,
      })
  }
  return { nodes, edges }
}
