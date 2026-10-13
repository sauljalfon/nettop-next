import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Snapshot } from '../../shared/types'
import LocationPicker from '../patching/LocationPicker'
import { locationTree } from '../patching/patching'
import { ConfirmShell, EditError } from './ConfirmShell'
import CopyPreview from './CopyPreview'
import { copyLayout } from './duplicate'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import './editing.css'

/**
 * "Copy rack layout…" on an empty rack in a plan: pick the rack to copy from,
 * see what lands where, then one batch of add_equipment / add_hdf at the same
 * units with new names. Never cables or details.
 */
export default function CopyRackLayout({
  snapshot,
  rackId,
  edit,
}: {
  snapshot: Snapshot
  rackId: string
  edit: PlanEdit
}) {
  const [anchor, setAnchor] = useState<CSSProperties>()
  const button = useRef<HTMLButtonElement>(null)
  const key = `copy-layout:${rackId}`
  const name = snapshot.racks.find((r) => r.id === rackId)?.name ?? ''
  return (
    <>
      <button
        type="button"
        className="button"
        data-opener={key}
        aria-label={`Copy rack layout into ${name}…`}
        ref={button}
        onClick={() => button.current && setAnchor(popoverAt(button.current))}
      >
        Copy rack layout…
      </button>
      {anchor &&
        createPortal(
          <CopyBox
            style={anchor}
            snapshot={snapshot}
            rackId={rackId}
            edit={edit}
            openerKey={key}
            onClose={() => setAnchor(undefined)}
          />,
          document.body,
        )}
    </>
  )
}

const POPOVER_WIDTH = 360

/**
 * Where the box opens: below its button, or above it when there is more room
 * there, and always inside the viewport. It floats over the neighbouring
 * cards instead of squeezing into the rack card.
 */
function popoverAt(button: HTMLElement): CSSProperties {
  const r = button.getBoundingClientRect()
  const left = Math.max(
    8,
    Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8),
  )
  const below = window.innerHeight - r.bottom
  return below >= 340 || below >= r.top
    ? { left, top: r.bottom + 6, maxHeight: below - 14 }
    : { left, bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 14 }
}

function CopyBox({
  style,
  snapshot,
  rackId,
  edit,
  openerKey,
  onClose,
}: {
  style: CSSProperties
  snapshot: Snapshot
  rackId: string
  edit: PlanEdit
  openerKey: string
  onClose: () => void
}) {
  const tree = useMemo(() => locationTree(snapshot), [snapshot])
  const [from, setFrom] = useState('')
  const action = useAsyncAction()
  const result = useMemo(
    () => (from ? copyLayout(snapshot, from, rackId) : undefined),
    [snapshot, from, rackId],
  )
  const lines = result?.lines ?? []
  const blocked = !!result?.problem || lines.some((l) => l.problem)
  const ready = lines.length > 0 && !blocked && !action.pending
  return (
    <ConfirmShell
      label="Copy rack layout"
      openerKey={openerKey}
      onClose={onClose}
      className="connect-box connect-range copy-popover nodrag nopan"
      style={style}
    >
      <LocationPicker
        level="rack"
        label="Copy the layout of"
        tree={tree}
        near={{ nodeId: snapshot.racks.find((r) => r.id === rackId)?.nodeId }}
        rackId={from}
        exclude={rackId}
        onChange={(v) => {
          setFrom(v)
          action.clear()
        }}
      />
      {result?.problem && (
        <span className="edit-error" role="alert">
          {result.problem}
        </span>
      )}
      <CopyPreview
        lines={lines}
        describe={(l) => `U${l.unit}  ${l.sourceName} → ${l.name}`}
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
          {lines.length > 0 ? `Copy ${lines.length}` : 'Copy'}
        </button>
        <button className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ConfirmShell>
  )
}
