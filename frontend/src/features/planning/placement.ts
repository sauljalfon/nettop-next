import type { Snapshot } from '../../shared/types'

/**
 * The lowest unit of a rack where the equipment fits (its height, inside the rack, off every
 * other piece of equipment); the unit above the rack when none does. Never changes topology.
 */
export function lowestFreeUnit(
  snapshot: Pick<Snapshot, 'equipment' | 'racks'>,
  rackId: string,
  equipmentId: string,
): number {
  const item = snapshot.equipment.find((e) => e.id === equipmentId)
  const rack = snapshot.racks.find((r) => r.id === rackId)
  if (!item || !rack) return 1
  const occupied = new Set(
    snapshot.equipment
      .filter((e) => e.rackId === rackId && e.id !== equipmentId)
      .flatMap((e) => Array.from({ length: e.height }, (_, i) => e.unit + i)),
  )
  const first = Array.from({ length: rack.units }, (_, i) => i + 1).find(
    (u) =>
      u + item.height - 1 <= rack.units &&
      Array.from({ length: item.height }, (_, i) => u + i).every(
        (slot) => !occupied.has(slot),
      ),
  )
  return first ?? rack.units + 1
}
