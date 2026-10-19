import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  Crosshair,
  Info,
  Network,
  Pencil,
  Server,
  Trash2,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import { OPENER } from '../planning/useInlineDialog'
import type { MenuCommand, RowCommandId } from './model'

const COMMAND_ICON: Record<RowCommandId, LucideIcon> = {
  open: Info,
  focus: Crosshair,
  phys: Server,
  ports: Network,
  editport: Pencil,
  delete: Trash2,
  disconnect: Unlink,
}

/** The icon of a one-row command (the bar and the menu share them). */
export function CommandIcon({ id }: { id: RowCommandId }) {
  const Icon = COMMAND_ICON[id]
  return <Icon size={16} aria-hidden="true" />
}

/**
 * The ⋯ menu of one row: below its button (above when it would not fit), the
 * first item focused, arrows (and Home/End) move, Escape or a click outside
 * closes it, and focus returns to the button that opened it.
 */
export default function RowMenu({
  items,
  anchor,
  openerKey,
  onPick,
  onClose,
}: {
  items: readonly MenuCommand[]
  anchor: DOMRect
  openerKey: string
  onPick: (id: RowCommandId) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number }>()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let top = anchor.bottom + 4
    if (top + el.offsetHeight > window.innerHeight - 8)
      top = anchor.top - el.offsetHeight - 4
    setAt({
      top: Math.max(8, top),
      left: Math.max(8, anchor.right - el.offsetWidth),
    })
  }, [anchor])
  // Once placed (it is hidden until then, and a hidden item cannot take focus).
  const placed = at !== undefined
  useEffect(() => {
    if (placed)
      ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [placed])
  useEffect(() => {
    const el = ref.current
    return () => {
      // After the commit that removed the menu, the button is in the document.
      queueMicrotask(() => {
        if (el?.isConnected) return
        document
          .querySelector<HTMLElement>(`[${OPENER}="${CSS.escape(openerKey)}"]`)
          ?.focus()
      })
    }
  }, [openerKey])
  // A click outside closes it (a click on a ⋯ button is that button's own toggle).
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Element
      if (!ref.current?.contains(target) && !target.closest('.inv-more-btn'))
        onClose()
    }
    document.addEventListener('pointerdown', away)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'Tab') {
      onClose()
      return
    }
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ]
    const at = buttons.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'ArrowDown'
        ? (at + 1) % buttons.length
        : event.key === 'ArrowUp'
          ? (at - 1 + buttons.length) % buttons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : -1
    if (next < 0) return
    event.preventDefault()
    buttons[next]?.focus()
  }

  return (
    <div
      ref={ref}
      className="inv-menu-pop"
      role="menu"
      aria-label="Row actions"
      style={at ?? { top: 0, left: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <div key={item.id} role="none">
          {item.separatorBefore && <hr />}
          <button
            role="menuitem"
            tabIndex={-1}
            className={item.danger ? 'danger' : undefined}
            onClick={() => onPick(item.id)}
          >
            <CommandIcon id={item.id} />
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}
