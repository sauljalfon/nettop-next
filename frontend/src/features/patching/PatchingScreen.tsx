import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { hasSide } from '../../shared/ports'
import type { Plan, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { endpointTooltip, faceFor } from '../physical/equipmentModel'
import { PATCHING_COLUMNS } from '../physical/faces'
import FaceView, { type JackMark } from '../physical/FaceView'
import '../physical/physical.css'
import { EditError } from '../planning/ConfirmShell'
import {
  useLastEdit,
  type EditCommand,
  type PlanEdit,
} from '../planning/editing'
import { MAX_RANGE, rangeCommands, rangePairs, runOf } from '../planning/range'
import { useAsyncAction } from '../planning/useAsyncAction'
import LocationPicker from './LocationPicker'
import {
  farDefault,
  farSide,
  freeCount,
  locationTree,
  nextFree,
  pairMarks,
  type FarTarget,
  type Side,
} from './patching'
import { patchingSession, type PatchRequest } from './patchingSession'
import './patching.css'
import Name from '../../shared/ui/Name'
import Pieces from '../../shared/ui/Pieces'
import type { TextPiece } from '../../shared/textPieces'
import PlacePath from '../../shared/ui/PlacePath'

/** A cable made in this screen: Undo last removes it by its plan change key. */
interface Made {
  linkId: string
  near: string
  far: string
}

const linkBetween = (plan: Plan, a: string, b: string) =>
  plan.links.find(
    (l) =>
      l.kind === 'cable' &&
      ((l.a === a && l.b === b) || (l.a === b && l.b === a)),
  )?.id ?? ''

/**
 * The patching screen: the near equipment's faceplate on the left, the far
 * one on the right (chosen as Site › Node › Rack › Equipment). One at a time,
 * a click on a free far jack makes the cable at once and both sides move on to
 * their next free jack (Enter makes the next one). In Range, a count (or Shift
 * and a click on the last near jack) and a click on the far start number the
 * pairs on both faceplates; Connect N sends them as one batch. Every edit goes
 * through the one PlanEdit; the server's refusal shows here in its words.
 */
export default function PatchingScreen({
  snapshot,
  index,
  colors,
  edit,
  request,
  planName,
  onClose,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  colors: ReadonlyMap<string, string>
  edit: PlanEdit | undefined
  request: PatchRequest
  /** The draft's name, shown in the top bar. */
  planName?: string
  onClose: () => void
}) {
  const live = useLastEdit(edit)
  const action = useAsyncAction()
  const panel = useRef<HTMLDivElement>(null)
  const nearEquipmentId = index.owner.get(request.nearEndpointId) ?? ''
  const nearEquipment = index.equipment.get(nearEquipmentId)
  const tree = useMemo(() => locationTree(snapshot), [snapshot])
  const sides = useSyncExternalStore(
    patchingSession.subscribe,
    patchingSession.sides,
  )
  const [made, setMade] = useState<Made[]>([])
  const madeIds = useMemo(
    () => new Set(made.flatMap((m) => [m.near, m.far])),
    [made],
  )
  const taken = useCallback(
    (id: string) => index.cabled.has(id) || madeIds.has(id),
    [index, madeIds],
  )
  const [mode, setMode] = useState(request.mode)
  const [countText, setCountText] = useState(String(request.count))
  const count = /^\d+$/.test(countText.trim()) ? Number(countText.trim()) : 0
  const countOk = count >= 1 && count <= MAX_RANGE
  const firstNear = index.lookup.endpoints.get(request.nearEndpointId)
  const [nearSide, setNearSide] = useState<Side | undefined>(
    firstNear && hasSide(firstNear) ? firstNear.side : undefined,
  )
  const [nearSel, setNearSel] = useState<string | undefined>(() =>
    taken(request.nearEndpointId)
      ? nextFree(snapshot, nearEquipmentId, nearSide, taken)
      : request.nearEndpointId,
  )
  const [far, setFar] = useState<FarTarget | undefined>(() => {
    const target =
      request.far ??
      farDefault(
        snapshot,
        index,
        request.nearEndpointId,
        patchingSession.recent(),
        patchingSession.sides(),
      )
    if (!target) return undefined
    return {
      equipmentId: target.equipmentId,
      side:
        target.side ??
        farSide(index, request.nearEndpointId, target.equipmentId, sides),
    }
  })
  const [farNext, setFarNext] = useState<string | undefined>(() =>
    far ? nextFree(snapshot, far.equipmentId, far.side, taken) : undefined,
  )
  const [farStart, setFarStart] = useState<string>()
  const [skip, setSkip] = useState(false)
  const [strip, setStrip] = useState(true)
  const farEquipment = far ? index.equipment.get(far.equipmentId) : undefined
  // The far end is one button in the To head; the picker is a popover under it,
  // open from the start only when there is no far end yet.
  const [pickerOpen, setPickerOpen] = useState(!far)
  const farButton = useRef<HTMLButtonElement>(null)
  const farPopover = useRef<HTMLDivElement>(null)
  const closePicker = () => {
    setPickerOpen(false)
    queueMicrotask(() => farButton.current?.focus())
  }
  useEffect(() => {
    if (!pickerOpen) return
    const away = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        farPopover.current?.contains(target) ||
        farButton.current?.contains(target)
      )
        return
      setPickerOpen(false)
      queueMicrotask(() => {
        const a = document.activeElement
        if (!a || a === document.body) farButton.current?.focus()
      })
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [pickerOpen])

  const chooseFar = (equipmentId: string, side?: Side) => {
    const next: FarTarget = {
      equipmentId,
      side:
        index.equipment.get(equipmentId)?.kind === 'switch'
          ? undefined
          : (side ??
            farSide(
              index,
              nearSel ?? request.nearEndpointId,
              equipmentId,
              sides,
            )),
    }
    setFar(next)
    setFarStart(undefined)
    setSkip(false)
    setFarNext(nextFree(snapshot, next.equipmentId, next.side, taken))
    action.clear()
  }

  const pairs = useMemo(
    () =>
      mode === 'range' && nearSel && farStart && countOk
        ? rangePairs(snapshot, index, nearSel, farStart, count)
        : [],
    [mode, nearSel, farStart, countOk, snapshot, index, count],
  )
  const marks = useMemo(() => pairMarks(pairs), [pairs])
  const blocked = pairs.filter((p) => p.problem).length
  const makeable = pairs.length - blocked

  const remember = () => far && patchingSession.remember(far)

  const connectOne = async (a: string, b: string) => {
    if (!live || !far || action.pending) return
    const saved = await action.run(() =>
      live({ type: 'add_cable', cable: { a, b } }),
    )
    if (!saved) return
    setMade((m) => [
      ...m,
      { linkId: linkBetween(saved, a, b), near: a, far: b },
    ])
    remember()
    // The refreshed topology may not be here yet: count these two as taken.
    const after = (id: string) => taken(id) || id === a || id === b
    setNearSel(nextFree(snapshot, nearEquipmentId, nearSide, after, a))
    setFarNext(nextFree(snapshot, far.equipmentId, far.side, after, b))
    // The clicked jack is now disabled: keep focus in the screen so Enter makes the next one.
    panel.current?.focus()
  }

  const connectRange = async () => {
    if (!live || action.pending) return
    const ok = pairs.filter((p) => !p.problem && p.near && p.far)
    const saved = await action.run(() =>
      live({ type: 'batch', batch: { commands: rangeCommands(pairs) } }),
    )
    if (!saved) return
    const entries = ok.map((p) => ({
      linkId: linkBetween(saved, p.near!.id, p.far!.id),
      near: p.near!.id,
      far: p.far!.id,
    }))
    setMade((m) => [...m, ...entries])
    remember()
    const used = new Set(entries.flatMap((e) => [e.near, e.far]))
    const after = (id: string) => taken(id) || used.has(id)
    const last = entries.at(-1)
    if (last)
      setNearSel(
        nextFree(snapshot, nearEquipmentId, nearSide, after, last.near),
      )
    setFarStart(undefined)
    setSkip(false)
  }

  const undoLast = async () => {
    const last = made.at(-1)
    if (!live || !last?.linkId || action.pending) return
    const command = {
      type: 'remove_change',
      change: { key: `add_cable:${last.linkId}` },
    } as EditCommand
    if (!(await action.run(() => live(command)))) return
    setMade((m) => m.slice(0, -1))
    const nearEndpoint = index.lookup.endpoints.get(last.near)
    if (nearEndpoint && hasSide(nearEndpoint)) setNearSide(nearEndpoint.side)
    setNearSel(last.near)
    if (index.owner.get(last.far) === far?.equipmentId) setFarNext(last.far)
  }

  // Focus: into the screen when it opens, back to the button that opened it.
  useEffect(() => {
    const el = panel.current
    el?.focus()
    const back = request.returnTo
    return () => {
      if (!back) return
      queueMicrotask(() => {
        // StrictMode's rehearsal unmount leaves the screen in place: nothing closed.
        if (el?.isConnected) return
        document.querySelector<HTMLElement>(back)?.focus()
      })
    }
  }, [request.returnTo])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    const tag = (event.target as HTMLElement).tagName
    if (
      event.key === 'Enter' &&
      mode === 'one' &&
      nearSel &&
      farNext &&
      !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(tag)
    ) {
      event.preventDefault()
      void connectOne(nearSel, farNext)
    }
  }

  if (!nearEquipment) return null
  /** "<equipment> · <port>", with the equipment name as its own piece for <bdi>. */
  const namePieces = (id: string): TextPiece[] => {
    const p = index.lookup.endpoints.get(id)
    return p
      ? [
          { name: index.equipment.get(p.equipmentId)?.name ?? '' },
          { text: ` · ${p.label}` },
        ]
      : [{ text: id }]
  }
  const named = (id: string) => <Pieces pieces={namePieces(id)} />
  const nearFace = faceFor(index, nearEquipment, nearSide, {
    selectedEndpointId: nearSel,
  })
  const farFace = farEquipment
    ? faceFor(index, farEquipment, far?.side, {})
    : undefined

  const nearMark = (id: string): JackMark | undefined => {
    const pair = marks.near.get(id)
    if (pair)
      return {
        tone: pair.problem ? 'blocked' : 'preview',
        badge: pair.n,
        note: pair.problem ?? `pair ${pair.n}`,
      }
    if (madeIds.has(id))
      return { tone: 'made', disabled: true, note: 'made here' }
    if (taken(id)) return { disabled: true }
    return undefined
  }
  const farMark = (id: string): JackMark | undefined => {
    const pair = marks.far.get(id)
    if (pair)
      return {
        tone: pair.problem ? 'blocked' : 'preview',
        badge: pair.n,
        note: pair.problem ?? `pair ${pair.n}`,
        disabled: taken(id),
      }
    if (madeIds.has(id))
      return { tone: 'made', disabled: true, note: 'made here' }
    if (taken(id)) return { disabled: true }
    if (mode === 'one' && id === farNext) return { tone: 'next', note: 'next' }
    return undefined
  }

  const pickNear = (id: string, shift: boolean) => {
    if (taken(id)) return
    action.clear()
    if (mode === 'range' && shift && nearSel) {
      // Shift-click: the count runs from the selected jack to this one.
      const run = runOf(snapshot, nearEquipmentId, nearSide)
      const from = run.findIndex((e) => e.id === nearSel)
      const to = run.findIndex((e) => e.id === id)
      if (from >= 0 && to >= from) {
        setCountText(String(to - from + 1))
        return
      }
    }
    setNearSel(id)
  }
  const pickFar = (id: string) => {
    if (taken(id)) return
    action.clear()
    if (mode === 'one') {
      if (!nearSel) {
        action.fail('Choose a free jack on the left first.')
        return
      }
      setFarNext(id)
      void connectOne(nearSel, id)
    } else {
      setFarStart(id)
      setSkip(false)
    }
  }

  const sideSwitch = (
    face: { kind: string },
    side: Side | undefined,
    onSide: (s: Side) => void,
  ) =>
    face.kind !== 'switch' && (
      <div className="seg side-switch" role="group" aria-label="Side">
        {(['front', 'rear'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => onSide(s)}
          >
            {s === 'front' ? 'Front' : 'Rear'}
          </button>
        ))}
      </div>
    )

  const connectDisabled =
    mode === 'one'
      ? action.pending || !live || !nearSel || !farNext
      : !live || action.pending || makeable === 0 || (blocked > 0 && !skip)
  const connectLabel =
    mode === 'one' || pairs.length === 0 ? 'Connect' : `Connect ${makeable}`
  return createPortal(
    <div
      ref={panel}
      className="patching"
      role="dialog"
      aria-modal="true"
      aria-label="Patching"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-testid="patching"
    >
      <header className="patching-bar">
        <h2>Patching</h2>
        <span className="patching-sub">
          {planName && (
            <>
              in plan <Name text={planName} />
              {' · '}
            </>
          )}
          each cable is saved to the plan at once
        </span>
        <button
          type="button"
          className="patching-close"
          aria-label="Close patching"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="patching-main" data-strip={strip ? 'open' : 'closed'}>
        <section className="patching-pane" aria-label="From">
          <div className="patching-col-head">
            <span className="eyebrow">From</span>
            <strong>
              <Name text={nearEquipment.name} />
            </strong>
            <span className="quiet where">
              <PlacePath
                parts={index.locationParts.get(nearEquipment.id) ?? []}
              />
            </span>
            {sideSwitch(nearFace, nearSide, (s) => {
              setNearSide(s)
              setNearSel(nextFree(snapshot, nearEquipmentId, s, taken))
              setFarStart(undefined)
            })}
          </div>
          <div className="patching-body">
            <FaceView
              equipment={nearEquipment}
              face={nearFace}
              side={nearSide}
              meta=""
              networks={snapshot.networks}
              colors={colors}
              tooltip={(cell, ordinal) =>
                endpointTooltip(index, nearEquipment, cell, ordinal, nearSide)
              }
              onSelect={(id, event) => pickNear(id, !!event?.shiftKey)}
              onSide={() => undefined}
              decorate={nearMark}
              legend={false}
              bare
              columns={PATCHING_COLUMNS}
            />
          </div>
        </section>
        <section
          className="patching-pane"
          aria-label="To"
          onKeyDown={(event) => {
            // Escape closes the open picker first; the page stays open.
            if (event.key === 'Escape' && pickerOpen) {
              event.preventDefault()
              closePicker()
            }
          }}
        >
          <div className="patching-col-head">
            <span className="eyebrow">To</span>
            <button
              ref={farButton}
              type="button"
              className="patching-far"
              aria-label="Change far end"
              aria-expanded={pickerOpen}
              onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}
            >
              <strong>
                {farEquipment ? (
                  <Name text={farEquipment.name} />
                ) : (
                  'Choose the far end'
                )}
              </strong>
              {farEquipment && (
                <span className="quiet where">
                  <PlacePath
                    parts={index.locationParts.get(farEquipment.id) ?? []}
                  />
                </span>
              )}
              {farEquipment && (
                <span className="quiet free">
                  {freeCount(index, farEquipment.id)} free
                </span>
              )}
            </button>
            {farFace &&
              farEquipment &&
              sideSwitch(farFace, far?.side, (s) =>
                chooseFar(farEquipment.id, s),
              )}
          </div>
          {pickerOpen && (
            <div className="patching-far-popover" ref={farPopover}>
              <LocationPicker
                tree={tree}
                equipmentId={far?.equipmentId}
                exclude={nearEquipmentId}
                freeOf={(id) => freeCount(index, id)}
                onChange={(id) => chooseFar(id)}
                onPicked={closePicker}
              />
            </div>
          )}
          <div className="patching-body">
            {farEquipment && farFace ? (
              <FaceView
                equipment={farEquipment}
                face={farFace}
                side={far?.side}
                meta=""
                networks={snapshot.networks}
                colors={colors}
                tooltip={(cell, ordinal) =>
                  endpointTooltip(index, farEquipment, cell, ordinal, far?.side)
                }
                onSelect={(id) => pickFar(id)}
                onSide={() => undefined}
                decorate={farMark}
                legend={false}
                bare
                columns={PATCHING_COLUMNS}
              />
            ) : (
              <p className="quiet">Choose the far equipment above.</p>
            )}
          </div>
        </section>

        <aside className="patching-strip" aria-label="Pairs and made here">
          <h3>
            {strip ? 'Pairs and made here' : 'Pairs'}
            <button
              type="button"
              className="patching-toggle"
              aria-label={strip ? 'Collapse' : 'Expand'}
              aria-expanded={strip}
              onClick={() => setStrip(!strip)}
            >
              {strip ? '›' : '‹'}
            </button>
          </h3>
          {strip && (
            <>
              <h4>Pairs{pairs.length > 0 && ` (${pairs.length})`}</h4>
              {pairs.length > 0 ? (
                <ol className="patching-pairs" data-testid="range-pairs">
                  {pairs.map((p) => (
                    <li
                      key={p.n}
                      className={p.problem ? 'blocked' : 'ok'}
                      data-blocked={!!p.problem}
                    >
                      <span aria-hidden="true">{p.problem ? '⚠' : '✓'}</span>
                      <span>
                        {p.n}. {p.near?.label ?? '—'} →{' '}
                        {p.far ? p.farName : '—'}
                      </span>
                      {p.problem && <em>{p.problem}</em>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty">
                  {mode === 'range'
                    ? 'Click the far start on the right to see the pairs.'
                    : 'One at a time: each click on the right makes a cable.'}
                </p>
              )}
              <div className="patching-made" data-testid="patching-made">
                <h4>Made here ({made.length})</h4>
                {made.length === 0 ? (
                  <p className="empty">
                    Nothing yet. Each cable is also listed in Changes, with its
                    own Undo.
                  </p>
                ) : (
                  <ul className="patching-made-list">
                    {made
                      .slice()
                      .reverse()
                      .map((m) => (
                        <li key={m.linkId || `${m.near}-${m.far}`}>
                          <span aria-hidden="true">✓</span>
                          <span>
                            {named(m.near)} → {named(m.far)}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <footer className="patching-actions">
        <div className="seg patching-mode" role="group" aria-label="Mode">
          {(
            [
              ['one', 'One at a time'],
              ['range', 'Range'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m)
                setFarStart(undefined)
                setSkip(false)
                action.clear()
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'range' && (
          <label className="patching-count">
            Count
            <input
              type="text"
              inputMode="numeric"
              aria-label="Count"
              value={countText}
              onChange={(e) => {
                setCountText(e.target.value)
                action.clear()
              }}
            />
          </label>
        )}
        {mode === 'range' && blocked > 0 && (
          <label className="patching-skip">
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => setSkip(e.target.checked)}
            />
            Skip the {blocked} pair{blocked === 1 ? '' : 's'} that can’t be made
          </label>
        )}
        {action.error ? (
          <div className="patching-status">
            <EditError message={action.error} />
          </div>
        ) : mode === 'one' ? (
          <div
            className="patching-status"
            data-testid="patching-next"
            title="After each cable both sides move to their next free jack. Enter makes the next one."
          >
            {nearSel && farNext ? (
              <>
                <span>Next:</span>
                <b>{named(nearSel)}</b>
                <span aria-hidden="true">→</span>
                <b>{named(farNext)}</b>
              </>
            ) : !nearSel ? (
              <span>
                No free jack left on this side of{' '}
                <Name text={nearEquipment.name} />.
              </span>
            ) : (
              <span>
                No free jack left on{' '}
                {farEquipment ? farEquipment.name : 'the far end'}
                {far?.side ? ` · ${far.side}` : ''}: choose other equipment.
              </span>
            )}
          </div>
        ) : (
          <div className="patching-status">
            {!countOk ? (
              `Count must be between 1 and ${MAX_RANGE}.`
            ) : pairs.length ? (
              <>
                From {named(nearSel ?? '')}, {pairs.length} pair
                {pairs.length === 1 ? '' : 's'}.
              </>
            ) : farStart ? null : (
              'Shift-click the last jack on the left to set the count, then click the far start.'
            )}
          </div>
        )}
        <button
          type="button"
          className="btn"
          disabled={!made.at(-1)?.linkId || action.pending || !live}
          onClick={() => void undoLast()}
        >
          Undo last
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={connectDisabled}
          onClick={() =>
            mode === 'one'
              ? nearSel && farNext && void connectOne(nearSel, farNext)
              : void connectRange()
          }
        >
          {connectLabel}
        </button>
      </footer>
    </div>,
    document.body,
  )
}
