import { useMemo } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { ConfirmShell, EditError } from './ConfirmShell'
import {
  deleteLines,
  disconnectLines,
  equipmentDeletePreview,
} from './deletePreview'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'

/**
 * Deleting one equipment in a plan: what goes with it and which circuits are
 * cut, from the snapshot, computed when the confirm opens (not on every render).
 */
export function DeleteEquipmentConfirm({
  snapshot,
  index,
  equipmentId,
  proposed,
  edit,
  openerKey,
  onClose,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  equipmentId: string
  proposed: boolean
  edit: PlanEdit
  openerKey: string
  onClose: () => void
}) {
  const preview = useMemo(
    () => equipmentDeletePreview(snapshot, index, equipmentId),
    [snapshot, index, equipmentId],
  )
  const action = useAsyncAction()
  if (!preview) return null
  const lines = deleteLines(preview, proposed)
  return (
    <ConfirmShell
      label="Confirm delete"
      openerKey={openerKey}
      onClose={onClose}
    >
      <span>
        <strong>{lines.title}</strong> {lines.headline}
      </span>
      <span className="cut">{lines.cutsTitle}</span>
      {lines.circuits.length > 0 && (
        <ul className="cut" data-testid="cut-circuits">
          {lines.circuits.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {lines.footer && <span className="quiet">{lines.footer}</span>}
      <EditError message={action.error} />
      <div className="inline-row">
        <button
          className="button danger"
          disabled={action.pending}
          onClick={() =>
            void action
              .run(() =>
                edit({ type: 'delete_equipment', target: { id: equipmentId } }),
              )
              .then((saved) => saved && onClose())
          }
        >
          Delete in plan
        </button>
        <button className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ConfirmShell>
  )
}

/** Removing one cable in a plan, naming the circuit it cuts. */
export function DisconnectConfirm({
  snapshot,
  index,
  linkId,
  proposed,
  edit,
  openerKey,
  onClose,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  linkId: string
  proposed: boolean
  edit: PlanEdit
  openerKey: string
  onClose: () => void
}) {
  const lines = useMemo(
    () => disconnectLines(snapshot, index, linkId, proposed),
    [snapshot, index, linkId, proposed],
  )
  const action = useAsyncAction()
  return (
    <ConfirmShell
      label="Confirm disconnect"
      openerKey={openerKey}
      onClose={onClose}
    >
      <span>
        <strong>{lines.title}</strong> {lines.headline}
      </span>
      <span className="cut" data-testid="cut-circuits">
        {lines.cuts}
      </span>
      <EditError message={action.error} />
      <div className="inline-row">
        <button
          className="button danger"
          disabled={action.pending}
          onClick={() =>
            void action
              .run(() =>
                edit({ type: 'disconnect_cable', target: { id: linkId } }),
              )
              .then((saved) => saved && onClose())
          }
        >
          Disconnect in plan
        </button>
        <button className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ConfirmShell>
  )
}
