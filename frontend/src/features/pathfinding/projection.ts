import type { Route, Snapshot } from '../../shared/types'

export function routeHighlight(snapshot: Snapshot, route?: Route) {
  const endpointIds = new Set<string>()
  const linkIds = new Set<string>()
  if (route) {
    endpointIds.add(route.start)
    for (const hop of route.hops) {
      endpointIds.add(hop.from)
      endpointIds.add(hop.to)
      linkIds.add(hop.linkId)
    }
  }
  const equipmentIds = new Set(
    snapshot.endpoints
      .filter((p) => endpointIds.has(p.id))
      .map((p) => p.equipmentId),
  )
  return { endpointIds, equipmentIds, linkIds }
}

export function endpointLabel(snapshot: Snapshot, id: string) {
  const endpoint = snapshot.endpoints.find((p) => p.id === id)
  const equipment = snapshot.equipment.find(
    (e) => e.id === endpoint?.equipmentId,
  )
  return endpoint
    ? `${equipment?.name ?? endpoint.equipmentId} · ${endpoint.label}`
    : id
}

export function cableEdges(snapshot: Snapshot) {
  return snapshot.links
    .filter((l) => l.kind === 'cable')
    .map((l) => ({
      id: l.id,
      source: snapshot.endpoints.find((p) => p.id === l.a)!.equipmentId,
      target: snapshot.endpoints.find((p) => p.id === l.b)!.equipmentId,
      sourceHandle: `${l.a}:out`,
      targetHandle: `${l.b}:in`,
    }))
}
