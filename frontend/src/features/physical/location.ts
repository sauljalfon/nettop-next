import type { SnapshotIndex } from '../map/snapshotIndex'

export type PhysicalLevel = 'sites' | 'site' | 'node' | 'rack' | 'equipment'

/**
 * Where the physical explorer is. Ancestor IDs are filled by `resolveLocation`;
 * `endpointId` and `side` only apply at the equipment level.
 */
export interface PhysicalLocation {
  level: PhysicalLevel
  siteId?: string
  nodeId?: string
  rackId?: string
  equipmentId?: string
  endpointId?: string
  side?: 'front' | 'rear'
}

export const SITES: PhysicalLocation = { level: 'sites' }

const DEPTH: Record<PhysicalLevel, number> = {
  sites: 0,
  site: 1,
  node: 2,
  rack: 3,
  equipment: 4,
}

const KEYS = [
  'level',
  'siteId',
  'nodeId',
  'rackId',
  'equipmentId',
  'endpointId',
  'side',
] as const

export function sameLocation(a: PhysicalLocation, b: PhysicalLocation) {
  return KEYS.every((k) => a[k] === b[k])
}

/**
 * The location with every ancestor filled from its deepest ID (an equipment
 * knows its rack, node and site). An ID that no longer exists falls back to the
 * nearest existing ancestor, down to Sites. A stale ancestor never overrides the
 * deepest existing object.
 */
export function resolveLocation(
  index: SnapshotIndex,
  location: PhysicalLocation,
): PhysicalLocation {
  const depth = DEPTH[location.level]
  const equipment =
    depth >= 4 && location.equipmentId
      ? index.equipment.get(location.equipmentId)
      : undefined
  const rack =
    (equipment && index.racks.get(equipment.rackId)) ||
    (depth >= 3 && location.rackId
      ? index.racks.get(location.rackId)
      : undefined)
  const node =
    (rack && index.nodes.get(rack.nodeId)) ||
    (depth >= 2 && location.nodeId
      ? index.nodes.get(location.nodeId)
      : undefined)
  const site =
    (node && index.sites.get(node.siteId)) ||
    (depth >= 1 && location.siteId
      ? index.sites.get(location.siteId)
      : undefined)

  if (!site) return SITES
  const resolved: PhysicalLocation = { level: 'site', siteId: site.id }
  if (!node) return resolved
  resolved.level = 'node'
  resolved.nodeId = node.id
  // A rack or equipment under a node that no longer matches is kept only when
  // it was found through the index, which it was if `rack` is set.
  if (!rack) return resolved
  resolved.level = 'rack'
  resolved.rackId = rack.id
  if (!equipment || equipment.rackId !== rack.id) return resolved
  resolved.level = 'equipment'
  resolved.equipmentId = equipment.id
  const endpoint = location.endpointId
    ? index.lookup.endpoints.get(location.endpointId)
    : undefined
  if (endpoint && endpoint.equipmentId === equipment.id) {
    resolved.endpointId = endpoint.id
    const side = endpoint.side ?? location.side
    if (side) resolved.side = side
  } else if (location.side) resolved.side = location.side
  return resolved
}
