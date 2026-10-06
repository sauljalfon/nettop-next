import type { SnapshotIndex } from '../map/snapshotIndex'
import type { RouteMarks } from './inventory'

/** One line between two nodes of a site: the real cables whose ends are in them. */
export interface NodePair {
  /** The two node IDs, sorted. */
  nodeIds: [string, string]
  linkIds: string[]
  /** The circuit network when every cable agrees; absent when mixed or unresolved. */
  networkId?: string
  /** Cables per network ID ("" for unresolved). */
  perNetwork: Map<string, number>
  /** True when a cable of the selected route is among them. */
  onRoute: boolean
}

export interface NodeCableCounts {
  /** Cables with both ends in this node. */
  inside: number
  /** Cables with the other end in another site. */
  otherSites: number
  otherSiteLinkIds: string[]
}

export interface SiteConnections {
  pairs: NodePair[]
  byNode: Map<string, NodeCableCounts>
}

/**
 * Cable summaries for one site, resolved through endpoint -> equipment -> rack
 * -> node in the snapshot index, never from names. A cable whose far end has no
 * known node is not counted. Summaries only: they never feed traversal.
 */
export function nodeConnections(
  index: SnapshotIndex,
  siteId: string,
  marks?: RouteMarks,
): SiteConnections {
  const byNode = new Map<string, NodeCableCounts>()
  for (const node of index.nodes.values())
    if (node.siteId === siteId)
      byNode.set(node.id, { inside: 0, otherSites: 0, otherSiteLinkIds: [] })
  const pairs = new Map<string, NodePair>()

  const networkOf = (endpointId: string) => {
    const circuit = index.circuits.get(endpointId)
    if (circuit) return circuit
    const e = index.equipment.get(index.owner.get(endpointId) ?? '')
    return e && e.role !== 'passive' ? e.networkId : undefined
  }

  for (const cable of index.cables) {
    const a = index.places.get(index.owner.get(cable.a) ?? '')
    const b = index.places.get(index.owner.get(cable.b) ?? '')
    if (!a?.nodeId || !b?.nodeId) continue
    const aIn = a.siteId === siteId
    const bIn = b.siteId === siteId
    if (!aIn && !bIn) continue
    if (aIn && bIn) {
      if (a.nodeId === b.nodeId) {
        byNode.get(a.nodeId)!.inside++
        continue
      }
      const nodeIds = [a.nodeId, b.nodeId].sort() as [string, string]
      const key = nodeIds.join('\u0000')
      let pair = pairs.get(key)
      if (!pair) {
        pair = { nodeIds, linkIds: [], perNetwork: new Map(), onRoute: false }
        pairs.set(key, pair)
      }
      const na = networkOf(cable.a)
      const nb = networkOf(cable.b)
      const network = na && nb && na !== nb ? '' : (na ?? nb ?? '')
      pair.linkIds.push(cable.id)
      pair.perNetwork.set(network, (pair.perNetwork.get(network) ?? 0) + 1)
      if (marks?.links.has(cable.id)) pair.onRoute = true
      continue
    }
    const inside = byNode.get(aIn ? a.nodeId : b.nodeId)!
    inside.otherSites++
    inside.otherSiteLinkIds.push(cable.id)
  }

  for (const pair of pairs.values()) {
    const [only] = pair.perNetwork.keys()
    if (pair.perNetwork.size === 1 && only) pair.networkId = only
  }
  return { pairs: [...pairs.values()], byNode }
}
