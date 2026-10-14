import type { TraceResult } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { truncationNotice } from '../pathfinding/results'

export interface UplinkLine {
  startEndpointId: string
  /** The switch port's label. */
  port: string
  destinationName: string
  destinationPort: string
  role: 'AGG' | 'BB'
  cables: number
  /** Passive equipment names in order, consecutive repeats collapsed. */
  via: string[]
}

export interface Uplinks {
  lines: UplinkLine[]
  /** Distinct start ports that reach an AGG or BB on another network. */
  mismatches: number
  notice?: string
  /** The ports of the switch. */
  total: number
}

/** The server's routes from one switch, read as one line per port. */
export function uplinkLines(
  index: SnapshotIndex,
  result: TraceResult,
  equipmentId: string,
): Uplinks {
  const label = (id: string) => index.lookup.endpoints.get(id)?.label ?? id
  const lines = result.routes.map((route): UplinkLine => {
    const via: string[] = []
    for (const hop of route.hops)
      for (const id of [hop.from, hop.to]) {
        const owner = index.equipment.get(index.owner.get(id) ?? '')
        if (!owner || owner.kind === 'switch') continue
        if (via[via.length - 1] !== owner.name) via.push(owner.name)
      }
    return {
      startEndpointId: route.start,
      port: label(route.start),
      destinationName:
        index.equipment.get(route.destinationEquipmentId ?? '')?.name ??
        route.destinationEquipmentId ??
        '',
      destinationPort: label(route.end),
      role: route.destinationRole === 'backbone' ? 'BB' : 'AGG',
      cables: route.hops.filter((h) => h.kind === 'cable').length,
      via,
    }
  })
  return {
    lines,
    mismatches: new Set(result.mismatches.map((r) => r.start)).size,
    notice: truncationNotice(result),
    total: index.lookup.byEquipment.get(equipmentId)?.length ?? 0,
  }
}
