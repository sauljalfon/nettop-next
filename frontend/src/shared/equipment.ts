import type { Equipment } from './types'

/** Standard panels and HDFs are passive; only switches are active devices. */
export const isPassiveEquipment = (equipment: Pick<Equipment, 'kind'>) =>
  equipment.kind !== 'switch'
