import type { Snapshot } from '../../shared/types'
import { colorOf } from '../map/networkColors'
import { DRAG_TYPE, dropInto, type DropHandlers } from './drops'
import type { ElevationRow } from './elevation'
import { elevationSubtitle } from './explorerModel'

const NO_NETWORK_EDGE = '#7d8aa0'

interface Props extends DropHandlers {
  snapshot: Snapshot
  rackId: string
  rows: ElevationRow[]
  colors: ReadonlyMap<string, string>
  /** In a plan: free units are drop targets and equipment can be dragged. */
  canEdit: boolean
  /** Selects the equipment (the workspace's selection); it does not open the inspector. */
  onSelect: (equipmentId: string) => void
}

/**
 * One rack, full height, top unit first: each equipment is one block spanning
 * its units, free units say Available. Route equipment is teal, the selected
 * one is ringed, proposed equipment is dashed and tagged, other networks'
 * devices are muted. In a plan the same drops as before apply, with the same
 * `rack-slot-<rack>-<unit>` test IDs.
 */
export default function RackElevation({
  snapshot,
  rackId,
  rows,
  colors,
  canEdit,
  onSelect,
  onMoveEquipment,
  onCreateEquipment,
}: Props) {
  const rack = snapshot.racks.find((r) => r.id === rackId)
  if (!rack) return null
  const equipment = new Map(snapshot.equipment.map((e) => [e.id, e]))
  const handlers = { onMoveEquipment, onCreateEquipment }
  return (
    <div className="rack-level">
      <section className="rack-figure">
        <header className="rack-heading">
          <strong>{rack.name}</strong>
          <small>{rack.units}U · front elevation</small>
        </header>
        <div
          className="rack-cabinet"
          style={{ gridTemplateRows: `repeat(${rack.units}, 30px)` }}
        >
          {Array.from({ length: rack.units }, (_, i) => (
            <span
              key={i}
              className="unit-label"
              style={{ gridColumn: 1, gridRow: i + 1 }}
            >
              U{rack.units - i}
            </span>
          ))}
          {rows.map((row) => {
            if (row.kind === 'free')
              return (
                <div
                  key={`free-${row.unit}`}
                  className="rack-slot free"
                  data-testid={`rack-slot-${rackId}-${row.unit}`}
                  data-drop-target={canEdit}
                  style={{ gridColumn: 2, gridRow: rack.units - row.unit + 1 }}
                  onDragOver={(event) => {
                    if (!canEdit) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                  }}
                  onDrop={(event) => {
                    if (!canEdit) return
                    if (
                      dropInto(
                        event.dataTransfer.getData(DRAG_TYPE),
                        rackId,
                        row.unit,
                        handlers,
                      )
                    )
                      event.preventDefault()
                  }}
                >
                  Available
                </div>
              )
            const e = equipment.get(row.equipmentId)!
            return (
              <div
                key={row.equipmentId}
                className="rack-slot occupied"
                data-testid={`rack-slot-${rackId}-${row.unit}`}
                style={{
                  gridColumn: 2,
                  gridRow: `${rack.units - row.topUnit + 1} / span ${row.height}`,
                }}
              >
                <button
                  type="button"
                  className="rack-block"
                  data-equipment-id={e.id}
                  data-unit={row.unit}
                  data-height={row.height}
                  data-selected={row.selected}
                  data-on-route={row.onRoute}
                  data-muted={row.muted}
                  data-proposed={row.proposed}
                  draggable={canEdit}
                  title={`${e.name} · ${row.height}U · U${row.unit}`}
                  style={{
                    borderLeftColor:
                      e.role !== 'passive' && e.networkId
                        ? colorOf(colors, e.networkId)
                        : NO_NETWORK_EDGE,
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, `equipment:${e.id}`)
                    event.dataTransfer.effectAllowed = 'copyMove'
                  }}
                  onClick={() => onSelect(e.id)}
                >
                  <span className="rack-block-name">
                    {e.name}
                    {row.proposed && <em className="proposed-tag">PROPOSED</em>}
                  </span>
                  <small>{elevationSubtitle(e, snapshot.networks)}</small>
                </button>
              </div>
            )
          })}
        </div>
      </section>
      <aside className="rack-notes">
        <p>A 3U HDF is one object spanning its three units.</p>
        <p>Teal = equipment on the selected route.</p>
        {canEdit && (
          <p>
            Free units accept drops from the library or another rack of this
            node.
          </p>
        )}
      </aside>
    </div>
  )
}
