import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { DeleteEquipmentConfirm } from './EditConfirms'
import type { PlanEdit } from './editing'
import './editing.css'

/**
 * "Delete…" for one equipment in a plan, with its inline confirm below the
 * button. The same control sits in the inspector header and on the equipment
 * page; `where` keeps their focus targets apart.
 */
export default function DeleteEquipment({
  snapshot,
  index,
  equipmentId,
  proposed,
  edit,
  where,
  startOpen,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  equipmentId: string
  proposed: boolean
  edit: PlanEdit
  where: 'inspector' | 'page'
  /** A request to open the confirm at once (the Inventory's Delete…); a new number asks again. */
  startOpen?: number
}) {
  const [asking, setAsking] = useState(startOpen !== undefined)
  useEffect(() => {
    if (startOpen !== undefined) setAsking(true)
  }, [startOpen])
  const key = `delete:${where}:${equipmentId}`
  return (
    <div className="delete-equipment" data-testid={`delete-equipment-${where}`}>
      <button
        type="button"
        className="btn danger-outline"
        data-opener={key}
        aria-label={`Delete ${index.equipment.get(equipmentId)?.name ?? ''}…`}
        onClick={() => setAsking(true)}
      >
        <Trash2 size={14} aria-hidden />
        Delete…
      </button>
      {asking && (
        <DeleteEquipmentConfirm
          snapshot={snapshot}
          index={index}
          equipmentId={equipmentId}
          proposed={proposed}
          edit={edit}
          openerKey={key}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  )
}
