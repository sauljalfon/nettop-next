import type { Equipment, Route, Snapshot } from '../../shared/types'
import { routeHighlight } from '../pathfinding/projection'
import { crossNetworkCaption, mapEdges } from './edges'
import { facetEndpointIds, facetsFor, type Facet } from './facets'
import { highlightFor } from './highlight'
import { layeredLayout, type Position } from './layout'
import type { MapSession } from './mapSession'
import { indexSnapshot, type SnapshotIndex } from './snapshotIndex'
import { visibleEquipment } from './networks'

export interface MapInput {
  snapshot: Snapshot
  session: MapSession
  /** One network, or undefined for All networks. Presentation only. */
  networkId?: string
  /** The selected route; reveals its cards and automatic facets. */
  route?: Route
  installedIDs: ReadonlySet<string>
  installedLinkIDs: ReadonlySet<string>
  /** Snapshot-only results; computed here when absent. Memoize on the snapshot. */
  index?: SnapshotIndex
}

export interface MapCardData extends Record<string, unknown> {
  equipment: Equipment
  location: string
  summary: { cabled: number; total: number }
  /** Network names of the circuits through a passive card. */
  badges: string[]
  facets: Facet[]
  /** Facet keys the user chose to show on this card. */
  manualKeys: string[]
  /** On the selected route: teal, and never dimmed. */
  highlighted: boolean
  /** In the highlighted location, or at the far end of a cable from it. */
  highlightRole?: 'card' | 'neighbor'
  /** Faded: a location is highlighted and this card is neither in it nor on the route. */
  dimmed: boolean
  proposed: boolean
}
export interface MapNode {
  id: string
  type: 'equipment'
  position: Position
  data: MapCardData
}
export interface MapFlowEdge {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  label?: string
  data: {
    /** Every cable ID drawn by this line (one, or a bundle's). */
    linkIds: string[]
    /** A cable on this line is on the selected route. */
    highlighted: boolean
    /** A cable on this line leaves the highlighted location. */
    highlight: boolean
    /** Faded: a location is highlighted and no cable here is on it or on the route. */
    dimmed: boolean
    proposed: boolean
    networkId: string
  }
}

/**
 * Projects a snapshot onto the conceptual map: one card per shown equipment,
 * one line per cable (or per bundle of parallel summary cables). Cards without
 * a recorded position get their first layout and are recorded in the session,
 * so existing positions never move when data, filter or route change. Never
 * mutates the snapshot and never feeds traversal.
 */
/** The projection's route and highlight IDs, independent of what is drawn on screen. */
export interface MapMarks {
  /** Cables of the selected route that the map draws, sorted. */
  routeLinks: string[]
  routeCards: string[]
  /** Cables leaving the highlighted location that the map draws, sorted. */
  highlightLinks: string[]
  /** Shown cards in the highlighted location. */
  highlightCards: string[]
  /** Shown cards at the far ends of its cables. */
  highlightNeighbors: string[]
  /** Shown cards that are faded. */
  dimmedCards: string[]
  /** Every card the map shows (drawn or not), sorted. */
  cards: string[]
}

