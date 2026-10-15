import { Trash2 } from 'lucide-react'
import { useState } from 'react'
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
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  equipmentId: string
  proposed: boolean
  edit: PlanEdit
  where: 'inspector' | 'page'
}) {
  const [asking, setAsking] = useState(false)
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
