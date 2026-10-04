import type { Equipment, Route, Snapshot } from '../../shared/types'
import { routeHighlight } from '../pathfinding/projection'
import { crossNetworkCaption, mapEdges } from './edges'
import { facetEndpointIds, facetsFor, type Facet } from './facets'
import { layeredLayout, type Position } from './layout'
import { cabledSummary, locationLabel } from './location'
import type { MapSession } from './mapSession'
import { passiveNetworks, visibleEquipment } from './networks'

export interface MapInput {
  snapshot: Snapshot
  session: MapSession
  /** One network, or undefined for All networks. Presentation only. */
  networkId?: string
  /** The selected route; reveals its cards and automatic facets. */
  route?: Route
  installedIDs: ReadonlySet<string>
  installedLinkIDs: ReadonlySet<string>
}

export interface MapCardData extends Record<string, unknown> {
  equipment: Equipment
  location: string
  summary: { cabled: number; total: number }
  /** Network names of the circuits through a passive card. */
  badges: string[]
  facets: Facet[]
  highlighted: boolean
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
    highlighted: boolean
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
export function projectMap(input: MapInput): {
  nodes: MapNode[]
  edges: MapFlowEdge[]
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

  const highlight = routeHighlight(s, route)
  const shown = visibleEquipment(s, input.networkId, highlight.equipmentIds)
  const facets = facetsFor(s, route)
  const badges = passiveNetworks(s)
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
        location: locationLabel(s, e.id),
        summary: cabledSummary(s, e.id),
        badges: (badges.get(e.id) ?? []).map(networkName),
        facets: facets.get(e.id) ?? [],
        highlighted: highlight.equipmentIds.has(e.id),
        proposed: !input.installedIDs.has(e.id),
      },
    }))
  const x = new Map(nodes.map((n) => [n.id, n.position.x]))

  const { edges: cables, bundles } = mapEdges(
    s,
    shown,
    facetEndpointIds(facets),
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
        highlighted: linkIds.some((l) => highlight.linkIds.has(l)),
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
  return { nodes, edges }
}
