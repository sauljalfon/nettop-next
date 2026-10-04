import type { Equipment, Snapshot } from '../../shared/types'
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
}

export function indexSnapshot(s: Snapshot): SnapshotIndex {
  const circuits = circuitNetworks(s)
  const cabled = new Set<string>()
  for (const l of s.links) {
    if (l.kind !== 'cable') continue
    cabled.add(l.a)
    cabled.add(l.b)
  }
  return {
    circuits,
    badges: passiveNetworks(s, circuits),
    summaries: cabledSummaries(s),
    locations: locationLabels(s),
    equipment: new Map(s.equipment.map((e) => [e.id, e])),
    cabled,
    lookup: endpointLookup(s),
  }
}
