import { Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import LocationPicker from '../patching/LocationPicker'
import { locationTree } from '../patching/patching'
import { ConfirmShell, EditError } from './ConfirmShell'
import CopyPreview from './CopyPreview'
import {
  MAX_COPIES,
  copySummary,
  duplicateLines,
  nextNames,
  sourceGroups,
  type GroupDetails,
} from './duplicate'
import PortDetailFields from './PortDetailFields'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import './editing.css'
import Name from '../../shared/ui/Name'
import Field from '../../shared/ui/Field'

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
        className="btn"
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
  const tree = useMemo(() => locationTree(snapshot), [snapshot])
  const [rackId, setRackId] = useState(source?.rackId ?? '')
  const [countText, setCountText] = useState('1')
  const action = useAsyncAction()
  // What the user changed: names by copy index (undefined keeps the default),
  // the network, and each port group's type, connector and speed.
  const [names, setNames] = useState<string[]>([])
  const [networkId, setNetworkId] = useState(source?.networkId ?? '')
  const fromSource = useMemo(
    () => sourceGroups(snapshot, equipmentId),
    [snapshot, equipmentId],
  )
  const [groups, setGroups] = useState<GroupDetails[]>(() =>
    fromSource.map((g) => g.details),
  )
  const isSwitch = source?.kind === 'switch'
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
            { names, networkId, groups },
          )
        : [],
    [snapshot, source, count, countOk, rackId, names, networkId, groups],
  )
  const defaultNames = useMemo(
    () =>
      source && countOk
        ? nextNames(
            source.name,
            count,
            snapshot.equipment.map((e) => e.name),
          )
        : [],
    [snapshot, source, count, countOk],
  )
  const networkName =
    snapshot.networks.find((n) => n.id === networkId)?.name ?? networkId
  if (!source) return null
  const blocked = lines.some((l) => l.problem)
  const ready = lines.length > 0 && !blocked && !action.pending
  return (
    <ConfirmShell
      label="Duplicate"
      openerKey={openerKey}
      onClose={onClose}
      className="connect-box connect-range proposes"
    >
      <Field
        label={
          <>
            More like <Name text={source.name} />
          </>
        }
      >
        {(id) => (
          <input
            id={id}
            type="text"
            className="count-input"
            inputMode="numeric"
            aria-label="Count"
            value={countText}
            onChange={(e) => {
              setCountText(e.target.value)
              action.clear()
            }}
          />
        )}
      </Field>
      {!countOk && (
        <span className="edit-error" role="alert">
          Count must be between 1 and {MAX_COPIES}.
        </span>
      )}
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        rackId={rackId}
        onChange={(v) => {
          setRackId(v)
          action.clear()
        }}
      />
      {isSwitch && (
        <Field label="Network">
          {(id) => (
            <select
              id={id}
              aria-label="Network"
              value={networkId}
              onChange={(e) => {
                setNetworkId(e.target.value)
                action.clear()
              }}
            >
              {snapshot.networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {isSwitch &&
        (fromSource.length > 0 ? (
          <div className="port-groups">
            {fromSource.map((g, i) => (
              <div
                key={i}
                className="port-group"
                role="group"
                aria-label={`Port group ${i + 1}`}
              >
                <span className="group-caption">{g.caption}</span>
                <div className="group-line">
                  <PortDetailFields
                    value={groups[i] ?? g.details}
                    onChange={(patch) => {
                      setGroups((all) =>
                        fromSource.map((src, n) => ({
                          ...(all[n] ?? src.details),
                          ...(n === i ? patch : {}),
                        })),
                      )
                      action.clear()
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">
            Port types can be changed on copies of switches made with port
            groups.
          </p>
        ))}
      <CopyPreview
        lines={lines}
        describe={(l) => (
          <>
            <input
              type="text"
              className="copy-name"
              aria-label={`Name of copy ${l.n}`}
              autoComplete="off"
              placeholder={defaultNames[l.n - 1]}
              value={names[l.n - 1] ?? defaultNames[l.n - 1] ?? ''}
              onChange={(e) => {
                setNames((all) => {
                  const next = [...all]
                  next[l.n - 1] = e.target.value
                  return next
                })
                action.clear()
              }}
            />
            {' · '}
            <Name text={rackName} />
            {l.unit ? ` U${l.unit}` : ''}
            {isSwitch && (
              <>
                {' · '}
                <Name text={networkName} />
              </>
            )}
          </>
        )}
      />
      {fromSource.length > 0 && (
        <p className="hint" data-testid="copy-summary">
          {copySummary(
            fromSource.map((g, i) => ({
              ...g,
              details: groups[i] ?? g.details,
            })),
          )}
        </p>
      )}
      <EditError message={action.error} />
      <div className="form-actions">
        <button
          className="btn primary"
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
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ConfirmShell>
  )
}
