import { useState } from 'react'
import type { Equipment, Rack } from '../../shared/types'
import LocationPicker from '../patching/LocationPicker'
import type { SiteBranch } from '../patching/patching'

export default function PlacementEditor({
  equipment,
  tree,
  racks,
  pending,
  onMove,
}: {
  equipment: Equipment
  tree: readonly SiteBranch[]
  /** For the chosen rack's height, the unit's maximum. */
  racks: readonly Rack[]
  pending: boolean
  onMove: (placement: {
    equipmentId: string
    rackId: string
    unit: number
  }) => void
}) {
  const [rackID, setRackID] = useState(equipment.rackId)
  const [unit, setUnit] = useState(equipment.unit)
  return (
    <form
      className="placement-editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (rackID) onMove({ equipmentId: equipment.id, rackId: rackID, unit })
      }}
    >
      <p className="section-label">Planned placement</p>
      <LocationPicker
        level="rack"
        label="Placement"
        tree={tree}
        rackId={rackID}
        disabled={pending}
        onChange={setRackID}
      />
      <label>
        Placement unit
        <input
          type="number"
          min={1}
          max={racks.find((r) => r.id === rackID)?.units ?? 100}
          required
          value={unit}
          disabled={pending}
          onChange={(e) => setUnit(Number(e.target.value))}
        />
      </label>
      <button className="button" disabled={pending || !rackID}>
        {pending ? 'Saving placement…' : 'Save planned placement'}
      </button>
    </form>
  )
}
