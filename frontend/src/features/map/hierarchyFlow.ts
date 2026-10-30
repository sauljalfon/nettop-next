import type { Edge, Node } from '@xyflow/react'
import type { RouteMarks } from '../physical/inventory'
import { resolveLocation, type LocationRef } from './highlight'
import type { HierarchyGroup, NetworkHierarchy } from './hierarchy'
import { MARK_TEXT } from './hierarchyDetails'
import type { Lit, Selection } from './hierarchySelection'
import type { HierarchyLayout } from './hierarchyLayout'
import { colorOf } from './networkColors'
import type { SnapshotIndex } from './snapshotIndex'

/**
 * What a selection does to a thing on the tree: on the selected thing's way up
 * or among what depends on it it is lit, the rest is dimmed. Undefined when
 * nothing is selected (or the selection is on no network's tree).
 */
export type Emphasis = 'lit' | 'dim'

/** The marks a card, row, frame or line carries for the selection, as `data-*` attributes. */
export const emphasisMarks = (e: Emphasis | undefined, selected = false) => ({
  'data-lit': e === 'lit' ? true : undefined,
  'data-dim': e === 'dim' ? true : undefined,
  'data-selected': selected ? true : undefined,
})

/** A top (a BB, or the Top AGG): a card of its own in the left column. */
export interface HierarchyTierData extends Record<string, unknown> {
  id: string
  kind: 'top'
  name: string
  role: string
  /** The place, as plain names for `Name`. */
  siteName: string
  nodeName: string
  color: string
  proposed: boolean
  onRoute: boolean
  highlighted: boolean
  hot: boolean
  emphasis?: Emphasis
  selected: boolean
}

/** One AGG, a button inside its frame. */
export interface HierarchyFrameAgg {
  id: string
  name: string
  siteName: string
  nodeName: string
  /** The AGG reaches no top while the network has one: "no BB". */
  noTop: boolean
  /** "N uplink to the top": the AGG reaches fewer of the tops than there are. */
  title?: string
  proposed: boolean
  onRoute: boolean
  highlighted: boolean
  hot: boolean
  emphasis?: Emphasis
  selected: boolean
}

/** One row of an open card: a switch, its mark in words or the 2 uplinks badge. */
export interface HierarchyCardRow {
  id: string
  name: string
  mark?: string
  twoUplinks: boolean
  emphasis?: Emphasis
  selected: boolean
  /** The selection fails and this switch has no other way up. */
  cutOff: boolean
}

/** One part of an open card's quiet line: "2 on another AGG" or "3 on <Network B>". */
export interface HierarchyElsewhere {
  /** On another card of this network. */
  own: boolean
  networkName: string
  count: number
}

export interface HierarchyNodeData extends Record<string, unknown> {
  key: string
  nodeId?: string
  /** Empty when the switches have no node ("Not in a node"). */
  name: string
  siteName: string
  noNode: boolean
  switches: number
  /** Its switches with a mark. */
  faults: number
  twoUplinks: number
  chained: number
  problem: boolean
  color: string
  proposed: boolean
  onRoute: boolean
  highlighted: boolean
  hot: boolean
  emphasis?: Emphasis
  selected: boolean
  open: boolean
  /** Only when open. */
  rows: HierarchyCardRow[]
  elsewhere: HierarchyElsewhere[]
}

/** A group's frame: its AGGs, or "Direct to BB" / "No AGG". */
export interface HierarchyFrameData extends Record<string, unknown> {
  groupKey: string
  kind: HierarchyGroup['kind']
  topKind: NetworkHierarchy['topKind']
  aggs: HierarchyFrameAgg[]
  nodes: number
  switches: number
  withProblems: number
  emphasis?: Emphasis
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
  /** From a top to a frame, or from a frame to one of its cards. */
  kind: 'uplink' | 'group'
  linkIds: string[]
  count: number
  proposed: boolean
  onRoute: boolean
  hot: boolean
  emphasis?: Emphasis
  /** The x of the line's vertical stretch. */
  bendX: number
}

const ROUTE = 'var(--route)'
const HOT = 'var(--amber)'
const PROPOSED = 'var(--proposed)'

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
 * The hierarchy as React Flow nodes and edges: a frame per group, the column
 * heads, a card per top, a card per node, a line from each top to the frames it
 * is cabled to and one from each frame to its cards. A projection of the
 * hierarchy only: it never feeds a trace, the route lights what it touches and
 * nothing moves or dims.
 */
