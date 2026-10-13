import { useState } from 'react'
import { fixInstalled } from '../../shared/api'
import type { Equipment } from '../../shared/types'
import type { PlanEdit } from '../planning/editing'
import DetailsEditor, { DetailList } from './DetailsEditor'
import {
  EQUIPMENT_FIELDS,
  equipmentFields,
  equipmentValues,
  planEditCommand,
  type EditMode,
} from './model'

/** The Overview's Details: the fields, and Edit details where this context allows it. */
export default function EquipmentDetails({
  equipment,
  mode,
  edit,
  onFixed,
}: {
  equipment: Equipment
  mode: EditMode
  edit?: PlanEdit
  onFixed: (message: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const opener = `details:${equipment.id}`
  const before = equipmentValues(equipment)
  return (
    <section className="details-section" data-testid="equipment-details">
      <div className="details-head">
        <h3 className="inspector-section">Details</h3>
        {mode !== 'none' && !open && (
          <button
            className="button"
            data-opener={opener}
            onClick={() => setOpen(true)}
          >
            Edit details
          </button>
        )}
      </div>
      {open ? (
        <DetailsEditor
          title={
            mode === 'fix'
              ? `Fix details of ${equipment.name}`
              : `Details of the proposed ${equipment.name}`
          }
          fields={equipmentFields(mode)}
          before={before}
          withNote={mode === 'fix'}
          hint={
            mode === 'fix'
              ? 'A fix changes no topology. Drafts stay valid, and each changed field is written to the history.'
              : 'Saved in this plan with the proposed equipment.'
          }
          saveLabel={mode === 'fix' ? 'Save fix' : 'Save in plan'}
          openerKey={opener}
          onClose={() => setOpen(false)}
          onSave={async (fix) => {
            if (mode === 'fix') {
              const answer = await fixInstalled('equipment', equipment.id, fix)
              await onFixed(
                `Fixed ${fix.name ?? equipment.name}: ${answer.changes.length} field${answer.changes.length === 1 ? '' : 's'}`,
              )
            } else if (edit) {
              const command = planEditCommand(equipment.id, fix)
              if (command) await edit(command)
            }
          }}
        />
      ) : (
        <DetailList
          fields={EQUIPMENT_FIELDS.filter((f) => f.key !== 'name')}
          values={before}
        />
      )}
      {mode === 'none' && (
        <p className="details-hint">
          Details of installed equipment are fixed on Installed, without a plan.
        </p>
      )}
    </section>
  )
}
