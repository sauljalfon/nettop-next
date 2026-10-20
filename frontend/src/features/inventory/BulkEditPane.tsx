import { useMemo, useState } from 'react'
import { fixInstalledMany } from '../../shared/api'
import type { Endpoint, Equipment } from '../../shared/types'
import { EditError } from '../planning/ConfirmShell'
import type { PlanEdit } from '../planning/editing'
import { useAsyncAction } from '../planning/useAsyncAction'
import {
  BULK_CLEAR,
  bulkFields,
  bulkRefusal,
  bulkTargets,
  changeCounts,
  installedFixes,
  planBatch,
  type BulkInput,
  type BulkList,
} from './bulkEdit'
import { Pane } from './Panes'
import type { InventoryRow } from './rows'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Words shown capitalised; connectors and speeds are shown as they are. */
const CAPITALISED = new Set(['status', 'portType', 'state'])

/**
 * Edit details of many rows (Equipment and Ports). Only the fields you set
 * change, and only the rows whose value really changes are sent: on Installed
 * as one direct-fix request with the note, in a plan as one batch of
 * update_details. A refusal stays in the pane in the server's words.
 */
export default function BulkEditPane({
  list,
  rows,
  equipment,
  endpoints,
  installed,
  planName,
  edit,
  onFixed,
  onClose,
}: {
  list: BulkList
  rows: readonly InventoryRow[]
  equipment: ReadonlyMap<string, Equipment>
  /** Every endpoint of the snapshot (a map is made once, when the pane opens). */
  endpoints: readonly Endpoint[]
  installed: boolean
  planName?: string
  edit?: PlanEdit
  onFixed: (message: string) => Promise<void>
  onClose: () => void
}) {
  const [input, setInput] = useState<BulkInput>({})
  const [note, setNote] = useState('')
  const action = useAsyncAction()
  const byId = useMemo(
    () => new Map(endpoints.map((p) => [p.id, p])),
    [endpoints],
  )
  const targets = useMemo(
    () => bulkTargets(list, rows, { equipment, endpoints: byId }),
    [list, rows, equipment, byId],
  )
  const mode = installed ? 'installed' : 'plan'
  const refusal =
    bulkRefusal(mode, targets) ??
    (installed || edit ? undefined : 'Open a current draft to edit')
  const fields = bulkFields(list)
  const counts = changeCounts(list, input, targets)
  const n = targets.length
  const title = `Edit details of ${n} ${list === 'equipment' ? 'equipment' : n === 1 ? 'port' : 'ports'}`
  const set = (key: string, value: string) =>
    setInput((v) => ({ ...v, [key]: value }))

  const save = () =>
    void action
      .run(async () => {
        if (installed) {
          const fixes = installedFixes(list, input, targets)
          await fixInstalledMany(fixes, note.trim() || undefined)
          await onFixed(
            `Saved ${fixes.length} direct ${fixes.length === 1 ? 'fix' : 'fixes'} in one request.`,
          )
          return true
        }
        const command = planBatch(list, input, targets)
        if (!command || !edit) return false
        await edit(command)
        return true
      })
      .then((done) => done && onClose())

  return (
    <Pane
      title={title}
      openerKey="many:edit"
      onClose={onClose}
      mark={{ pane: 'edit', rows: counts.rows }}
      footer={
        <>
          <button
            className="btn primary"
            disabled={!!refusal || counts.rows === 0 || action.pending}
            title={refusal}
            onClick={save}
          >
            {installed
              ? `Save ${counts.rows} ${counts.rows === 1 ? 'fix' : 'fixes'}`
              : `Save ${counts.rows} in plan`}
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p>
        Only the fields you set change; the others keep each row’s own value.{' '}
        {installed ? (
          <>
            On Installed this is a direct fix: it does not change the topology,
            and each row’s History shows it with your note.
          </>
        ) : (
          <>
            In <b>Plan: {planName}</b> this edits what the plan adds, sent as
            one batch; each row is a line in Changes with its Undo.
          </>
        )}
      </p>
      {refusal && <p className="inv-save-error">{refusal}</p>}
      <div className="inv-form">
        {fields.map((f) => {
          const value = input[f.key] ?? ''
          const clearing = value === BULK_CLEAR
          const id = `bulk-${f.key}`
          return (
            <div className="inv-field" key={f.key}>
              <label htmlFor={id}>{f.label}</label>
              {f.kind === 'select' ? (
                <select
                  id={id}
                  value={value}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  <option value="">Keep as is</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {CAPITALISED.has(f.key) ? cap(o) : o}
                    </option>
                  ))}
                  <option value={BULK_CLEAR}>{BULK_CLEAR}</option>
                </select>
              ) : (
                <span className="inv-field-row">
                  <input
                    id={id}
                    value={clearing ? '' : value}
                    disabled={clearing}
                    placeholder="Keep as is"
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                  <label className="inv-clear">
                    <input
                      type="checkbox"
                      checked={clearing}
                      onChange={(e) =>
                        set(f.key, e.target.checked ? BULK_CLEAR : '')
                      }
                    />
                    Clear
                  </label>
                </span>
              )}
            </div>
          )
        })}
        {installed && (
          <div className="inv-field">
            <label htmlFor="bulk-note">Why (optional, kept in history)</label>
            <input
              id="bulk-note"
              value={note}
              placeholder="e.g. Models checked on site"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
      </div>
      <div>
        <span className="inv-dim">What changes</span>
        <div className="inv-list-box" data-testid="what-changes">
          {counts.fields.length === 0 ? (
            <div className="inv-dim">Nothing yet: set a field above.</div>
          ) : (
            counts.fields.map((f) => {
              const to = (input[f.key] ?? '').trim()
              return (
                <div key={f.key}>
                  <span>
                    {f.label} {to === BULK_CLEAR ? 'cleared' : `→ ${to}`}
                  </span>
                  <span className="inv-dim">
                    {f.count} of {n}
                    {f.count < n ? ' (the others have it)' : ''}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
      <EditError message={action.error} />
    </Pane>
  )
}
