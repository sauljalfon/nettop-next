import type { Endpoint, Route, Snapshot } from '../../shared/types'

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

function facetKey(s: Snapshot, p: Endpoint) {
  if (p.position === undefined) return p.id
  const sub = s.subpanels.find((x) => x.id === p.subpanelId)
  return sub ? `${sub.row}${sub.column}/${p.position}` : String(p.position)
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
): Map<string, Facet[]> {
  const endpoints = new Map(s.endpoints.map((p) => [p.id, p]))
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
    const key = facetKey(s, p)
    const id = `${p.equipmentId}\u0000${key}`
    let facet = byKey.get(id)
    if (!facet) {
      const sub = s.subpanels.find((x) => x.id === p.subpanelId)
      facet = {
        key,
        equipmentId: p.equipmentId,
        label:
          p.position === undefined
            ? p.label
            : sub
              ? `${sub.row}${sub.column} / ${p.position}`
              : String(p.position),
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
    for (const p of s.endpoints)
      if (p.equipmentId === equipmentId && keys.has(facetKey(s, p)))
        add(p, 'manual')

  // A position facet always carries both sides and its bridge, whichever side triggered it.
  const result = new Map<string, Facet[]>()
  for (const facet of byKey.values()) {
    for (const p of s.endpoints) {
      if (p.equipmentId !== facet.equipmentId || facetKey(s, p) !== facet.key)
        continue
      facet.endpointIds.push(p.id)
      if (p.side === 'front') facet.frontEndpointId = p.id
      if (p.side === 'rear') facet.rearEndpointId = p.id
    }
    if (facet.frontEndpointId && facet.rearEndpointId)
      facet.bridgeLinkId = s.links.find(
        (l) =>
          l.kind === 'internal' &&
          [l.a, l.b].includes(facet.frontEndpointId!) &&
          [l.a, l.b].includes(facet.rearEndpointId!),
      )?.id
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
