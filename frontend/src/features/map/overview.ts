import { endpointNetwork } from './circuitNetwork'
import type { SnapshotIndex } from './snapshotIndex'

export interface OverviewSite {
  id: string
  name: string
}

export interface OverviewNode {
  id: string
  name: string
  siteId: string
  equipmentCount: number
  /** From explicit roles only, never from names. */
  tags: {
    access: boolean
    aggregation: boolean
    backbone: boolean
    /** Holds equipment and every piece is passive. */
    passiveOnly: boolean
  }
  /** In the plan's snapshot but not in the installed one. */
  proposed: boolean
  /** The selected network is not here; the card stays (D11). */
  dimmed: boolean
}

/** One line between two nodes: the real cables whose ends are in them. */
export interface OverviewPair {
  /** The two node IDs, sorted. */
  nodeIds: [string, string]
  linkIds: string[]
  count: number
  /** Cables per network ID ("" for mixed or unresolved). */
  perNetwork: Map<string, number>
  /** The circuit network when every cable agrees; absent when mixed or unresolved. */
  networkId?: string
  dimmed: boolean
}

export interface Overview {
  sites: OverviewSite[]
  nodes: OverviewNode[]
  pairs: OverviewPair[]
  /** Equipment with no known node; they are not on the overview. */
  unplaced: number
}

export interface OverviewOptions {
  /** Dims what does not carry this network; changes nothing else. */
  networkId?: string
  /** The installed snapshot's nodes; absent means nothing is proposed. */
  installedNodeIds?: ReadonlySet<string>
}

const byNameThenId = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

/**
 * The conceptual overview: one card per node and one line per cabled node pair,
 * within and between sites. Resolved through endpoint -> equipment -> rack ->
 * node in the snapshot index, never from names. Summaries only: they never feed
 * traversal. Compute once per snapshot; `networkId` only changes `dimmed`.
 */
export function buildOverview(
  index: SnapshotIndex,
  opts: OverviewOptions = {},
): Overview {
  const { networkId, installedNodeIds } = opts

  const held = new Map<
    string,
    { count: number; roles: Set<string>; hasNetwork: boolean }
  >()
  let unplaced = 0
  for (const e of index.equipment.values()) {
    const nodeId = index.places.get(e.id)?.nodeId
    if (!nodeId) {
      unplaced++
      continue
    }
    let h = held.get(nodeId)
    if (!h)
      held.set(nodeId, (h = { count: 0, roles: new Set(), hasNetwork: false }))
    h.count++
    h.roles.add(e.role)
    if (
      networkId &&
      (e.role === 'passive'
        ? index.badges.get(e.id)?.includes(networkId)
        : e.kind === 'switch' && e.networkId === networkId)
    )
      h.hasNetwork = true
  }

  const nodes: OverviewNode[] = [...index.nodes.values()].map((n) => {
    const h = held.get(n.id)
    return {
      id: n.id,
      name: n.name,
      siteId: n.siteId,
      equipmentCount: h?.count ?? 0,
      tags: {
        access: !!h?.roles.has('access'),
        aggregation: !!h?.roles.has('aggregation'),
        backbone: !!h?.roles.has('backbone'),
        passiveOnly: !!h && h.roles.size === 1 && h.roles.has('passive'),
      },
      proposed: !!installedNodeIds && !installedNodeIds.has(n.id),
      dimmed: !!networkId && !h?.hasNetwork,
    }
  })
  const siteName = new Map([...index.sites.values()].map((x) => [x.id, x.name]))
  nodes.sort(
    (a, b) =>
      (siteName.get(a.siteId) ?? a.siteId).localeCompare(
        siteName.get(b.siteId) ?? b.siteId,
      ) ||
      a.siteId.localeCompare(b.siteId) ||
      byNameThenId(a, b),
  )

  const pairs = new Map<string, OverviewPair>()
  for (const cable of index.cables) {
    const a = index.places.get(index.owner.get(cable.a) ?? '')?.nodeId
    const b = index.places.get(index.owner.get(cable.b) ?? '')?.nodeId
    if (!a || !b || a === b) continue
    const nodeIds = [a, b].sort() as [string, string]
    const key = nodeIds.join('\u0000')
    let pair = pairs.get(key)
    if (!pair) {
      pair = {
        nodeIds,
        linkIds: [],
        count: 0,
        perNetwork: new Map(),
        dimmed: false,
      }
      pairs.set(key, pair)
    }
    const na = endpointNetwork(index, cable.a)
    const nb = endpointNetwork(index, cable.b)
    const network = na && nb && na !== nb ? '' : (na ?? nb ?? '')
    pair.linkIds.push(cable.id)
    pair.count++
    pair.perNetwork.set(network, (pair.perNetwork.get(network) ?? 0) + 1)
  }
  for (const pair of pairs.values()) {
    const [only] = pair.perNetwork.keys()
    if (pair.perNetwork.size === 1 && only) pair.networkId = only
    pair.dimmed = !!networkId && !pair.perNetwork.has(networkId)
  }

  return {
    sites: [...index.sites.values()]
      .map((x) => ({ id: x.id, name: x.name }))
      .sort(byNameThenId),
    nodes,
    pairs: [...pairs.values()].sort((x, y) =>
      x.nodeIds.join('\u0000').localeCompare(y.nodeIds.join('\u0000')),
    ),
    unplaced,
  }
}
