import type { Equipment, Route, Snapshot } from '../../shared/types'
import { routeHighlight } from '../pathfinding/projection'
import { crossNetworkCaption, mapEdges } from './edges'
import { facetEndpointIds, facetsFor, type Facet } from './facets'
import { focusView, type BoundaryBundle, type Focus } from './focus'
import {
  COLUMN_WIDTH,
  layeredLayout,
  ROW_HEIGHT,
  type Position,
} from './layout'
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
  /** Focusing on this card's node; undefined when its location is unknown. */
  focusNode?: Focus
  summary: { cabled: number; total: number }
  /** Network names of the circuits through a passive card. */
  badges: string[]
  facets: Facet[]
  /** Facet keys the user chose to show on this card. */
  manualKeys: string[]
  highlighted: boolean
  proposed: boolean
}
export interface MapNode {
  id: string
  type: 'equipment'
  position: Position
  data: MapCardData
}
/** A compact card summarizing the cables that leave the focus toward one location. */
export interface MapBoundaryNode {
  id: string
  type: 'boundary'
  position: Position
  data: { bundle: BoundaryBundle }
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
  boundaries: MapBoundaryNode[]
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

  const index = input.index ?? indexSnapshot(s)
  const highlight = routeHighlight(s, route)
  const passes = visibleEquipment(s, input.networkId, [], index.badges)
  const { shown, bundles: boundaryBundles } = focusView(index, {
    focus: session.focus(),
    passes,
    reveal: highlight.equipmentIds,
    expanded: session.expandedBundles(),
  })
  const manual = session.manualFacets()
  session.placeMissing(
    boundaryBundles.map((b) => b.id),
    (missing) => boundaryPositions(boundaryBundles, missing, session),
  )
  const boundaries: MapBoundaryNode[] = boundaryBundles.map((bundle) => ({
    id: bundle.id,
    type: 'boundary',
    position: session.position(bundle.id)!,
    data: { bundle },
  }))
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
        focusNode: nodeFocus(index.places.get(e.id)?.nodeId),
        summary: index.summaries.get(e.id) ?? { cabled: 0, total: 0 },
        badges: (index.badges.get(e.id) ?? []).map(networkName),
        facets: facets.get(e.id) ?? [],
        manualKeys: [...(manual.get(e.id) ?? [])].sort(),
        highlighted: highlight.equipmentIds.has(e.id),
        proposed: !input.installedIDs.has(e.id),
      },
    }))
  const x = new Map(nodes.map((n) => [n.id, n.position.x]))
  for (const b of boundaries) x.set(b.id, b.position.x)

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

  for (const bundle of boundaryBundles) {
    if (bundle.expanded) continue // the real edges replace the summary lines
    const byInside = new Map<string, string[]>()
    for (const c of bundle.cables)
      byInside.set(c.insideEquipmentId, [
        ...(byInside.get(c.insideEquipmentId) ?? []),
        c.linkId,
      ])
    for (const [inside, linkIds] of byInside)
      push(
        `${bundle.id}>${inside}`,
        { card: inside, handle: 'summary' },
        { card: bundle.id, handle: 'summary' },
        undefined,
        linkIds,
        '',
      )
  }
  edges.sort((a, b) => a.id.localeCompare(b.id))
  return { nodes, boundaries, edges }
}

const nodeFocus = (id: string | undefined): Focus | undefined =>
  id ? { kind: 'node', id } : undefined

/**
 * First position of each new boundary card: one column right of its focused
 * cards, at their average height, nudged down until it is free.
 */
function boundaryPositions(
  bundles: readonly BoundaryBundle[],
  missing: readonly string[],
  session: MapSession,
) {
  const taken = new Set(
    [...session.positions().values()].map((p) => `${p.x},${p.y}`),
  )
  const result = new Map<string, Position>()
  for (const id of missing) {
    const bundle = bundles.find((b) => b.id === id)!
    const inside = bundle.insideEquipment
      .map((e) => session.position(e))
      .filter((p): p is Position => !!p)
    const x = Math.max(0, ...inside.map((p) => p.x)) + COLUMN_WIDTH
    let y = inside.length
      ? Math.round(inside.reduce((n, p) => n + p.y, 0) / inside.length)
      : 0
    while (taken.has(`${x},${y}`)) y += ROW_HEIGHT / 2
    taken.add(`${x},${y}`)
    result.set(id, { x, y })
  }
  return result
}
