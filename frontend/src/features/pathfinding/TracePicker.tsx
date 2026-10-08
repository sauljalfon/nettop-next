import { useId, useMemo, useState } from 'react'
import { useDebounced } from '../../shared/lazy'
import { matchPicker, type PickerItem } from './picker'
import './picker.css'

interface Props {
  /** The accessible name: "Start" or "Destination". */
  label: string
  items: readonly PickerItem[]
  /** The chosen item's value. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * A searchable combobox over a per-snapshot list. Words match in any order
 * ("hdf-01 3c/5"); at most 50 matches are listed, with a note when there are
 * more. Arrow keys move, Enter chooses, Esc closes and keeps the old choice.
 */
export default function TracePicker({
  label,
  items,
  value,
  onChange,
  disabled,
}: Props) {
  const listId = useId()
  // null while the field just shows the chosen item; text while the user is searching.
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const chosen = useMemo(
    () => items.find((i) => i.value === value),
    [items, value],
  )
  // The list follows the typing about 150 ms behind; a key pressed in between acts on the current text.
  const settled = useDebounced(query)
  const { matches: listed, more } = useMemo(
    () => matchPicker(items, settled ?? ''),
    [items, settled],
  )
  // While the list is catching up with the typing it shows nothing, so a click never lands on a stale row.
  const pending = settled !== query
  const matches = pending ? [] : listed
  const current = () =>
    settled === query ? listed : matchPicker(items, query ?? '').matches
  const close = () => {
    setOpen(false)
    setQuery(null)
  }
  const choose = (item: PickerItem) => {
    onChange(item.value)
    close()
  }
  return (
    <label className="trace-picker">
      <span>{label}</span>
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${listId}-${active}` : undefined
        }
        disabled={disabled}
        value={query ?? chosen?.label ?? ''}
        placeholder="Type to search, e.g. edge-17 3"
        onFocus={(event) => {
          setOpen(true)
          event.currentTarget.select()
        }}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            const n = current().length
            setActive(
              n === 0
                ? 0
                : (active + (event.key === 'ArrowDown' ? 1 : -1) + n) % n,
            )
          } else if (event.key === 'Enter' && open && current()[active]) {
            event.preventDefault()
            choose(current()[active])
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            close()
          }
        }}
      />
      {open && (
        <div className="picker-popup">
          <ul id={listId} role="listbox" aria-label={`${label} matches`}>
            {matches.map((item, i) => (
              <li
                key={item.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                // mousedown, so the choice lands before the input loses focus
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(item)
                }}
              >
                {item.label}
              </li>
            ))}
          </ul>
          {!pending && matches.length === 0 && (
            <p className="picker-note">No match.</p>
          )}
          {!pending && more > 0 && (
            <p className="picker-note">
              {more} more match{more === 1 ? '' : 'es'}: refine the search.
            </p>
          )}
        </div>
      )}
    </label>
  )
}
