import { RACK_ITEM_TYPES } from '../../shared/rackItems'
import type { NewItem } from '../planning/boxModel'

/** The drag payload type the equipment library and the racks already use. */
export const DRAG_TYPE = 'application/x-nettop-item'

export type Drop =
  { type: 'move'; equipmentId: string } | { type: 'create'; item: NewItem }

/** The payload a library entry drags: `new:model:<id>`, `new:panel`, `new:hdf` or `new:rack_item:<type>`. */
export function dragPayload(item: NewItem): string {
  switch (item.type) {
    case 'model':
      return `new:model:${item.modelId}`
    case 'rack_item':
      return `new:rack_item:${item.itemType}`
    default:
      return `new:${item.type}`
  }
}

/** `equipment:<id>` (an existing equipment) or a library entry's payload (`dragPayload`). */
export function parseDrop(payload: string): Drop | undefined {
  if (payload.startsWith('equipment:')) {
    const equipmentId = payload.slice('equipment:'.length)
    return equipmentId ? { type: 'move', equipmentId } : undefined
  }
  if (payload === 'new:panel')
    return { type: 'create', item: { type: 'panel' } }
  if (payload === 'new:hdf') return { type: 'create', item: { type: 'hdf' } }
  if (payload.startsWith('new:model:')) {
    const modelId = payload.slice('new:model:'.length)
    return modelId
      ? { type: 'create', item: { type: 'model', modelId } }
      : undefined
  }
  if (payload.startsWith('new:rack_item:')) {
    const itemType = RACK_ITEM_TYPES.find(
      (t) => t === payload.slice('new:rack_item:'.length),
    )
    return itemType
      ? { type: 'create', item: { type: 'rack_item', itemType } }
      : undefined
  }
  return undefined
}

export interface DropHandlers {
  onMoveEquipment?: (equipmentId: string, rackId: string, unit?: number) => void
  onCreateEquipment?: (item: NewItem, rackId: string, unit?: number) => void
}

/**
 * Applies a drop on a rack (and a unit, when dropped on one). A move goes to
 * the handler at once; a new item opens the add box there (without a unit, at
 * the first one that fits). Returns whether the payload was one of ours.
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
  else handlers.onCreateEquipment?.(drop.item, rackId, unit)
  return true
}
