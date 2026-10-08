/** The drag payload type the equipment library and the racks already use. */
export const DRAG_TYPE = 'application/x-nettop-item'

export type Drop =
  | { type: 'move'; equipmentId: string }
  | { type: 'create'; kind: 'switch' | 'panel'; role?: 'aggregation' }

/** `equipment:<id>` (an existing equipment) or `new:<kind>:::<role>` (a library item). */
export function parseDrop(payload: string): Drop | undefined {
  if (payload.startsWith('equipment:')) {
    const equipmentId = payload.slice('equipment:'.length)
    return equipmentId ? { type: 'move', equipmentId } : undefined
  }
  if (payload.startsWith('new:')) {
    const [kind, , , role] = payload.slice('new:'.length).split(':')
    if (kind !== 'switch' && kind !== 'panel') return undefined
    return role === 'aggregation'
      ? { type: 'create', kind, role }
      : { type: 'create', kind }
  }
  return undefined
}

export interface DropHandlers {
  onMoveEquipment?: (equipmentId: string, rackId: string, unit?: number) => void
  onCreateEquipment?: (
    kind: 'switch' | 'panel',
    rackId: string,
    unit?: number,
    role?: 'aggregation',
  ) => void
}

/**
 * Applies a drop on a rack (and a unit, when dropped on one) through the same
 * handlers a drag always used. Without a unit the handler picks the first free
 * one that fits. Returns whether the payload was one of ours.
 */
export function dropInto(
  payload: string,
  rackId: string,
  unit: number | undefined,
  handlers: DropHandlers,
): boolean {
  const drop = parseDrop(payload)
  if (!drop) return false
  if (drop.type === 'move')
    handlers.onMoveEquipment?.(drop.equipmentId, rackId, unit)
  else handlers.onCreateEquipment?.(drop.kind, rackId, unit, drop.role)
  return true
}
