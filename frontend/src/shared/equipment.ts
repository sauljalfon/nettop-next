import type { Equipment } from './types'

/** Standard panels and HDFs are passive; switches are the active devices. A rack item is neither. */
export const isPassiveEquipment = (equipment: Pick<Equipment, 'kind'>) =>
  equipment.kind === 'panel' || equipment.kind === 'hdf'

/** A rack item takes units but has no endpoints: no face, no port table. */
export const hasPorts = (equipment: Pick<Equipment, 'kind'>) =>
  equipment.kind !== 'rack_item'

const KIND = {
  switch: 'Switch',
  panel: 'Panel',
  hdf: 'HDF',
  rack_item: 'Rack item',
} as const

export const kindLabel = (
  equipment: Pick<Equipment, 'kind'>,
): (typeof KIND)[Equipment['kind']] => KIND[equipment.kind]
