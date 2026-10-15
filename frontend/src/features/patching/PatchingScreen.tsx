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
  onClose,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  colors: ReadonlyMap<string, string>
  edit: PlanEdit | undefined
  request: PatchRequest
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
  const farEquipment = far ? index.equipment.get(far.equipmentId) : undefined

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

  const recentMade = made.slice(-6)
  return createPortal(
    <div
      className="patching-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
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
        <header className="patching-head">
          <div>
            <h2>Patching</h2>
            <p>
              Click a free jack on the left, then one on the right. Each cable
              is saved to the plan at once.
            </p>
          </div>
          <button
            type="button"
            className="patching-close"
            aria-label="Close patching"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="patching-toolbar">
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
          {mode === 'range' ? (
            <>
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
              <span className="quiet">
                {countOk
                  ? farStart
                    ? 'The pairs are numbered on both faceplates.'
                    : 'Shift-click the last jack on the left to set the count, then click the far start.'
                  : `Count must be between 1 and ${MAX_RANGE}.`}
              </span>
            </>
          ) : (
            <span className="quiet">
              After each cable both sides move to their next free jack.{' '}
              <kbd>Enter</kbd> makes the next one.
            </span>
          )}
        </div>

        <div className="patching-cols">
          <section className="patching-col" aria-label="From">
            <div className="patching-col-head">
              <span className="eyebrow">From</span>
              <strong>
                <Name text={nearEquipment.name} />
              </strong>
              <span className="quiet">
                <PlacePath
                  parts={index.locationParts.get(nearEquipment.id) ?? []}
                />
              </span>
            </div>
            <FaceView
              equipment={nearEquipment}
              face={nearFace}
              side={nearSide}
              meta={
                nearSel ? (
                  <>Selected: {named(nearSel)}</>
                ) : (
                  'No free jack selected'
                )
              }
              networks={snapshot.networks}
              colors={colors}
              tooltip={(cell, ordinal) =>
                endpointTooltip(index, nearEquipment, cell, ordinal, nearSide)
              }
              onSelect={(id, event) => pickNear(id, !!event?.shiftKey)}
              onSide={(s) => {
                setNearSide(s)
                setNearSel(nextFree(snapshot, nearEquipmentId, s, taken))
                setFarStart(undefined)
              }}
              decorate={nearMark}
              legend={false}
            />
          </section>
          <section className="patching-col" aria-label="To">
            <div className="patching-col-head">
              <span className="eyebrow">To</span>
              <strong>
                {farEquipment ? (
                  <Name text={farEquipment.name} />
                ) : (
                  'Choose the far end'
                )}
              </strong>
              {farEquipment && (
                <span className="quiet">
                  <PlacePath
                    parts={index.locationParts.get(farEquipment.id) ?? []}
                  />
                </span>
              )}
            </div>
            <LocationPicker
              tree={tree}
              equipmentId={far?.equipmentId}
              exclude={nearEquipmentId}
              freeOf={(id) => freeCount(index, id)}
              onChange={(id) => chooseFar(id)}
            />
            {farEquipment && farFace ? (
              <FaceView
                equipment={farEquipment}
                face={farFace}
                side={far?.side}
                meta={`${freeCount(index, farEquipment.id)} free`}
                networks={snapshot.networks}
                colors={colors}
                tooltip={(cell, ordinal) =>
                  endpointTooltip(index, farEquipment, cell, ordinal, far?.side)
                }
                onSelect={(id) => pickFar(id)}
                onSide={(s) => chooseFar(farEquipment.id, s)}
                decorate={farMark}
                legend={false}
              />
            ) : (
              <p className="quiet">Choose the far equipment above.</p>
            )}
          </section>
        </div>

        <footer className="patching-foot">
          <div className="patching-legend" aria-hidden="true">
            <span>
              <i className="sw-free" /> free
            </span>
            <span>
              <i className="sw-next" /> next
            </span>
            <span>
              <i className="sw-preview" /> pair
            </span>
            <span>
              <i className="sw-blocked" /> can’t be made
            </span>
            <span>
              <i className="sw-made" /> made here
            </span>
          </div>
          {mode === 'one' ? (
            <div className="patching-next" data-testid="patching-next">
              {nearSel && farNext ? (
                <>
                  <span>Next:</span>
                  <b>{named(nearSel)}</b>
                  <span aria-hidden="true">→</span>
                  <b>{named(farNext)}</b>
                  <button
                    type="button"
                    className="btn primary lg"
                    disabled={action.pending || !live}
                    onClick={() => void connectOne(nearSel, farNext)}
                  >
                    Connect
                  </button>
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
            <>
              {pairs.length > 0 && (
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
              )}
              <div className="patching-row">
                {blocked > 0 && (
                  <label className="patching-skip">
                    <input
                      type="checkbox"
                      checked={skip}
                      onChange={(e) => setSkip(e.target.checked)}
                    />
                    Skip the {blocked} pair{blocked === 1 ? '' : 's'} that can’t
                    be made
                  </label>
                )}
                <button
                  type="button"
                  className="btn primary lg"
                  disabled={
                    !live ||
                    action.pending ||
                    makeable === 0 ||
                    (blocked > 0 && !skip)
                  }
                  onClick={() => void connectRange()}
                >
                  {pairs.length === 0 ? 'Connect' : `Connect ${makeable}`}
                </button>
                <span className="quiet">
                  {pairs.length ? (
                    <>
                      From {named(nearSel ?? '')}, {pairs.length} pair
                      {pairs.length === 1 ? '' : 's'}.
                    </>
                  ) : (
                    'Click the far start on the right to see the pairs.'
                  )}
                </span>
              </div>
            </>
          )}
          <EditError message={action.error} />
          <div className="patching-made" data-testid="patching-made">
            <span className="eyebrow">Made here ({made.length})</span>
            <div className="patching-made-list">
              {made.length === 0 ? (
                <span className="quiet">
                  Nothing yet. Each cable is also listed in Changes, with its
                  own Undo.
                </span>
              ) : (
                <>
                  {made.length > recentMade.length && (
                    <span className="more">
                      +{made.length - recentMade.length} earlier
                    </span>
                  )}
                  {recentMade.map((m) => (
                    <span key={m.linkId || `${m.near}-${m.far}`}>
                      {named(m.near)} → {named(m.far)}
                    </span>
                  ))}
                </>
              )}
            </div>
            <button
              type="button"
              className="btn lg"
              disabled={!made.at(-1)?.linkId || action.pending || !live}
              onClick={() => void undoLast()}
            >
              Undo last
            </button>
            <button type="button" className="btn lg" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
