import type { Equipment, Link, Snapshot } from '../../shared/types'
import { endpointLookup, type EndpointLookup } from './facets'
import { cabledSummaries, locationLabels } from './location'
import { circuitNetworks, passiveNetworks } from './networks'

/**
 * Everything about a snapshot that does not depend on the selected route, the
 * network filter, or manual facets. Compute it once per snapshot (memoize on
 * the snapshot) and pass it to the route- and facet-dependent projections.
 */
export interface SnapshotIndex {
  /** Network of each passive endpoint's circuit; absent when unresolved. */
  circuits: ReadonlyMap<string, string>
  /** Sorted network IDs of the circuits through each passive equipment. */
  badges: ReadonlyMap<string, string[]>
  summaries: ReadonlyMap<string, { cabled: number; total: number }>
  /** "Site / Node / Rack" per equipment. */
  locations: ReadonlyMap<string, string>
  equipment: ReadonlyMap<string, Equipment>
  /** Endpoints that carry a cable. */
  cabled: ReadonlySet<string>
  lookup: EndpointLookup
  /** Equipment owning each endpoint. */
  owner: ReadonlyMap<string, string>
  /** Each equipment's cables and the equipment at their other end. */
  cablesByEquipment: ReadonlyMap<string, { linkId: string; otherId: string }[]>
  /** Each cabled endpoint's cable and the endpoint at its other end. */
  cableByEndpoint: ReadonlyMap<
    string,
    { linkId: string; farEndpointId: string }
  >
  racks: ReadonlyMap<string, { id: string; name: string; nodeId: string }>
  /** Cable links only, in snapshot order. */
  cables: readonly Link[]
  /** Node and site of each equipment, from its rack; absent parts are unknown. */
  places: ReadonlyMap<string, { nodeId?: string; siteId?: string }>
  nodes: ReadonlyMap<string, { id: string; name: string; siteId: string }>
  sites: ReadonlyMap<string, { id: string; name: string }>
}

export function indexSnapshot(s: Snapshot): SnapshotIndex {
  const circuits = circuitNetworks(s)
  const cabled = new Set<string>()
  for (const l of s.links) {
    if (l.kind !== 'cable') continue
    cabled.add(l.a)
    cabled.add(l.b)
  }
  const racks = new Map(s.racks.map((r) => [r.id, r]))
  const nodes = new Map(s.nodes.map((n) => [n.id, n]))
  const sites = new Map(s.sites.map((x) => [x.id, x]))
  const places = new Map<string, { nodeId?: string; siteId?: string }>()
  for (const e of s.equipment) {
    const node = nodes.get(racks.get(e.rackId)?.nodeId ?? '')
    places.set(e.id, {
      nodeId: node?.id,
      siteId: sites.get(node?.siteId ?? '')?.id,
    })
  }
  const owner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId]))
  const cables = s.links.filter((l) => l.kind === 'cable')
  const cablesByEquipment = new Map<
    string,
    { linkId: string; otherId: string }[]
  >()
  const add = (id: string, linkId: string, otherId: string) => {
    const list = cablesByEquipment.get(id)
    if (list) list.push({ linkId, otherId })
    else cablesByEquipment.set(id, [{ linkId, otherId }])
  }
  const cableByEndpoint = new Map<
    string,
    { linkId: string; farEndpointId: string }
  >()
  for (const l of cables) {
    cableByEndpoint.set(l.a, { linkId: l.id, farEndpointId: l.b })
    cableByEndpoint.set(l.b, { linkId: l.id, farEndpointId: l.a })
    const a = owner.get(l.a)
    const b = owner.get(l.b)
    if (!a || !b || a === b) continue
    add(a, l.id, b)
    add(b, l.id, a)
  }
  return {
    owner,
    cables,
    cablesByEquipment,
    cableByEndpoint,
    racks,
    places,
    nodes,
    sites,
    circuits,
    badges: passiveNetworks(s, circuits),
    summaries: cabledSummaries(s),
    locations: locationLabels(s),
    equipment: new Map(s.equipment.map((e) => [e.id, e])),
    cabled,
    lookup: endpointLookup(s),
  }
}