export function projectHierarchy(args: {
  h: NetworkHierarchy
  layout: HierarchyLayout
  index: SnapshotIndex
  colors: ReadonlyMap<string, string>
  /** What the selected route touches; D11: it is never dimmed. */
  marks: RouteMarks
  /** The node cards that are open (`mapSession.openNodes`). */
  open: ReadonlySet<string>
  /** Cards the location highlight marks (`highlightedCards`). */
  highlighted: ReadonlySet<string>
  /** The selected card and its AGGs (`hotCards`). */
  hot: ReadonlySet<string>
  /** What the selection lights (`litBy`); nothing is dimmed without it. */
  lit?: Lit
  selection?: Selection
}): { nodes: HierarchyFlowNode[]; edges: Edge[] } {
  const { h, layout, index, marks, open, highlighted, hot, selection } = args
  // A selection on another network lights nothing here.
  const lit = args.lit?.networkId === h.networkId ? args.lit : undefined
  const emphasis = (isLit: boolean): Emphasis | undefined =>
    lit ? (isLit ? 'lit' : 'dim') : undefined
  const selectedId = selection?.kind === 'equipment' ? selection.id : undefined
  const color = colorOf(args.colors, h.networkId)
  const onRouteOf = (id: string) => marks.equipment.has(id)
  const style = (b: { w: number; h: number }) => ({ width: b.w, height: b.h })
  const placeOf = (id: string) => {
    const place = index.places.get(id)
    return {
      siteName: index.sites.get(place?.siteId ?? '')?.name ?? '',
      nodeName: index.nodes.get(place?.nodeId ?? '')?.name ?? '',
    }
  }
  const fixed = {
    draggable: false,
    selectable: false,
    focusable: false,
    connectable: false,
  } as const

  const aggOf = (id: string): HierarchyFrameAgg => {
    const reached = h.topsReached.get(id) ?? 0
    return {
      id,
      name: index.equipment.get(id)?.name ?? '',
      ...placeOf(id),
      noTop: h.noTop.has(id),
      title:
        reached > 0 && reached < h.topIds.length
          ? `${reached} uplink${reached === 1 ? '' : 's'} to the top`
          : undefined,
      proposed: h.proposed.has(id),
      onRoute: onRouteOf(id),
      highlighted: highlighted.has(id),
      hot: hot.has(id),
      emphasis: emphasis(!!lit?.aggs.has(id)),
      selected: selectedId === id,
    }
  }

  const nodes: HierarchyFlowNode[] = []
  for (const g of h.groups) {
    const frame = layout.frames.get(g.key)
    if (!frame) continue
    nodes.push({
      id: `frame:${g.key}`,
      type: 'hierarchyFrame',
      position: { x: frame.x, y: frame.y },
      style: style(frame),
      ...fixed,
      data: {
        groupKey: g.key,
        kind: g.kind,
        topKind: h.topKind,
        aggs: g.kind === 'aggs' ? g.aggIds.map(aggOf) : [],
        nodes: g.nodes.length,
        switches: g.switches,
        withProblems: g.problemNodes,
        emphasis: emphasis(!!lit?.frames.has(g.key)),
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

  for (const id of h.topIds) {
    const box = layout.boxes.get(id)
    if (!box) continue
    const e = index.equipment.get(id)
    nodes.push({
      id,
      type: 'hierarchyTier',
      position: { x: box.x, y: box.y },
      style: style(box),
      ...fixed,
      data: {
        id,
        kind: 'top',
        name: e?.name ?? '',
        role: e?.role ?? '',
        ...placeOf(id),
        color,
        proposed: h.proposed.has(id),
        onRoute: onRouteOf(id),
        highlighted: highlighted.has(id),
        hot: hot.has(id),
        emphasis: emphasis(!!lit?.tops.has(id)),
        selected: selectedId === id,
      },
    })
  }

  const cardOnRoute = new Map<string, boolean>()
  for (const g of h.groups)
    for (const c of g.nodes) {
      const box = layout.boxes.get(c.key)
      if (!box) continue
      const node = c.nodeId ? index.nodes.get(c.nodeId) : undefined
      const onRoute = c.switchIds.some(onRouteOf)
      cardOnRoute.set(c.key, onRoute)
      const isOpen = open.has(c.key)
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
          faults: c.switchIds.filter((id) => h.switches.get(id)?.mark).length,
          twoUplinks: c.twoUplinks,
          chained: c.chained,
          problem: c.problem,
          color,
          proposed: c.proposed,
          onRoute,
          highlighted: highlighted.has(c.key),
          hot: hot.has(c.key),
          emphasis: emphasis(!!lit?.cards.has(c.key)),
          selected:
            selection?.kind === 'card' &&
            selection.networkId === h.networkId &&
            selection.key === c.key,
          open: isOpen,
          rows: isOpen
            ? c.switchIds.map((id) => {
                const s = h.switches.get(id)
                return {
                  id,
                  name: index.equipment.get(id)?.name ?? '',
                  mark: s?.mark ? MARK_TEXT[s.mark] : undefined,
                  twoUplinks: !!s?.twoUplinks,
                  emphasis: emphasis(!!lit?.switches.has(id)),
                  selected: selectedId === id,
                  cutOff: !!lit?.cutOff.has(id),
                }
              })
            : [],
          elsewhere: isOpen
            ? c.elsewhere.map((x) => ({
                own: x.networkId === h.networkId,
                networkName: index.networkNames.get(x.networkId) ?? x.networkId,
                count: x.count,
              }))
            : [],
        },
      })
    }

  const edges: Edge[] = []
  const line = (
    id: string,
    source: string,
    target: string,
    data: HierarchyLineData,
  ) => {
    const classes = [
      data.proposed && 'proposed',
      data.onRoute && 'on-route',
      data.hot && 'hot',
    ].filter(Boolean)
    edges.push({
      id,
      source,
      target,
      sourceHandle: 'right',
      targetHandle: 'left',
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

  // From each top to every frame whose AGGs it is cabled to (a frame of
  // switches cabled straight to a top: that top).
  h.topIds.forEach((top, k) => {
    for (const g of h.groups) {
      const frame = layout.frames.get(g.key)
      if (!frame) continue
      const bendX = frame.x - 24 + k * 8
      if (g.kind === 'aggs') {
        const lines = h.lines.filter(
          (l) => l.kind === 'uplink' && l.a === top && g.aggIds.includes(l.b),
        )
        if (lines.length === 0) continue
        const linkIds = lines.flatMap((l) =>
          l.circuits.flatMap((c) => c.linkIds),
        )
        line(`line:uplink:${top}|${g.key}`, top, `frame:${g.key}`, {
          kind: 'uplink',
          linkIds,
          count: lines.reduce((n, l) => n + l.circuits.length, 0),
          proposed: lines.every((l) => l.proposed),
          onRoute: linkIds.some((id) => marks.links.has(id)),
          hot: lines.some((l) => hot.has(l.b)),
          emphasis: emphasis(
            !!lit?.tops.has(top) &&
              (lit.frames.has(g.key) || g.aggIds.some((a) => lit.aggs.has(a))),
          ),
          bendX,
        })
      } else if (g.kind === 'top' && g.topIds.includes(top))
        line(`line:uplink:${top}|${g.key}`, top, `frame:${g.key}`, {
          kind: 'uplink',
          linkIds: [],
          count: 0,
          proposed: g.proposedFrom.includes(top),
          onRoute:
            onRouteOf(top) && g.nodes.some((c) => cardOnRoute.get(c.key)),
          hot: hot.has(top) && g.nodes.some((c) => hot.has(c.key)),
          emphasis: emphasis(!!lit?.tops.has(top) && lit.frames.has(g.key)),
          bendX,
        })
    }
  })
  // From each frame to its cards.
  for (const g of h.groups) {
    if (!layout.frames.has(g.key)) continue
    for (const c of g.nodes) {
      const box = layout.boxes.get(c.key)
      if (!box) continue
      line(`group:${c.key}`, `frame:${g.key}`, c.key, {
        kind: 'group',
        linkIds: [],
        count: 0,
        proposed: c.proposed,
        // The route runs through the frame's AGGs (or the top) into the card.
        onRoute:
          !!cardOnRoute.get(c.key) &&
          (g.kind === 'aggs'
            ? g.aggIds
            : g.kind === 'top'
              ? g.topIds
              : []
          ).some(onRouteOf),
        hot: hot.has(c.key),
        emphasis: emphasis(!!lit?.cards.has(c.key)),
        bendX: box.x - 16,
      })
    }
  }
  return { nodes, edges }
}
