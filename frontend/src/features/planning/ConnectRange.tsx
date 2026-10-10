import { useMemo, useState } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import TracePicker from '../pathfinding/TracePicker'
import { ConfirmShell, EditError } from './ConfirmShell'
import { connectItems } from './containers'
import type { PlanEdit } from './editing'
import { MAX_RANGE, rangeCommands, rangePairs } from './range'
import { useAsyncAction } from './useAsyncAction'

/**
 * Connect a range (answers 20–22): from a free near endpoint, N endpoints in
 * order to N endpoints from a chosen far start. Every pair is listed with a
 * tick or the reason it cannot be made; ticking Skip leaves the blocked pairs
 * out. One batch of add_cable goes through the one PlanEdit path; the server
 * stays the authority and its refusal is shown here.
 */
export default function ConnectRange({
  snapshot,
  index,
  endpointId,
  edit,
  openerKey,
  onClose,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  endpointId: string
  edit: PlanEdit
  openerKey: string
  onClose: () => void
}) {
  const items = useMemo(
    () => connectItems(snapshot, index, endpointId),
    [snapshot, index, endpointId],
  )
  const [far, setFar] = useState('')
  const [countText, setCountText] = useState('6')
  const [skip, setSkip] = useState(false)
  const action = useAsyncAction()
  const count = /^\d+$/.test(countText.trim()) ? Number(countText.trim()) : 0
  const countOk = count >= 1 && count <= MAX_RANGE
  const pairs = useMemo(
    () =>
      far && countOk ? rangePairs(snapshot, index, endpointId, far, count) : [],
    [snapshot, index, endpointId, far, count, countOk],
  )
  const blocked = pairs.filter((p) => p.problem).length
  const makeable = pairs.length - blocked
  const near = snapshot.endpoints.find((e) => e.id === endpointId)
  const nearName = near
    ? `${index.equipment.get(near.equipmentId)?.name ?? ''} · ${near.label}`
    : endpointId
  const ready = makeable > 0 && (blocked === 0 || skip) && !action.pending
  return (
    <ConfirmShell
      label="Connect a range"
      openerKey={openerKey}
      onClose={onClose}
      className="connect-box connect-range"
    >
      <span className="quiet">From {nearName}</span>
      <label>
        Count
        <input
          className="count-input"
          inputMode="numeric"
          aria-label="Count"
          value={countText}
          onChange={(e) => {
            setCountText(e.target.value)
            action.clear()
          }}
        />
      </label>
      {!countOk && (
        <span className="edit-error" role="alert">
          Count must be between 1 and {MAX_RANGE}.
        </span>
      )}
      <TracePicker
        label="To: first far port or position"
        items={items}
        value={far}
        onChange={(v) => {
          setFar(v)
          action.clear()
        }}
      />
      {pairs.length > 0 && (
        <ol className="range-pairs" data-testid="range-pairs">
          {pairs.map((p) => (
            <li
              key={p.n}
              className={p.problem ? 'blocked' : 'ok'}
              data-blocked={!!p.problem}
            >
              <span aria-hidden="true">{p.problem ? '⚠' : '✓'}</span> {p.n}{' '}
              {p.near?.label ?? '—'} → {p.far ? p.farName : '—'}
              {p.problem && <em>{p.problem}</em>}
            </li>
          ))}
        </ol>
      )}
      {blocked > 0 && (
        <label className="range-skip">
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
          />
          Skip the {blocked} pair{blocked === 1 ? '' : 's'} that can’t be made
        </label>
      )}
      <EditError message={action.error} />
      <div className="inline-row">
        <button
          className="button primary"
          disabled={!ready}
          onClick={() =>
            void action
              .run(() =>
                edit({
                  type: 'batch',
                  batch: { commands: rangeCommands(pairs) },
                }),
              )
              .then((saved) => saved && onClose())
          }
        >
          {pairs.length === 0
            ? 'Connect'
            : `Connect ${skip ? makeable : pairs.length}`}
        </button>
        <button className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ConfirmShell>
  )
}
