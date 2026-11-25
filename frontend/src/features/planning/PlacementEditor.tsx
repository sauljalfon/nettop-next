import { useState } from 'react'
import type { Equipment, Rack, Snapshot } from '../../shared/types'
import Field from '../../shared/ui/Field'
import LocationPicker from '../patching/LocationPicker'
import type { SiteBranch } from '../patching/patching'
import { lowestFreeUnit } from './placement'
import './planning.css'

/**
 * The placement form: "Move to another rack…" for one equipment in a plan (the equipment page's ⋯
 * menu): Site › Node › Rack and a unit, which follows the chosen rack's lowest
 * free unit until it is typed. The same move_equipment command a drag sends.
 */
export default function PlacementEditor({
  snapshot,
  equipment,
  tree,
  racks,
  pending,
  onMove,
  onClose,
}: {
  snapshot: Pick<Snapshot, 'equipment' | 'racks'>
  equipment: Equipment
  tree: readonly SiteBranch[]
  /** For the chosen rack's height, the unit's maximum. */
  racks: readonly Rack[]
  pending: boolean
  onMove: (rackId: string, unit: number) => void
  onClose: () => void
}) {
  const [rackId, setRackId] = useState(equipment.rackId)
  const [typed, setTyped] = useState<number>()
  const unit = typed ?? lowestFreeUnit(snapshot, rackId, equipment.id)
  return (
    <form
      className="placement-editor move-equipment"
      data-testid="move-equipment"
      onSubmit={(event) => {
        event.preventDefault()
        if (rackId) onMove(rackId, unit)
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <p className="section-label">Move to another rack</p>
      <LocationPicker
        level="rack"
        label="Move to"
        tree={tree}
        rackId={rackId}
        disabled={pending}
        onChange={(id) => {
          setRackId(id)
          setTyped(undefined)
        }}
      />
      <Field label="Unit">
        {(id) => (
          <input
            id={id}
            type="number"
            min={1}
            max={racks.find((r) => r.id === rackId)?.units ?? 100}
            required
            value={unit}
            disabled={pending}
            onChange={(e) => setTyped(Number(e.target.value))}
          />
        )}
      </Field>
      <div className="placement-actions">
        <button className="btn primary" disabled={pending || !rackId}>
          Move
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
