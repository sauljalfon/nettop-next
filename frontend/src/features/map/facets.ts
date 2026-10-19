import { hasSide } from '../../shared/ports'
import type { Endpoint, Route, Snapshot, Subpanel } from '../../shared/types'

/** Snapshot-only lookups that facet building needs; build once per snapshot. */
export interface EndpointLookup {
  endpoints: ReadonlyMap<string, Endpoint>
  byEquipment: ReadonlyMap<string, Endpoint[]>
  subpanels: ReadonlyMap<string, Subpanel>
  /** Each side's endpoint of a position -> the ID of its internal bridge. */
  bridges: ReadonlyMap<string, string>
}

export function endpointLookup(s: Snapshot): EndpointLookup {
  const byEquipment = new Map<string, Endpoint[]>()
  for (const p of s.endpoints) {
    const list = byEquipment.get(p.equipmentId)
    if (list) list.push(p)
    else byEquipment.set(p.equipmentId, [p])
  }
  const bridges = new Map<string, string>()
  for (const l of s.links)
    if (l.kind === 'internal') {
      bridges.set(l.a, l.id)
      bridges.set(l.b, l.id)
    }
  return {
    bridges,
    endpoints: new Map(s.endpoints.map((p) => [p.id, p])),
    byEquipment,
    subpanels: new Map(s.subpanels.map((x) => [x.id, x])),
  }
}

/** Stable key of a facet within its equipment: a port's endpoint ID, or "3C/5" / "1". */
export function facetKey(lookup: EndpointLookup, p: Endpoint) {
  if (!hasSide(p) || p.position === undefined) return p.id
  const sub = lookup.subpanels.get(p.subpanelId ?? '')
  return sub ? `${sub.row}${sub.column}/${p.position}` : String(p.position)
}

/** "3C / 5" for HDF positions, the position for panels, the port label for switches. */
export function facetLabel(lookup: EndpointLookup, p: Endpoint) {
  if (!hasSide(p) || p.position === undefined) return p.label
  const sub = lookup.subpanels.get(p.subpanelId ?? '')
  return sub ? `${sub.row}${sub.column} / ${p.position}` : String(p.position)
}
