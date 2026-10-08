import type { Equipment, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { endpointTooltip, faceFor, faceMeta } from './equipmentModel'
import FaceView from './FaceView'

/** Both sides of an equipment's face (one face for a switch), drawn plainly for a sheet. */
export default function EquipmentFaceStatic({
  snapshot,
  index,
  equipment,
  colors,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  equipment: Equipment
  colors: ReadonlyMap<string, string>
}) {
  const sides =
    equipment.kind === 'switch' ? [undefined] : (['front', 'rear'] as const)
  return (
    <div className="sheet-faces">
      {sides.map((side) => {
        const face = faceFor(index, equipment, side, {})
        return (
          <FaceView
            key={side ?? 'ports'}
            equipment={equipment}
            face={face}
            side={side}
            meta={faceMeta(equipment, {
              rows: face.kind === 'hdf' ? face.face.rows : undefined,
              count:
                face.kind === 'switch'
                  ? face.rows.reduce((n, r) => n + r.length, 0)
                  : face.kind === 'panel'
                    ? face.face.positions.length
                    : undefined,
              side,
              location: index.locations.get(equipment.id) ?? '',
              networks: snapshot.networks,
            })}
            networks={snapshot.networks}
            colors={colors}
            tooltip={(cell, ordinal) =>
              endpointTooltip(index, equipment, cell, ordinal, side)
            }
            onSelect={() => undefined}
            onSide={() => undefined}
            printing
          />
        )
      })}
    </div>
  )
}
