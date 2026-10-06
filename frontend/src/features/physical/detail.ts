import type { Endpoint } from '../../shared/types'
import { facetKey, facetLabel } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'

export interface EndpointDetail {
  endpointId: string
  equipmentId: string
  equipmentName: string
  /** "3C / 5" for HDF positions, the position for panels, the port label for switches. */
  label: string
  side?: 'front' | 'rear'
  position?: number
  /** Circuit network (passive) or the device's network (active). */
  networkId?: string
  /** The cable on this endpoint and the endpoint at its other end. */
  external?: {
    linkId: string
    farEndpointId: string
    farEquipmentId: string
    farEquipmentName: string
    farLabel: string
    /** "Site / Node / Rack" of the far equipment. */
    farLocation: string
  }
  /** The same position's other side, joined by its internal bridge. */
  internal?: {
    endpointId: string
    side: 'front' | 'rear'
    bridgeLinkId: string
  }
}

/**
 * The other side of the same panel/HDF position, only when the per-snapshot
 * bridge lookup joins the two. Sibling positions are never returned.
 */
function otherSide(index: SnapshotIndex, p: Endpoint) {
  if (p.position === undefined || !p.side) return undefined
  const key = facetKey(index.lookup, p)
  const bridge = index.lookup.bridges.get(p.id)
  if (!bridge) return undefined
  for (const q of index.lookup.byEquipment.get(p.equipmentId) ?? [])
    if (
      q.id !== p.id &&
      q.side &&
      q.side !== p.side &&
      facetKey(index.lookup, q) === key &&
      index.lookup.bridges.get(q.id) === bridge
    )
      return { endpoint: q, side: q.side, bridgeLinkId: bridge }
  return undefined
}

/** Switching sides keeps the position and selects its other-side endpoint. */
export function switchSide(index: SnapshotIndex, endpointId: string) {
  const p = index.lookup.endpoints.get(endpointId)
  const other = p && otherSide(index, p)
  return other && { endpointId: other.endpoint.id, side: other.side }
}

export function endpointDetail(
  index: SnapshotIndex,
  endpointId: string,
): EndpointDetail | undefined {
  const p = index.lookup.endpoints.get(endpointId)
  if (!p) return undefined
  const device = index.equipment.get(p.equipmentId)
  const detail: EndpointDetail = {
    endpointId: p.id,
    equipmentId: p.equipmentId,
    equipmentName: device?.name ?? p.equipmentId,
    label: facetLabel(index.lookup, p),
    side: p.side,
    position: p.position,
    networkId:
      index.circuits.get(p.id) ??
      (device && device.role !== 'passive' ? device.networkId : undefined),
  }
  const cable = index.cableByEndpoint.get(p.id)
  const far = cable && index.lookup.endpoints.get(cable.farEndpointId)
  if (cable && far) {
    const farDevice = index.equipment.get(far.equipmentId)
    detail.external = {
      linkId: cable.linkId,
      farEndpointId: far.id,
      farEquipmentId: far.equipmentId,
      farEquipmentName: farDevice?.name ?? far.equipmentId,
      farLabel: facetLabel(index.lookup, far),
      farLocation: index.locations.get(far.equipmentId) ?? '',
    }
  }
  const other = otherSide(index, p)
  if (other)
    detail.internal = {
      endpointId: other.endpoint.id,
      side: other.side,
      bridgeLinkId: other.bridgeLinkId,
    }
  return detail
}
