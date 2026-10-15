import type { Equipment } from '../../shared/types'

const SWITCH_ROLES: Record<string, string> = {
  access: 'Access',
  aggregation: 'Aggregation',
  backbone: 'Backbone',
}

/** The role words on a card: a switch by its stored role, a passive by its kind. Never from the name. */
export function cardRoleLabel(e: Pick<Equipment, 'kind' | 'role'>): string {
  if (e.kind === 'panel') return 'Patch panel'
  if (e.kind === 'hdf') return 'HDF'
  return SWITCH_ROLES[e.role] ?? e.role
}
