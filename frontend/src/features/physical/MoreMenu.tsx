import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  /** Shown greyed out with `hint` beside it. */
  disabled?: boolean
  hint?: string
}

/**
 * The "⋯" button and its menu. Arrow keys move between the items, Escape and
 * an outside click close it, and focus goes back to the button. `openerKey` is
 * the `data-opener` mark an inline confirm opened from here returns focus to.
 */
export default function MoreMenu({
  items,
  openerKey,
}: {
  items: readonly MenuItem[]
  openerKey: string
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const entries = () => [
    ...(wrap.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled)',
    ) ?? []),
  ]

  useEffect(() => {
    if (!open) return
    entries()[0]?.focus()
    const outside = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    const list = entries()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      event.preventDefault()
      list[(to + list.length) % list.length]?.focus()
    }
    if (event.key === 'ArrowDown') move(at + 1)
    else if (event.key === 'ArrowUp') move(at < 0 ? -1 : at - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(-1)
    else if (event.key === 'Tab') setOpen(false)
  }

  if (items.length === 0) return null
  return (
    <div className="more-menu" ref={wrap} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="btn more-button"
        data-opener={openerKey}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={15} aria-hidden />
      </button>
      {open && (
        <div className="more-list" role="menu" aria-label="More actions">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={item.danger ? 'danger' : undefined}
              disabled={item.disabled}
              title={item.disabled ? item.hint : undefined}
              onClick={() => {
                close()
                item.onSelect()
              }}
            >
              {item.label}
              {item.disabled && item.hint && (
                <small className="more-hint">{item.hint}</small>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
