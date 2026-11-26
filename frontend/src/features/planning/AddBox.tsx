import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { rackItemTypeLabel } from '../../shared/rackItems'
import type { Plan, Snapshot } from '../../shared/types'
import Chip from '../../shared/ui/Chip'
import Field from '../../shared/ui/Field'
import Name from '../../shared/ui/Name'
import { defaultNetwork, modelPortCount, seriesNames } from '../models/model'
import { useSwitchModels } from '../models/useSwitchModels'
import {
  boxFit,
  boxHeight,
  buildBox,
  DEFAULT_HDF,
  firstFit,
  howMany,
  MAX_HOW_MANY,
  occupiedUnits,
  PANEL_MAX_POSITIONS,
  PANEL_POSITIONS,
  startName,
  takenUnits,
  whereText,
  type BoxValues,
  type SwitchRole,
} from './boxModel'
import { addSession, type BoxRequest } from './addSession'
import { EditError } from './ConfirmShell'
import { HDF_MAX_ROWS, hdfPositions } from './containers'
import { useLastEdit, type PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import { useInlineDialog } from './useInlineDialog'
import './addbox.css'

const ROLES: { role: SwitchRole; label: string }[] = [
  { role: 'access', label: 'Access' },
  { role: 'aggregation', label: 'AGG' },
  { role: 'backbone', label: 'BB' },
]

/** The `data-opener` mark of a free unit: focus goes back to it when the box closes. */
export const unitOpener = (rackId: string, unit: number) =>
  `unit-slot:${rackId}:${unit}`

/** Where the unit is on the screen, followed through scrolling and resizing; the rack itself when the unit is out of the drawing. */
function useAnchor(rackId: string, unit: number | undefined) {
  const [rect, setRect] = useState<DOMRect>()
  useLayoutEffect(() => {
    const read = () => {
      const el =
        (unit !== undefined &&
          document.querySelector(
            `[data-testid="rack-slot-${rackId}-${unit}"]`,
          )) ||
        document.querySelector('[data-testid="rack-column"]')
      setRect(el?.getBoundingClientRect())
    }
    read()
    window.addEventListener('resize', read)
    window.addEventListener('scroll', read, true)
    return () => {
      window.removeEventListener('resize', read)
      window.removeEventListener('scroll', read, true)
    }
  }, [rackId, unit])
  return rect
}

/**
 * The small box at the unit (D51): what a click or a drop of a library entry
 * on a free unit opens, in a plan only. One box per kind (a switch of a model,
 * a patch panel, an HDF, a rack item); Enter adds, Escape cancels. It stacks
 * `How many` devices down from the unit, marks the units they will take and
 * refuses in words when they do not fit. Add sends one batch; the server's
 * refusal shows here.
 */
export default function AddBox({
  request,
  snapshot,
  edit,
  headerNetworkId,
  onClose,
  onAdded,
  onManageNetworks,
  onPreview,
}: {
  request: BoxRequest
  snapshot: Snapshot
  edit?: PlanEdit
  /** The header's network: the box starts on it when the rack's switches do not agree. */
  headerNetworkId?: string
  onClose: () => void
  onAdded: (plan: Plan, names: string[]) => void
  onManageNetworks: () => void
  /** The units the new equipment will take, for the rack to mark. */
  onPreview: (units: ReadonlySet<number> | undefined) => void
}) {
  const { item, rackId } = request
  const rack = snapshot.racks.find((r) => r.id === rackId)
  const models = useSwitchModels()
  const model =
    item.type === 'model'
      ? models.models?.find((m) => m.id === item.modelId)
      : undefined
  const gone = item.type === 'model' && !!models.models && !model
  const run = useLastEdit(edit)
  const action = useAsyncAction()
  // The box asks the server again when it opens: a model deleted since the card was drawn is gone.
  const refetch = models.refetch
  useEffect(() => {
    if (item.type === 'model') void refetch()
    // Once per box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.token])

  const occupied = useMemo(
    () => occupiedUnits(snapshot.equipment, rackId),
    [snapshot.equipment, rackId],
  )
  const node = snapshot.nodes.find((n) => n.id === rack?.nodeId)
  const rackSwitchNetworks = snapshot.equipment
    .filter((e) => e.rackId === rackId && e.kind === 'switch')
    .map((e) => e.networkId ?? '')
  const start = useMemo(() => {
    const net = defaultNetwork(rackSwitchNetworks, headerNetworkId)
    return {
      net,
      lastPanel: addSession.lastPanel(),
      hdf: addSession.lastHdf() ?? DEFAULT_HDF,
    }
    // Fixed when the box opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.token])
  const [values, setValues] = useState<BoxValues>(() => ({
    name: '',
    count: '1',
    role: 'access',
    networkId: start.net.id ?? '',
    positions: String(start.lastPanel ?? 24),
    rows: String(start.hdf.rows),
    height:
      item.type === 'hdf'
        ? String(start.hdf.height)
        : item.type === 'rack_item'
          ? String(item.itemType === 'ups' ? 2 : 1)
          : '1',
    itemText: '',
  }))
  const [edited, setEdited] = useState({
    name: false,
    height: false,
    network: false,
  })
  const [otherPositions, setOtherPositions] = useState(
    start.lastPanel !== undefined &&
      !(PANEL_POSITIONS as readonly number[]).includes(start.lastPanel),
  )
  const height = boxHeight(item, model, values)
  const count = howMany(item, values.count)
  // Where the first device's top is: the unit it was opened at, else the first run that fits.
  const [top] = useState(() =>
    rack
      ? (request.unit ?? firstFit(occupied, rack.units, height) ?? undefined)
      : undefined,
  )
  const fit =
    rack && top !== undefined
      ? boxFit(occupied, rack, top, height, count)
      : { error: 'There is no free run of units in this rack.' }
  const lowest = 'lowest' in fit ? fit.lowest : []
  const lowestUnit = lowest.length ? lowest[0] : (top ?? 1)
  const suggested = startName(item, {
    equipment: snapshot.equipment,
    racks: snapshot.racks,
    rackId,
    role: values.role,
    nodeName: node?.name,
    rackName: rack?.name,
    unit: lowestUnit,
    itemType: item.type === 'rack_item' ? item.itemType : undefined,
    itemText: values.itemText,
  })
  const name = edited.name ? values.name : suggested
  // Network A "like the other switches in this rack": until the user chooses another.
  const networkId = values.networkId
  const set = (patch: Partial<BoxValues>) => {
    setValues((v) => ({ ...v, ...patch }))
    if ('name' in patch) setEdited((e) => ({ ...e, name: true }))
    if ('height' in patch) setEdited((e) => ({ ...e, height: true }))
    if ('networkId' in patch) setEdited((e) => ({ ...e, network: true }))
    action.clear()
  }
  const placed = whereText(lowest, height)
  useEffect(() => {
    onPreview(lowest.length ? new Set(takenUnits(lowest, height)) : undefined)
    return () => onPreview(undefined)
    // The units, not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowest.join(','), height])

  const dialog = useInlineDialog<HTMLFormElement>(
    onClose,
    unitOpener(rackId, request.unit ?? top ?? 0),
  )
  const rect = useAnchor(rackId, request.unit ?? top)
  const [shiftTop, setShiftTop] = useState(0)
  const formRef = dialog.ref
  useLayoutEffect(() => {
    const el = formRef.current
    if (!el || !rect) return
    const room = window.innerHeight - 8
    const want = rect.top - 8
    setShiftTop(Math.max(8, Math.min(want, room - el.offsetHeight)))
  }, [rect, formRef, values, action.error])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!rack || !run || top === undefined) return
    void action
      .run(async () => {
        // The card may be older than the model: ask again, add from what the server has now.
        let current = model
        if (item.type === 'model') {
          const list = await refetch()
          current = list?.find((m) => m.id === item.modelId)
          if (!current) throw new Error('This model is gone.')
        }
        const built = buildBox({
          item,
          model: current,
          rack,
          top,
          occupied,
          taken: new Set(snapshot.equipment.map((e) => e.name.toLowerCase())),
          values: { ...values, name },
        })
        if ('error' in built) throw new Error(built.error)
        const saved = await run({
          type: 'batch',
          batch: { commands: built.commands },
        })
        return { saved, names: built.names }
      })
      .then((done) => {
        if (!done) return
        if (item.type === 'panel')
          addSession.rememberPanel(Number(values.positions))
        if (item.type === 'hdf')
          addSession.rememberHdf(Number(values.rows), height)
        onAdded(done.saved, done.names)
      })
  }

  const title =
    item.type === 'model' ? (
      <Name text={model?.name ?? 'switch'} />
    ) : item.type === 'panel' ? (
      'Patch panel'
    ) : item.type === 'hdf' ? (
      'HDF'
    ) : (
      rackItemTypeLabel(item.itemType)
    )
  const many = item.type === 'model' || item.type === 'panel'
  const names =
    many && count > 1 && count <= MAX_HOW_MANY && lowest.length
      ? seriesNames(name || '…', count)
      : []
  const noNetworks = snapshot.networks.length === 0
  const pending = action.pending
  const refusal = gone ? 'This model is gone.' : 'error' in fit ? fit.error : ''
  const canAdd =
    !pending &&
    !refusal &&
    !!run &&
    (item.type !== 'model' || !!model) &&
    !!rack

  const box = (
    <form
      {...dialog}
      className="inline-form proposes add-box"
      aria-label="Add equipment"
      data-testid="add-box"
      data-item={item.type}
      noValidate
      style={{
        left: rect ? Math.min(rect.right + 14, window.innerWidth - 350) : 24,
        top: rect ? shiftTop : 80,
      }}
      onSubmit={submit}
    >
      <div className="form-head">
        <strong className="form-title">Add {title}</strong>
        <span className="muted">{placed ? `at ${placed}` : ''}</span>
        <Chip kind="proposed" className="proposed-tag">
          Proposed
        </Chip>
      </div>
      <Field label="Name">
        {(id) => (
          <input
            id={id}
            type="text"
            value={name}
            autoComplete="off"
            placeholder={
              item.type === 'model'
                ? 'e.g. EDGE-31'
                : item.type === 'panel'
                  ? 'e.g. PANEL-A'
                  : item.type === 'hdf'
                    ? 'e.g. HDF-03'
                    : undefined
            }
            onChange={(e) => set({ name: e.target.value })}
          />
        )}
      </Field>
      {item.type === 'model' && (
        <div className="field-grid">
          <div className="field">
            <span className="label" id="add-box-role">
              Role
            </span>
            <div className="seg" role="group" aria-labelledby="add-box-role">
              {ROLES.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  aria-pressed={values.role === r.role}
                  onClick={() => set({ role: r.role })}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <Field
            label="Network"
            hint={
              !edited.network && start.net.why === 'rack'
                ? 'like the other switches in this rack'
                : !edited.network && start.net.why === 'header'
                  ? 'the network shown in the header'
                  : undefined
            }
          >
            {(id) => (
              <select
                id={id}
                aria-label="Network"
                value={networkId}
                disabled={noNetworks}
                onChange={(e) => set({ networkId: e.target.value })}
              >
                {noNetworks ? (
                  <option value="">No networks yet</option>
                ) : (
                  <>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {snapshot.networks.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            )}
          </Field>
        </div>
      )}
      {item.type === 'model' && noNetworks && (
        <p className="hint" data-testid="no-networks-hint">
          A switch belongs to a network.{' '}
          <button
            type="button"
            className="link-button"
            onClick={onManageNetworks}
          >
            Manage networks…
          </button>
        </p>
      )}
      {item.type === 'model' && model && (
        <p className="hint">
          {modelPortCount(model)} ports · {model.height}U ·{' '}
          <Name text={model.name} />
        </p>
      )}
      {item.type === 'panel' && (
        <Field
          label="Positions"
          hint={
            otherPositions
              ? `1–${PANEL_MAX_POSITIONS} positions`
              : 'front and rear, one bridge each'
          }
        >
          {(id) => (
            <span className="add-box-positions">
              <span className="seg" role="group" aria-label="Positions">
                {PANEL_POSITIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={
                      !otherPositions && values.positions === String(n)
                    }
                    onClick={() => {
                      setOtherPositions(false)
                      set({ positions: String(n) })
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={otherPositions}
                  onClick={() => setOtherPositions(true)}
                >
                  Other…
                </button>
              </span>
              {otherPositions && (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={PANEL_MAX_POSITIONS}
                  aria-label="Other positions"
                  className="count-input"
                  value={values.positions}
                  onChange={(e) => set({ positions: e.target.value })}
                />
              )}
            </span>
          )}
        </Field>
      )}
      {item.type === 'hdf' && (
        <>
          <div className="field-grid">
            <Field label="Rows">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={HDF_MAX_ROWS}
                  value={values.rows}
                  onChange={(e) => set({ rows: e.target.value })}
                />
              )}
            </Field>
            <Field label="Height (U)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  value={values.height}
                  onChange={(e) => set({ height: e.target.value })}
                />
              )}
            </Field>
          </div>
          <p className="hint">
            {Number(values.rows) >= 1 && Number(values.rows) <= HDF_MAX_ROWS
              ? `${values.rows} rows × A–D · ${hdfPositions(Number(values.rows))} positions per side · ${height}U`
              : `Rows must be between 1 and ${HDF_MAX_ROWS}.`}
          </p>
        </>
      )}
      {item.type === 'rack_item' && (
        <>
          {item.itemType === 'other' && (
            <Field label="What it is">
              {(id) => (
                <input
                  id={id}
                  type="text"
                  value={values.itemText}
                  autoComplete="off"
                  maxLength={100}
                  placeholder="e.g. KVM switch"
                  onChange={(e) => set({ itemText: e.target.value })}
                />
              )}
            </Field>
          )}
          <Field label="Height (U)">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                value={values.height}
                onChange={(e) => set({ height: e.target.value })}
              />
            )}
          </Field>
        </>
      )}
      {many && (
        <Field
          label="How many"
          hint={count > 1 ? `stacked down from U${top}` : undefined}
        >
          {(id) => (
            <span className="add-box-stepper">
              <button
                type="button"
                className="btn"
                aria-label="One fewer"
                disabled={!(count > 1)}
                onClick={() => set({ count: String(count - 1) })}
              >
                −
              </button>
              <input
                id={id}
                type="text"
                inputMode="numeric"
                className="count-input"
                value={values.count}
                onChange={(e) => set({ count: e.target.value })}
              />
              <button
                type="button"
                className="btn"
                aria-label="One more"
                disabled={!(count >= 1 && count < MAX_HOW_MANY)}
                onClick={() => set({ count: String(count + 1) })}
              >
                +
              </button>
            </span>
          )}
        </Field>
      )}
      {names.length > 0 && (
        <p className="add-box-names" data-testid="add-box-names">
          {names.map((n, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <Name text={n} />
            </span>
          ))}
        </p>
      )}
      {refusal && (
        <span className="edit-error" role="alert" data-testid="add-box-refusal">
          {refusal}
        </span>
      )}
      <EditError message={action.error === refusal ? '' : action.error} />
      <div className="form-actions">
        <button className="btn primary" disabled={!canAdd}>
          {count > 1 && many ? `Add ${count}` : 'Add'}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <span className="hint">Enter adds · Esc cancels</span>
      </div>
    </form>
  )
  return createPortal(box, document.body)
}
