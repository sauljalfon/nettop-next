import { useMemo } from 'react'
import type { Snapshot } from '../../shared/types'
import Name from '../../shared/ui/Name'
import Pieces from '../../shared/ui/Pieces'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { plural } from '../physical/text'
import { EditError } from '../planning/ConfirmShell'
import type { PlanEdit } from '../planning/editing'
import { useAsyncAction } from '../planning/useAsyncAction'
import { deleteSummary, disconnectSummary } from './manyPreview'
import { deleteBatch, disconnectBatch } from './model'
import { Pane } from './Panes'
import type { InventoryRow } from './rows'

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  rows: readonly InventoryRow[]
  planName: string
  edit: PlanEdit
  /** After the batch is saved: the page clears its selection. */
  onDone: () => void
  onClose: () => void
}

/** The circuits a batch cuts, one line each (the same words as the inspector's confirm). */
const Circuits = ({ circuits }: { circuits: readonly string[] }) =>
  circuits.length > 0 ? (
    <ul className="cut" data-testid="cut-circuits">
      {circuits.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  ) : null

/** Delete N… in a plan: one batch of delete_equipment, each with its place and what goes with it. */
export function DeletePane({
  snapshot,
  index,
  rows,
  planName,
  edit,
  onDone,
  onClose,
}: Props) {
  const summary = useMemo(
    () =>
      deleteSummary(
        snapshot,
        index,
        rows.map((r) => r.equipmentId),
      ),
    [snapshot, index, rows],
  )
  const action = useAsyncAction()
  const n = summary.items.length
  return (
    <Pane
      title={`Delete ${n} equipment`}
      openerKey="many:deleteMany"
      onClose={onClose}
      mark={{ pane: 'delete', rows: n }}
      footer={
        <>
          <button
            className="btn danger"
            disabled={action.pending}
            onClick={() =>
              void action
                .run(() => edit(deleteBatch(rows)))
                .then((saved) => {
                  if (!saved) return
                  onDone()
                  onClose()
                })
            }
          >
            Delete {n} in plan
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p>
        In{' '}
        <b>
          Plan: <Name text={planName} />
        </b>
        , this removes them with their{' '}
        <b>{summary.endpoints.toLocaleString('en')} ports or positions</b> and{' '}
        <b>{plural(summary.cables, 'cable')}</b>, which{' '}
        {summary.circuits.length > 0
          ? `cuts ${plural(summary.circuits.length, 'circuit')}`
          : 'cuts no circuit'}
        . Nothing changes on Installed until the plan is recorded.
      </p>
      <div className="inv-list-box">
        {summary.items.map((i) => (
          <div key={i.id}>
            <Name text={i.name} />
            <span className="inv-dim">
              <Pieces pieces={i.place} />
            </span>
          </div>
        ))}
      </div>
      <Circuits circuits={summary.circuits} />
      <p className="inv-dim">
        Sent as one batch. Each deletion is its own line in Changes, with its
        own Undo.
      </p>
      <EditError message={action.error} />
    </Pane>
  )
}

/** Disconnect N… in a plan: one batch of disconnect_cable for the distinct cables. */
export function DisconnectPane({
  snapshot,
  index,
  rows,
  planName,
  edit,
  onDone,
  onClose,
}: Props) {
  const summary = useMemo(
    () =>
      disconnectSummary(snapshot, index, [
        ...new Set(rows.flatMap((r) => (r.cableId ? [r.cableId] : []))),
      ]),
    [snapshot, index, rows],
  )
  const action = useAsyncAction()
  const n = summary.cables.length
  return (
    <Pane
      title={`Disconnect ${n} ${n === 1 ? 'cable' : 'cables'}`}
      openerKey="many:disconnectMany"
      onClose={onClose}
      mark={{ pane: 'disconnect', rows: n }}
      footer={
        <>
          <button
            className="btn danger"
            disabled={action.pending}
            onClick={() =>
              void action
                .run(() => edit(disconnectBatch(rows)))
                .then((saved) => {
                  if (!saved) return
                  onDone()
                  onClose()
                })
            }
          >
            Disconnect {n} in plan
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p>
        In{' '}
        <b>
          Plan: <Name text={planName} />
        </b>
        , {n === 1 ? 'this cable is' : 'these cables are'} removed; the ports
        stay. This{' '}
        {summary.circuits.length > 0
          ? `cuts ${plural(summary.circuits.length, 'circuit')}`
          : 'cuts no circuit'}
        .
      </p>
      <div className="inv-list-box">
        {summary.cables.map((c) => (
          <div key={c.id}>
            <span className="mono">{c.id}</span>
            <span className="inv-dim">
              <Pieces pieces={c.ends} />
            </span>
          </div>
        ))}
      </div>
      <Circuits circuits={summary.circuits} />
      <p className="inv-dim">Sent as one batch; Undo per cable in Changes.</p>
      <EditError message={action.error} />
    </Pane>
  )
}
