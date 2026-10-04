import type { Route, Snapshot, TraceResult } from '../../shared/types'
import { endpointLabel } from './projection'

export interface Destination {
  name: string
  role: 'AGG' | 'BB'
  network: string
}

const networkName = (snapshot: Snapshot, id: string | undefined) =>
  snapshot.networks.find((n) => n.id === id)?.name ?? id ?? ''

/** The destination of a distribution route; undefined for point-to-point. */
export function destinationOf(
  snapshot: Snapshot,
  route: Route,
): Destination | undefined {
  if (!route.destinationEquipmentId || !route.destinationRole) return undefined
  const equipment = snapshot.equipment.find(
    (e) => e.id === route.destinationEquipmentId,
  )
  return {
    name: equipment?.name ?? route.destinationEquipmentId,
    role: route.destinationRole === 'aggregation' ? 'AGG' : 'BB',
    network: networkName(snapshot, route.destinationNetworkId),
  }
}

/** "EDGE-17 · Port 1 → AGG-03 · Port 1 · AGG · Network A". */
export function routeOptionLabel(snapshot: Snapshot, route: Route): string {
  const destination = destinationOf(snapshot, route)
  const ends = `${endpointLabel(snapshot, route.start)} → ${endpointLabel(snapshot, route.end)}`
  return destination
    ? `${ends} · ${destination.role} · ${destination.network}`
    : ends
}

/** Set only for distribution routes whose source network could not be resolved. */
export function sourceNetworkNote(
  snapshot: Snapshot,
  route: Route,
): string | undefined {
  return destinationOf(snapshot, route) && !route.sourceNetworkId
    ? 'Source network unresolved: no access device on this circuit.'
    : undefined
}

/** A reached AGG/BB on another network, listed apart from the routes. */
export function mismatchLine(snapshot: Snapshot, route: Route): string {
  return `${routeOptionLabel(snapshot, route)} (source ${networkName(snapshot, route.sourceNetworkId)})`
}

export function truncationNotice(result: TraceResult): string | undefined {
  return result.truncated
    ? 'Results were truncated: more routes or mismatches exist than are listed.'
    : undefined
}
