import type { Network, Snapshot } from '../../shared/types'
import { circuitNetworks } from './networks'

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
  /** Circuit network of the cable; empty when unresolved. */
  networkId: string
}

/** Parallel summary-anchored cables between two cards, drawn as one line. */
export interface MapBundle {
  id: string
  source: string
  target: string
  /** Every cable ID in the bundle, sorted. */
  linkIds: string[]
  /** The card pair and network; the key under which the bundle is split or joined. */
  pairKey: string
  /** Shared by every cable in the bundle; empty when unresolved. */
  networkId: string
}

/** Key of a card pair within one network, the same whichever card is first. */
export const pairKey = (a: string, b: string, networkId: string): string =>
  [...[a, b].sort(), networkId].join('|')

/** Stroke width of a line drawing `count` cables: 1.5 px plus 1 px per extra cable, up to 7 px. */
export const lineWidth = (count: number): number =>
  Math.min(7, 1.5 + Math.max(0, count - 1))

/**
 * One edge per cable between shown cards. Cables whose both ends are summary
 * anchors and that run between the same pair of cards are bundled,
 * keeping every cable ID. Edges, bundles and anchors are drawing aids only;
 * traversal never uses them.
 */
export function mapEdges(
  s: Snapshot,
  shown: ReadonlySet<string>,
  facetEndpoints: ReadonlySet<string>,
  networks: ReadonlyMap<string, string> = circuitNetworks(s),
  owner: ReadonlyMap<string, string> = new Map(
    s.endpoints.map((p) => [p.id, p.equipmentId]),
  ),
): { edges: MapEdge[]; bundles: MapBundle[] } {
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
      networkId: networks.get(l.a) ?? networks.get(l.b) ?? '',
    }
    if (
      edge.sourceHandle === SUMMARY_HANDLE &&
      edge.targetHandle === SUMMARY_HANDLE
    ) {
      const key = pairKey(source, target, edge.networkId)
      groups.set(key, [...(groups.get(key) ?? []), edge])
    } else edges.push(edge)
  }
  const bundles: MapBundle[] = []
  for (const group of groups.values()) {
    if (group.length === 1) edges.push(group[0])
    else
      bundles.push({
        id: `bundle:${group[0].source}:${group[0].target}:${group[0].networkId}`,
        source: group[0].source,
        target: group[0].target,
        linkIds: group.map((e) => e.id),
        pairKey: pairKey(group[0].source, group[0].target, group[0].networkId),
        networkId: group[0].networkId,
      })
  }
  edges.sort((a, b) => a.id.localeCompare(b.id))
  bundles.sort((a, b) => a.id.localeCompare(b.id))
  return { edges, bundles }
}

/**
 * Caption naming the network of an edge or bundle that is not the filtered
 * network. Nothing without a filter or for an unresolved circuit.
 */
export function crossNetworkCaption(
  networkId: string,
  filter: string | undefined,
  networks: readonly Network[],
): string | undefined {
  if (!filter || !networkId || networkId === filter) return undefined
  return networks.find((n) => n.id === networkId)?.name ?? networkId
}
