import type { SnapshotIndex } from '../map/snapshotIndex'
import { openLocation } from '../physical/explorerModel'
import type { PhysicalLocation } from '../physical/location'
import type { GoTarget } from './summary'

/** Where a summary line or conflict link opens in Physical (the most specific place it names). */
export function locationFor(
  index: SnapshotIndex,
  target: GoTarget,
): PhysicalLocation {
  switch (target.kind) {
    case 'equipment':
      return openLocation(index, { equipmentId: target.equipmentId })
    case 'endpoint':
      return openLocation(index, { endpointId: target.endpointId })
    case 'container':
      return openLocation(index, {
        siteId: target.siteId,
        nodeId: target.nodeId,
        rackId: target.rackId,
      })
  }
}
