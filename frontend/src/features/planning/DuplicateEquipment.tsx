import { Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import TracePicker from '../pathfinding/TracePicker'
import { ConfirmShell, EditError } from './ConfirmShell'
import CopyPreview from './CopyPreview'
import { MAX_COPIES, duplicateLines, rackItems } from './duplicate'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import './editing.css'

/**
 * "Duplicate…" for one equipment in a plan, with its inline box below the
 * button: N more like it in the next free units of the same rack or another
 * one, as one batch. The same control sits in the inspector header and on the
 * equipment page; `where` keeps their focus targets apart.
 */
export default function DuplicateEquipment({
  snapshot,
  index,
  equipmentId,
  edit,
  where,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  equipmentId: string
  edit: PlanEdit
  where: 'inspector' | 'page'
}) {
  const [open, setOpen] = useState(false)
  const key = `duplicate:${where}:${equipmentId}`
  return (
    <div className="delete-equipment" data-testid={`duplicate-${where}`}>
      <button
        type="button"
        className="button"
        data-opener={key}
        aria-label={`Duplicate ${index.equipment.get(equipmentId)?.name ?? ''}…`}
        onClick={() => setOpen(true)}
      >
        <Copy size={14} aria-hidden />
        Duplicate…
      </button>
      {open && (
        <DuplicateBox
          snapshot={snapshot}
          equipmentId={equipmentId}
          edit={edit}
          openerKey={key}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function DuplicateBox({
  snapshot,
  equipmentId,
  edit,
  openerKey,
  onClose,
}: {
  snapshot: Snapshot
  equipmentId: string
  edit: PlanEdit
  openerKey: string
  onClose: () => void
}) {
  const source = snapshot.equipment.find((e) => e.id === equipmentId)
  const racks = useMemo(() => rackItems(snapshot), [snapshot])
  const [rackId, setRackId] = useState(source?.rackId ?? '')
  const [countText, setCountText] = useState('1')
  const action = useAsyncAction()
  const count = /^\d+$/.test(countText.trim()) ? Number(countText.trim()) : 0
  const countOk = count >= 1 && count <= MAX_COPIES
  const rackName = snapshot.racks.find((r) => r.id === rackId)?.name ?? ''
  const lines = useMemo(
    () =>
      source && countOk && rackId
        ? duplicateLines(
            snapshot,
            source.id,
            count,
            rackId,
            // The same rack: above the original. Another rack: from its bottom.
            rackId === source.rackId ? source.unit + source.height : 1,
          )
        : [],
    [snapshot, source, count, countOk, rackId],
  )
  if (!source) return null
  const blocked = lines.some((l) => l.problem)
  const ready = lines.length > 0 && !blocked && !action.pending
  return (
    <ConfirmShell
      label="Duplicate"
      openerKey={openerKey}
      onClose={onClose}
      className="connect-box connect-range"
    >
      <label>
        More like {source.name}
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
          Count must be between 1 and {MAX_COPIES}.
        </span>
      )}
      <TracePicker
        label="Rack"
        items={racks}
        value={rackId}
        onChange={(v) => {
          setRackId(v)
          action.clear()
        }}
      />
      <CopyPreview
        lines={lines}
        describe={(l) =>
          `${l.name} · ${rackName}${l.unit ? ` U${l.unit}` : ''}`
        }
      />
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
                  batch: {
                    commands: lines.flatMap((l) =>
                      l.command ? [l.command] : [],
                    ),
                  },
                }),
              )
              .then((saved) => saved && onClose())
          }
        >
          {lines.length > 0 ? `Duplicate ${lines.length}` : 'Duplicate'}
        </button>
        <button className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ConfirmShell>
  )
}
