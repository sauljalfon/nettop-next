import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { MAX_RANGE } from '../planning/range'
import type { FarTarget } from './patching'
import { patchingSession } from './patchingSession'
import './patching.css'

/** Where the jack's focus returns: the jack itself. */
export const jackSelector = (endpointId: string) =>
  `[data-endpoint-id="${CSS.escape(endpointId)}"]`

/**
 * The small popover at a free jack, in a plan: where the cable goes (the
 * session's recent far targets, one click each, or Choose far end…) and one
 * cable or a range. Either opens the patching screen; nothing is sent from here.
 * Escape or a click outside closes it.
 */
export default function ConnectPopover({
  index,
  endpointId,
  anchor,
  onClose,
}: {
  index: SnapshotIndex
  endpointId: string
  /** The jack's box on screen. */
  anchor: DOMRect
  onClose: () => void
}) {
  const recent = useSyncExternalStore(
    patchingSession.subscribe,
    patchingSession.recent,
  )
  const own = index.owner.get(endpointId)
  const endpoint = index.lookup.endpoints.get(endpointId)
  const targets = recent
    .filter((t) => t.equipmentId !== own && index.equipment.has(t.equipmentId))
    .slice(0, 3)
  const [range, setRange] = useState(false)
  const [countText, setCountText] = useState('6')
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ left: anchor.left, top: anchor.bottom + 10 })

  // Under the jack, kept inside the window (above it when there is no room below).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(
      16,
      Math.min(anchor.left - 12, window.innerWidth - width - 16),
    )
    const below = anchor.bottom + 10
    const top =
      below + height > window.innerHeight - 16
        ? Math.max(16, anchor.top - height - 10)
        : below
    setAt({ left, top })
  }, [anchor])

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.button.primary')?.focus()
    const outside = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [onClose])

  const close = () => {
    onClose()
    queueMicrotask(() =>
      document.querySelector<HTMLElement>(jackSelector(endpointId))?.focus(),
    )
  }
  const count = /^\d+$/.test(countText.trim()) ? Number(countText.trim()) : 6
  const open = (far?: FarTarget) => {
    patchingSession.open({
      nearEndpointId: endpointId,
      mode: range ? 'range' : 'one',
      count: Math.min(Math.max(count, 1), MAX_RANGE),
      far,
      returnTo: jackSelector(endpointId),
    })
    onClose()
  }
  const name = (t: FarTarget) =>
    `${index.equipment.get(t.equipmentId)?.name ?? t.equipmentId}${t.side ? ` · ${t.side === 'front' ? 'Front' : 'Rear'}` : ''}`

  return createPortal(
    <div
      ref={box}
      className="connect-popover"
      role="dialog"
      aria-label="Connect this jack"
      data-testid="connect-popover"
      style={{ left: at.left, top: at.top }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        close()
      }}
    >
      <h3>
        {index.equipment.get(own ?? '')?.name} · {endpoint?.label}
      </h3>
      <span className="quiet">Free. Where does the cable go?</span>
      <div className="modes" role="radiogroup" aria-label="How many">
        <label>
          <input
            type="radio"
            name="connect-how"
            checked={!range}
            onChange={() => setRange(false)}
          />
          One cable
        </label>
        <label>
          <input
            type="radio"
            name="connect-how"
            checked={range}
            onChange={() => setRange(true)}
          />
          Range of
        </label>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Range count"
          value={countText}
          onChange={(e) => {
            setCountText(e.target.value)
            setRange(true)
          }}
        />
      </div>
      {targets.length > 0 && (
        <>
          <span className="eyebrow">RECENT</span>
          <div className="chips">
            {targets.map((t) => (
              <button
                key={`${t.equipmentId}:${t.side ?? ''}`}
                type="button"
                className="chip"
                onClick={() => open(t)}
              >
                {name(t)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="row">
        <button
          type="button"
          className="button primary"
          onClick={() => open(undefined)}
        >
          Choose far end…
        </button>
        <button type="button" className="button" onClick={close}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
