import { routeHighlight } from '../pathfinding/projection'
import type { Route, Snapshot } from '../../shared/types'

interface Props {
  snapshot: Snapshot
  selected: string
  route?: Route
  installedIDs: Set<string>
  onSelect: (id: string) => void
  onPort: (id: string) => void
  canEdit?: boolean
  onMoveEquipment?: (id: string, rackID: string, unit: number) => void
  onCreateEquipment?: (
    kind: 'switch' | 'panel',
    rackID: string,
    unit: number,
    role?: 'access' | 'aggregation' | 'passive',
  ) => void
}

export default function RackView({
  snapshot,
  selected,
  route,
  installedIDs,
  onSelect,
  onPort,
  canEdit = false,
  onMoveEquipment,
  onCreateEquipment,
}: Props) {
  const highlights = routeHighlight(snapshot, route)
  return (
    <div className="rack-stage">
      {snapshot.racks.map((rack) => (
        <section className="rack-column" key={rack.id}>
          <div className="rack-title">
            <h3>{rack.name}</h3>
            <span>{rack.units}U · Front elevation</span>
          </div>
          <div className="rack-shell">
            {Array.from({ length: rack.units }, (_, i) => rack.units - i).map(
              (unit) => {
                const equipment = snapshot.equipment.find(
                  (e) =>
                    e.rackId === rack.id &&
                    e.unit <= unit &&
                    e.unit + e.height > unit,
                )
                return (
                  <div
                    key={unit}
                    className={`rack-unit ${canEdit && !equipment ? 'rack-drop-target' : ''}`}
                    data-testid={`rack-slot-${rack.id}-${unit}`}
                    onDragOver={(event) => {
                      if (canEdit && !equipment) {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'copy'
                      }
                    }}
                    onDrop={(event) => {
                      if (!canEdit || equipment) return
                      event.preventDefault()
                      const payload = event.dataTransfer.getData(
                        'application/x-nettop-item',
                      )
                      if (payload.startsWith('equipment:'))
                        onMoveEquipment?.(payload.slice(10), rack.id, unit)
                      else if (payload.startsWith('new:')) {
                        const [kind, , , role] = payload.slice(4).split(':')
                        if (kind === 'switch' || kind === 'panel')
                          onCreateEquipment?.(
                            kind,
                            rack.id,
                            unit,
                            role === 'aggregation'
                              ? 'aggregation'
                              : kind === 'panel'
                                ? 'passive'
                                : 'access',
                          )
                      }
                    }}
                  >
                    <span className="unit-number">{unit}</span>
                    {equipment ? (
                      <div
                        className={`rack-device ${selected === equipment.id ? 'selected' : ''} ${highlights.equipmentIds.has(equipment.id) ? 'traced' : ''}`}
                        title={`${equipment.name} · ${equipment.height}U · Starts at U${equipment.unit}`}
                      >
                        <button
                          className="rack-device-name"
                          draggable={canEdit}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              'application/x-nettop-item',
                              `equipment:${equipment.id}`,
                            )
                            event.dataTransfer.effectAllowed = 'copyMove'
                          }}
                          onClick={() => onSelect(equipment.id)}
                        >
                          <i />
                          {equipment.name}
                          {!installedIDs.has(equipment.id) && <span>＋</span>}
                        </button>
                        {unit === equipment.unit && (
                          <div className="rack-ports">
                            {snapshot.endpoints
                              .filter((p) => p.equipmentId === equipment.id)
                              .map((p) => (
                                <button
                                  key={p.id}
                                  aria-label={`${equipment.name} ${p.label}, set trace start`}
                                  title={`${p.label} · Click to trace`}
                                  className={
                                    highlights.endpointIds.has(p.id)
                                      ? 'lit'
                                      : ''
                                  }
                                  onClick={() => onPort(p.id)}
                                />
                              ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="empty-unit">Available</span>
                    )}
                  </div>
                )
              },
            )}
          </div>
          <p className="rack-foot">
            {snapshot.equipment
              .filter((e) => e.rackId === rack.id)
              .reduce((n, e) => n + e.height, 0)}
            U occupied{' '}
            <span>
              {snapshot.context === 'planned'
                ? 'Including proposal'
                : 'Installed topology'}
            </span>
          </p>
        </section>
      ))}
      <p className="rack-note">
        {canEdit
          ? 'Drop proposed or installed equipment onto a free unit to move it in this plan.'
          : 'Select equipment or a port to inspect and trace. Placement changes belong to plans.'}
      </p>
    </div>
  )
}
