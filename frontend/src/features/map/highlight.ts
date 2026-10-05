import type { SnapshotIndex } from './snapshotIndex'

/** A place in the physical hierarchy: one site or one node. */
export interface LocationRef {
  kind: 'site' | 'node'
  id: string
}

/**
 * What a location highlight marks: the equipment located there, every cable from
 * that equipment to any card, and the equipment at the far ends of those cables.
 * Presentation only; it never changes what a trace finds.
 */
export interface Highlight {
  location: LocationRef
  /** Equipment located in the site or node, sorted. */
  equipmentIds: string[]
  /** Cables with at least one end on that equipment, sorted, each once. */
  linkIds: string[]
  /** Equipment at the far end of those cables, outside the location, sorted. */
  neighborIds: string[]
}

/** The location when it exists in this snapshot; a stale one is ignored. */
export function resolveLocation(
  index: SnapshotIndex,
  location: LocationRef | undefined,
): LocationRef | undefined {
  if (!location) return undefined
  return (location.kind === 'node' ? index.nodes : index.sites).has(location.id)
    ? location
    : undefined
}

/**
 * The highlight for a site or node, from the per-snapshot index: one pass over
 * the equipment, then over only the cables of that equipment.
 */
export function highlightFor(
  index: SnapshotIndex,
  location: LocationRef | undefined,
): Highlight | undefined {
  const resolved = resolveLocation(index, location)
  if (!resolved) return undefined
  const inside = new Set<string>()
  for (const [id, place] of index.places)
    if (
      (resolved.kind === 'node' ? place.nodeId : place.siteId) === resolved.id
    )
      inside.add(id)
  const links = new Set<string>()
  const neighbors = new Set<string>()
  for (const id of inside)
    for (const { linkId, otherId } of index.cablesByEquipment.get(id) ?? []) {
      links.add(linkId)
      if (!inside.has(otherId)) neighbors.add(otherId)
    }
  return {
    location: resolved,
    equipmentIds: [...inside].sort(),
    linkIds: [...links].sort(),
    neighborIds: [...neighbors].sort(),
  }
}
