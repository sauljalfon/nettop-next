import { facetLabel } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { TextPiece } from '../../shared/textPieces'
import { readableEndpoint, readableEndpointPieces } from '../pathfinding/hops'
import {
  matchPicker,
  MAX_MATCHES,
  type PickerItem,
} from '../pathfinding/picker'

export interface SearchRow {
  /** The endpoint ID of a port, or the cable ID of a cable. */
  id: string
  /** "HDF-01 · 3C/5 front", or "A03 · HDF-01 · 3C/5 front ↔ HDF-02 · 2B/3 front". */
  label: string
  /** The label with each name as its own piece. */
  pieces: TextPiece[]
  /** What choosing it opens: the port itself, or a cable's first end. */
  openEndpointId: string
}

export interface SearchItems {
  ports: PickerItem[]
  cables: PickerItem[]
  /** Each cable's first end. */
  firstEnd: ReadonlyMap<string, string>
  /** The label of each port (by endpoint ID) and cable (by cable ID) as pieces. */
  pieces: ReadonlyMap<string, TextPiece[]>
}

/**
 * Everything Explore's search can find besides equipment, built once per
 * snapshot: every port or position side, and every cable (not internal
 * bridges), each with the words the trace picker's matching reads.
 */
export function buildSearchItems(index: SnapshotIndex): SearchItems {
  const ports: PickerItem[] = []
  const pieces = new Map<string, TextPiece[]>()
  for (const p of index.lookup.endpoints.values()) {
    const label = readableEndpoint(index, p.id)
    ports.push({ value: p.id, label, search: `${label} ${p.label}` })
    pieces.set(p.id, readableEndpointPieces(index, p.id))
  }
  const cables: PickerItem[] = []
  const firstEnd = new Map<string, string>()
  for (const c of index.cables) {
    const a = readableEndpoint(index, c.a)
    const b = readableEndpoint(index, c.b)
    const stored = [c.a, c.b]
      .map((id) => index.lookup.endpoints.get(id)?.label ?? '')
      .join(' ')
    cables.push({
      value: c.id,
      label: `${c.id} · ${a} ↔ ${b}`,
      search: `${c.id} ${a} ${b} ${stored}`,
    })
    pieces.set(c.id, [
      { text: `${c.id} · ` },
      ...readableEndpointPieces(index, c.a),
      { text: ' ↔ ' },
      ...readableEndpointPieces(index, c.b),
    ])
    firstEnd.set(c.id, c.a)
  }
  return { ports, cables, firstEnd, pieces }
}

/** Ports and cables matching the query (every word, any order), at most 50 each, with the rest counted. */
export function searchExplore(
  items: SearchItems,
  query: string,
): {
  ports: { rows: SearchRow[]; more: number }
  cables: { rows: SearchRow[]; more: number }
} {
  if (!query.trim())
    return { ports: { rows: [], more: 0 }, cables: { rows: [], more: 0 } }
  const ports = matchPicker(items.ports, query, MAX_MATCHES)
  const cables = matchPicker(items.cables, query, MAX_MATCHES)
  return {
    ports: {
      rows: ports.matches.map((m) => ({
        id: m.value,
        label: m.label,
        pieces: items.pieces.get(m.value) ?? [{ text: m.label }],
        openEndpointId: m.value,
      })),
      more: ports.more,
    },
    cables: {
      rows: cables.matches.map((m) => ({
        id: m.value,
        label: m.label,
        pieces: items.pieces.get(m.value) ?? [{ text: m.label }],
        openEndpointId: items.firstEnd.get(m.value) ?? '',
      })),
      more: cables.more,
    },
  }
}

/** The label the inspector's search is filled with for an endpoint: "3C / 5", "Port 3". */
export const inspectorQuery = (index: SnapshotIndex, endpointId: string) => {
  const p = index.lookup.endpoints.get(endpointId)
  return p ? facetLabel(index.lookup, p) : ''
}