export function projectMap(input: MapInput): {
  nodes: MapNode[]
  edges: MapFlowEdge[]
  marks: MapMarks
} {
  const { snapshot: s, session, route } = input
  session.placeMissing(
    s.equipment.map((e) => e.id),
    (missing) => {
      const wanted = new Set(missing)
      const have = new Map<string, Position>()
      for (const [id, p] of session.positions()) have.set(id, p)
      const layout = layeredLayout(s, have)
      return new Map([...layout].filter(([id]) => wanted.has(id)))
    },
  )

  const index = input.index ?? indexSnapshot(s)
  const highlight = routeHighlight(s, route)
  const lit = highlightFor(index, session.highlight())
  const litCards = new Set(lit?.equipmentIds)
  const litNeighbors = new Set(lit?.neighborIds)
  const litLinks = new Set(lit?.linkIds)
  // Route cards and the highlighted part are shown whatever the network filter says.
  const revealed = new Set(highlight.equipmentIds)
  if (lit)
    for (const id of [...lit.equipmentIds, ...lit.neighborIds]) revealed.add(id)
  const shown = new Set([
    ...visibleEquipment(s, input.networkId, [], index.badges),
    ...revealed,
  ])
  const manual = session.manualFacets()
  const facets = facetsFor(s, route, manual, index.lookup)
  const networkName = (id: string) =>
    s.networks.find((n) => n.id === id)?.name ?? id

  const nodes: MapNode[] = s.equipment
    .filter((e) => shown.has(e.id))
    .map((e) => ({
      id: e.id,
      type: 'equipment',
      position: session.position(e.id)!,
      data: {
        equipment: e,
        location: index.locations.get(e.id) ?? '',
        summary: index.summaries.get(e.id) ?? { cabled: 0, total: 0 },
        badges: (index.badges.get(e.id) ?? []).map(networkName),
        facets: facets.get(e.id) ?? [],
        manualKeys: [...(manual.get(e.id) ?? [])].sort(),
        highlighted: highlight.equipmentIds.has(e.id),
        highlightRole: litCards.has(e.id)
          ? 'card'
          : litNeighbors.has(e.id)
            ? 'neighbor'
            : undefined,
        // A highlight dims everything that is not part of it; the route is never dimmed.
        dimmed:
          !!lit &&
          !litCards.has(e.id) &&
          !litNeighbors.has(e.id) &&
          !highlight.equipmentIds.has(e.id),
        proposed: !input.installedIDs.has(e.id),
      },
    }))
  const x = new Map(nodes.map((n) => [n.id, n.position.x]))

  const { edges: cables, bundles } = mapEdges(
    s,
    shown,
    facetEndpointIds(facets),
    index.circuits,
  )
  const caption = (networkId: string) =>
    crossNetworkCaption(networkId, input.networkId, s.networks)
  const edges: MapFlowEdge[] = []
  const push = (
    id: string,
    a: { card: string; handle: string },
    b: { card: string; handle: string },
    label: string | undefined,
    linkIds: string[],
    networkId: string,
  ) => {
    const onRoute = linkIds.some((l) => highlight.linkIds.has(l))
    // Always draw left to right.
    const flip = (x.get(a.card) ?? 0) > (x.get(b.card) ?? 0)
    const [from, to] = flip ? [b, a] : [a, b]
    edges.push({
      id,
      source: from.card,
      target: to.card,
      sourceHandle: from.handle,
      targetHandle: to.handle,
      label,
      data: {
        linkIds,
        highlighted: onRoute,
        highlight: linkIds.some((l) => litLinks.has(l)),
        dimmed: !!lit && !onRoute && !linkIds.some((l) => litLinks.has(l)),
        proposed: linkIds.some((l) => !input.installedLinkIDs.has(l)),
        networkId,
      },
    })
  }
  for (const e of cables) {
    const cross = caption(e.networkId)
    push(
      e.id,
      { card: e.source, handle: e.sourceHandle },
      { card: e.target, handle: e.targetHandle },
      cross,
      [e.id],
      e.networkId,
    )
  }
  for (const b of bundles) {
    const cross = caption(b.networkId)
    push(
      b.id,
      { card: b.source, handle: 'summary' },
      { card: b.target, handle: 'summary' },
      cross ? `${b.label} · ${cross}` : b.label,
      b.linkIds,
      b.networkId,
    )
  }

  edges.sort((a, b) => a.id.localeCompare(b.id))
  const drawn = (wanted: ReadonlySet<string>) =>
    [
      ...new Set(
        edges.flatMap((e) => e.data.linkIds.filter((l) => wanted.has(l))),
      ),
    ].sort()
  const cardIds = (keep: (n: MapNode) => boolean) =>
    nodes
      .filter(keep)
      .map((n) => n.id)
      .sort()
  const marks: MapMarks = {
    routeLinks: drawn(highlight.linkIds),
    routeCards: cardIds((n) => n.data.highlighted),
    highlightLinks: drawn(litLinks),
    highlightCards: cardIds((n) => n.data.highlightRole === 'card'),
    highlightNeighbors: cardIds((n) => n.data.highlightRole === 'neighbor'),
    dimmedCards: cardIds((n) => n.data.dimmed),
    cards: cardIds(() => true),
  }
  return { nodes, edges, marks }
}
