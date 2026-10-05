import type { Network } from '../../shared/types'
import { facetKey, facetLabel } from './facets'
import { crossNetworkCaption } from './edges'
import type { SnapshotIndex } from './snapshotIndex'

/** One cabled port or position of an equipment, offered in "Show connections". */
export interface ConnectionEntry {
  /** The facet key; toggling it adds or removes a manual facet. */
  key: string
  label: string
  /** Circuit network (a switch port's is its device's); empty when unresolved. */
  networkId: string
  endpointIds: string[]
}

/** Cabled ports or positions of one equipment, sorted by label. Unused ones are not listed. */
export function connectionEntries(
  index: SnapshotIndex,
  equipmentId: string,
): ConnectionEntry[] {
  const equipment = index.equipment.get(equipmentId)
  const entries = new Map<string, ConnectionEntry>()
  const used = new Set<string>()
  for (const p of index.lookup.byEquipment.get(equipmentId) ?? []) {
    const key = facetKey(index.lookup, p)
    let entry = entries.get(key)
    if (!entry) {
      entry = {
        key,
        label: facetLabel(index.lookup, p),
        networkId: '',
        endpointIds: [],
      }
      entries.set(key, entry)
    }
    entry.endpointIds.push(p.id)
    if (index.cabled.has(p.id)) used.add(key)
    if (!entry.networkId)
      entry.networkId =
        equipment?.role === 'passive'
          ? (index.circuits.get(p.id) ?? '')
          : (equipment?.networkId ?? '')
  }
  return [...entries.values()]
    .filter((e) => used.has(e.key))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    )
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '')

/** True when the label contains the query, ignoring case and all spacing ("3C/5" finds "3C / 5"). */
export const labelMatches = (label: string, query: string) =>
  normalize(label).includes(normalize(query))

/** Case-, space- and slash-spacing-insensitive label search: "3C/5" finds "3C / 5". */
export function searchConnections(
  entries: readonly ConnectionEntry[],
  query: string,
): ConnectionEntry[] {
  const q = normalize(query)
  return q
    ? entries.filter((e) => normalize(e.label).includes(q))
    : [...entries]
}

/** Network name for an entry whose circuit is not on the active filter's network. */
export function connectionCaption(
  entry: ConnectionEntry,
  filter: string | undefined,
  networks: readonly Network[],
) {
  return crossNetworkCaption(entry.networkId, filter, networks)
}
