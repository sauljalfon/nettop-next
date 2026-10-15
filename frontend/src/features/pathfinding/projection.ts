import { piecesText, type TextPiece } from '../../shared/textPieces'
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
  return piecesText(endpointPieces(snapshot, id))
}

/** `endpointLabel` with the equipment and the port label as separate names. */
export function endpointPieces(snapshot: Snapshot, id: string): TextPiece[] {
  const endpoint = snapshot.endpoints.find((p) => p.id === id)
  if (!endpoint) return [{ text: id }]
  const equipment = snapshot.equipment.find(
    (e) => e.id === endpoint.equipmentId,
  )
  return [
    { name: equipment?.name ?? endpoint.equipmentId },
    { text: ' · ' },
    { name: endpoint.label },
  ]
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
