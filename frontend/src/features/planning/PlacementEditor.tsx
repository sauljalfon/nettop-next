import { useState } from 'react'
import type { Equipment, Rack } from '../../shared/types'

export default function PlacementEditor({
  equipment,
  racks,
  pending,
  onMove,
}: {
  equipment: Equipment
  racks: Rack[]
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
        onMove({ equipmentId: equipment.id, rackId: rackID, unit })
      }}
    >
      <p className="section-label">Planned placement</p>
      <label>
        Placement rack
        <select
          value={rackID}
          disabled={pending}
          onChange={(e) => setRackID(e.target.value)}
        >
          {racks.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
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
      <button className="button" disabled={pending}>
        {pending ? 'Saving placement…' : 'Save planned placement'}
      </button>
    </form>
  )
}
