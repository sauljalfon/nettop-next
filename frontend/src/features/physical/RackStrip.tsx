import { colorOf } from '../map/networkColors'
import type { ElevationRow } from './elevation'
import type { Inventory } from './inventory'
import Name from '../../shared/ui/Name'

const UNIT_PX = 11

/**
 * The equipment's rack, compact, for context: this equipment is ringed, route
 * equipment is teal, and clicking another equipment opens its page.
 */
export default function RackStrip({
  inv,
  rackId,
  name,
  rows,
  colors,
  onOpen,
}: {
  inv: Inventory
  rackId: string
  name: string
  rows: ElevationRow[]
  colors: ReadonlyMap<string, string>
  onOpen: (equipmentId: string) => void
}) {
  const units = inv.racks.get(rackId)?.units ?? 0
  return (
    <aside
      className="rack-strip"
      data-testid="rack-strip"
      aria-label={`${name} strip`}
    >
      <small className="phys-label">
        <Name text={name} />
      </small>
      <div className="strip-rack" style={{ height: units * UNIT_PX + 8 }}>
        {rows.map((row) => {
          if (row.kind !== 'equipment') return null
          const e = inv.equipment.get(row.equipmentId)!
          return (
            <button
              key={row.equipmentId}
              type="button"
              className="strip-block"
              data-equipment-id={e.id}
              data-selected={row.selected}
              data-on-route={row.onRoute}
              title={`${e.name} · ${row.height}U · U${row.unit}`}
              aria-label={`Open ${e.name}`}
              style={{
                bottom: 4 + (row.unit - 1) * UNIT_PX,
                height: row.height * UNIT_PX - 1,
                borderLeftColor:
                  e.role !== 'passive' && e.networkId
                    ? colorOf(colors, e.networkId)
                    : 'var(--steel-hover)',
              }}
              onClick={() => onOpen(e.id)}
            >
              <Name text={e.name} />
            </button>
          )
        })}
      </div>
    </aside>
  )
}
