import type { Endpoint, Route, Snapshot, Subpanel } from '../../shared/types'

/** One switch port, or one panel/HDF position with its front and rear sides. */
export interface Facet {
  /** Stable key within an equipment: port endpoint ID, or "3C/5" / "1" for positions. */
  key: string
  equipmentId: string
  /** "3C / 5" for HDF positions, the position for panels, the port label for switches. */
  label: string
  endpointIds: string[]
  frontEndpointId?: string
  rearEndpointId?: string
  bridgeLinkId?: string
  /** Derived from the selected route. */
  automatic: boolean
  /** Chosen by the user; unaffected by route changes. */
  manual: boolean
}

/** Manual facet keys per equipment ID. */
export type ManualFacets = ReadonlyMap<string, ReadonlySet<string>>

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
  if (p.position === undefined) return p.id
  const sub = lookup.subpanels.get(p.subpanelId ?? '')
  return sub ? `${sub.row}${sub.column}/${p.position}` : String(p.position)
}

/** "3C / 5" for HDF positions, the position for panels, the port label for switches. */
export function facetLabel(lookup: EndpointLookup, p: Endpoint) {
  if (p.position === undefined) return p.label
  const sub = lookup.subpanels.get(p.subpanelId ?? '')
  return sub ? `${sub.row}${sub.column} / ${p.position}` : String(p.position)
}

/** A trace from a facet starts at its front endpoint, else its rear one. */
export function facetStart(f: Facet) {
  return f.frontEndpointId ?? f.rearEndpointId ?? f.endpointIds[0]
}

/**
 * Facets to show on each equipment: the exact endpoints of the route
 * (automatic) merged with the user's manual choices. Equipment with no facet is
 * absent. Facets sort by label within an equipment.
 */
export function facetsFor(
  s: Snapshot,
  route?: Route,
  manual: ManualFacets = new Map(),
  lookup: EndpointLookup = endpointLookup(s),
): Map<string, Facet[]> {
  const endpoints = lookup.endpoints
  const routeEndpoints = new Set<string>()
  if (route) {
    routeEndpoints.add(route.start)
    for (const hop of route.hops) {
      routeEndpoints.add(hop.from)
      routeEndpoints.add(hop.to)
    }
  }

  const byKey = new Map<string, Facet>()
  const facetOf = (p: Endpoint) => {
    const key = facetKey(lookup, p)
    const id = `${p.equipmentId}\u0000${key}`
    let facet = byKey.get(id)
    if (!facet) {
      facet = {
        key,
        equipmentId: p.equipmentId,
        label: facetLabel(lookup, p),
        endpointIds: [],
        automatic: false,
        manual: false,
      }
      byKey.set(id, facet)
    }
    return facet
  }
  const add = (p: Endpoint, source: 'automatic' | 'manual') => {
    const facet = facetOf(p)
    facet[source] = true
  }

  for (const id of routeEndpoints) {
    const p = endpoints.get(id)
    if (p) add(p, 'automatic')
  }
  for (const [equipmentId, keys] of manual)
    for (const p of lookup.byEquipment.get(equipmentId) ?? [])
      if (keys.has(facetKey(lookup, p))) add(p, 'manual')

  // A position facet always carries both sides and its bridge, whichever side triggered it.
  const result = new Map<string, Facet[]>()
  for (const facet of byKey.values()) {
    for (const p of lookup.byEquipment.get(facet.equipmentId) ?? []) {
      if (facetKey(lookup, p) !== facet.key) continue
      facet.endpointIds.push(p.id)
      if (p.side === 'front') facet.frontEndpointId = p.id
      if (p.side === 'rear') facet.rearEndpointId = p.id
    }
    if (facet.frontEndpointId && facet.rearEndpointId) {
      const bridge = lookup.bridges.get(facet.frontEndpointId)
      if (bridge === lookup.bridges.get(facet.rearEndpointId))
        facet.bridgeLinkId = bridge
    }
    result.set(facet.equipmentId, [
      ...(result.get(facet.equipmentId) ?? []),
      facet,
    ])
  }
  for (const list of result.values())
    list.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    )
  return result
}

/** Every endpoint shown as a facet; edges attach to these handles. */
export function facetEndpointIds(facets: ReadonlyMap<string, Facet[]>) {
  return new Set(
    [...facets.values()].flatMap((list) => list.flatMap((f) => f.endpointIds)),
  )
}
