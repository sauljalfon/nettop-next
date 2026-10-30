import type { Endpoint } from '../../shared/types'
import { followPort, type WalkEnd } from '../paths/follow'
import type { SnapshotIndex } from './snapshotIndex'

/** One passive equipment a walk passes through, and where (never a joined string). */
export interface WalkStep {
  equipmentId: string
  /** The position without its side, as the walk sheet reads it: "1", "3C/5". */
  place: string
  /** The jack the walk enters on this equipment. */
  endpointId: string
}

/** A position as the walk sheet reads it: "3C/5" on an HDF, "1" on a panel; a port's label otherwise. */
export function endpointPlace(index: SnapshotIndex, p: Endpoint): string {
  if (p.position === undefined || !p.side) return p.label
  const sub = index.lookup.subpanels.get(p.subpanelId ?? '')
  return sub ? `${sub.row}${sub.column}/${p.position}` : `${p.position}`
}

/** One walk from an equipment's endpoint: where it ends, the passives it passes, every link. */
export interface EquipmentWalk {
  start: string
  end: WalkEnd
  via: WalkStep[]
  linkIds: string[]
  /** The switch the walk reaches (a switch or destination end), else undefined. */
  farId?: string
}

/**
 * Every walk from the equipment's endpoints over stored cables and bridges, with
 * the passives passed on the way. The hierarchy and its drawer read this.
 */
export function equipmentWalks(
  index: SnapshotIndex,
  equipmentId: string,
): EquipmentWalk[] {
  const result: EquipmentWalk[] = []
  for (const p of index.lookup.byEquipment.get(equipmentId) ?? []) {
    const walk = followPort(index, p.id)
    const via: WalkStep[] = []
    for (const hop of walk.hops) {
      if (hop.kind !== 'cable') continue
      const entered = index.lookup.endpoints.get(hop.to)
      if (!entered || entered.equipmentId === equipmentId) continue
      if (index.equipment.get(entered.equipmentId)?.kind === 'switch') continue
      via.push({
        equipmentId: entered.equipmentId,
        place: endpointPlace(index, entered),
        endpointId: entered.id,
      })
    }
    const endOwner = index.owner.get(walk.end.endpointId)
    const isSwitchEnd =
      walk.end.kind === 'switch' || walk.end.kind === 'destination'
    // The equipment holding a dead end is named by the end itself.
    if (!isSwitchEnd && via.at(-1)?.equipmentId === endOwner) via.pop()
    result.push({
      start: p.id,
      end: walk.end,
      via,
      linkIds: walk.hops.map((h) => h.linkId),
      farId: isSwitchEnd ? endOwner : undefined,
    })
  }
  return result
}
