import { useState } from 'react'
import { fixInstalled } from '../../shared/api'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { PlanEdit } from '../planning/editing'
import DetailsEditor, { DetailList } from './DetailsEditor'
import {
  PORT_FIELDS,
  canRenamePort,
  editMode,
  portFields,
  portValues,
} from './model'

/**
 * The endpoint detail's Port details: type, connector, speed, state and
 * description, and Edit port details where this context allows it. A state is
 * data: it never changes a trace.
 */
export default function PortDetails({
  snapshot,
  index,
  endpointId,
  proposed,
  edit,
  onFixed,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  endpointId: string
  /** The port's equipment exists only in this plan. */
  proposed: boolean
  edit?: PlanEdit
  onFixed: (message: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const endpoint = index.lookup.endpoints.get(endpointId)
  const equipment = endpoint && index.equipment.get(endpoint.equipmentId)
  if (!endpoint || !equipment) return null
  const mode = editMode(
    snapshot.context === 'installed' ? 'installed' : 'planned',
    proposed,
    !!edit,
  )
  const opener = `port-details:${endpointId}`
  const before = portValues(endpoint)
  const who = `${equipment.name} · ${endpoint.label}`
  return (
    <section className="details-section" data-testid="port-details">
      <div className="details-head">
        <span className="section-label">PORT DETAILS</span>
        {mode !== 'none' && !open && (
          <button
            className="button"
            data-opener={opener}
            onClick={() => setOpen(true)}
          >
            Edit port details
          </button>
        )}
      </div>
      {open ? (
        <DetailsEditor
          title={
            mode === 'fix' ? `Fix ${who}` : `Details of the proposed ${who}`
          }
          fields={portFields(mode, canRenamePort(equipment, endpoint))}
          before={before}
          withNote={mode === 'fix'}
          hint="A port state is data: it never changes a trace."
          saveLabel={mode === 'fix' ? 'Save fix' : 'Save in plan'}
          openerKey={opener}
          onClose={() => setOpen(false)}
          onSave={async (fix) => {
            if (mode === 'fix') {
              const answer = await fixInstalled('endpoint', endpointId, fix)
              await onFixed(
                `Fixed ${who}: ${answer.changes.length} field${answer.changes.length === 1 ? '' : 's'}`,
              )
            } else if (edit) {
              await edit({
                type: 'update_details',
                target: { id: endpointId },
                details: fix.details ?? {},
              })
            }
          }}
        />
      ) : (
        <DetailList
          fields={PORT_FIELDS.filter((f) => f.key !== 'name')}
          values={before}
        />
      )}
      {mode === 'none' && (
        <p className="details-hint">
          Port details are fixed on Installed; they never change topology.
        </p>
      )}
    </section>
  )
}
