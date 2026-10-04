import type { Snapshot } from '../../shared/types'

/** Handle ID of a card's summary anchor, used when the endpoint is not a facet. */
export const SUMMARY_HANDLE = 'summary'

export interface MapEdge {
  /** The cable ID. */
  id: string
  source: string
  target: string
  sourceEndpointId: string
  targetEndpointId: string
  /** The endpoint ID when shown as a facet, otherwise SUMMARY_HANDLE. */
  sourceHandle: string
  targetHandle: string
}

/** Parallel summary-anchored cables between two cards, drawn as one line. */
export interface MapBundle {
  id: string
  source: string
  target: string
  /** Every cable ID in the bundle, sorted. */
  linkIds: string[]
  label: string
}

/**
 * One edge per cable between shown cards. Cables whose both ends are summary
 * anchors and that run between the same pair of cards are bundled ("N cables"),
 * keeping every cable ID. Edges, bundles and anchors are drawing aids only;
 * traversal never uses them.
 */
export function mapEdges(
  s: Snapshot,
  shown: ReadonlySet<string>,
  facetEndpoints: ReadonlySet<string>,
): { edges: MapEdge[]; bundles: MapBundle[] } {
  const owner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId]))
  const cables = s.links
    .filter((l) => l.kind === 'cable')
    .sort((a, b) => a.id.localeCompare(b.id))
  const edges: MapEdge[] = []
  const groups = new Map<string, MapEdge[]>()
  for (const l of cables) {
    const source = owner.get(l.a)
    const target = owner.get(l.b)
    if (!source || !target || !shown.has(source) || !shown.has(target)) continue
    const edge: MapEdge = {
      id: l.id,
      source,
      target,
      sourceEndpointId: l.a,
      targetEndpointId: l.b,
      sourceHandle: facetEndpoints.has(l.a) ? l.a : SUMMARY_HANDLE,
      targetHandle: facetEndpoints.has(l.b) ? l.b : SUMMARY_HANDLE,
    }
    if (
      edge.sourceHandle === SUMMARY_HANDLE &&
      edge.targetHandle === SUMMARY_HANDLE
    ) {
      const key = [source, target].sort().join('\u0000')
      groups.set(key, [...(groups.get(key) ?? []), edge])
    } else edges.push(edge)
  }
  const bundles: MapBundle[] = []
  for (const group of groups.values()) {
    if (group.length === 1) edges.push(group[0])
    else
      bundles.push({
        id: `bundle:${group[0].source}:${group[0].target}`,
        source: group[0].source,
        target: group[0].target,
        linkIds: group.map((e) => e.id),
        label: `${group.length} cables`,
      })
  }
  edges.sort((a, b) => a.id.localeCompare(b.id))
  bundles.sort((a, b) => a.id.localeCompare(b.id))
  return { edges, bundles }
}
