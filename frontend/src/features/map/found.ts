import type { SnapshotIndex } from './snapshotIndex'

/** A found card: its direct cable neighbors and the cables between them. */
export interface Found {
  id: string
  /** Equipment cabled directly to the card, sorted, each once. */
  neighborIds: string[]
  /** Cables joining the card to a neighbor (never internal bridges), sorted. */
  linkIds: string[]
}

/** Found state for one equipment from the per-snapshot cable lookup; undefined when unknown. */
export function foundFor(index: SnapshotIndex, id: string): Found | undefined {
  if (!index.equipment.has(id)) return undefined
  const neighbors = new Set<string>()
  const links: string[] = []
  for (const { linkId, otherId } of index.cablesByEquipment.get(id) ?? []) {
    links.push(linkId)
    neighbors.add(otherId)
  }
  return {
    id,
    neighborIds: [...neighbors].sort(),
    linkIds: links.sort(),
  }
}
