import { useState } from 'react'
import Name from '../../shared/ui/Name'
import { colorOf } from '../map/networkColors'
import { useInlineDialog } from '../planning/useInlineDialog'
import { chosenValues } from './model'

export interface ValueOption {
  value: string
  text: string
}

/** The popover of one pill: Operator ==, the values to keep, Apply and Cancel. */
export default function ValuePicker({
  label,
  options,
  current,
  colors,
  isNetwork,
  openerKey,
  onApply,
  onCancel,
}: {
  label: string
  options: readonly ValueOption[]
  /** The pill's values now; none means all. */
  current: readonly string[]
  colors: ReadonlyMap<string, string>
  isNetwork: boolean
  openerKey: string
  /** An empty array clears the pill. */
  onApply: (values: string[]) => void
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<string[]>(() =>
    current.length ? [...current] : options.map((o) => o.value),
  )
  const [find, setFind] = useState('')
  const dialog = useInlineDialog<HTMLDivElement>(onCancel, openerKey)
  const needle = find.trim().toLowerCase()
  const shown = options.filter(
    (o) => !needle || o.text.toLowerCase().includes(needle),
  )
  const toggle = (value: string) =>
    setPicked((p) =>
      p.includes(value) ? p.filter((v) => v !== value) : [...p, value],
    )
  return (
    <div
      className="inv-pop"
      role="dialog"
      aria-label={`Filter ${label}`}
      {...dialog}
    >
      <b>{label}</b>
      <div className="inv-op">
        <span>Operator</span>
        <span className="mono">==</span>
      </div>
      {options.length > 10 && (
        <input
          type="search"
          className="inv-find"
          placeholder="Find a value"
          aria-label="Find a value"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
      )}
      <span className="inv-pop-label">Value</span>
      <div className="inv-checks">
        <label>
          <input
            type="checkbox"
            checked={picked.length === options.length}
            onChange={() =>
              setPicked(
                picked.length === options.length
                  ? []
                  : options.map((o) => o.value),
              )
            }
          />
          Select all
        </label>
        {shown.map((o) => (
          <label key={o.value}>
            <input
              type="checkbox"
              checked={picked.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            {isNetwork && o.value && (
              <i
                className="dot"
                style={{ background: colorOf(colors, o.value) }}
                aria-hidden="true"
              />
            )}
            <Name text={o.text} />
          </label>
        ))}
      </div>
      <div className="inv-pop-actions">
        <button
          className="btn primary"
          onClick={() => onApply(chosenValues(picked, options.length))}
        >
          Apply
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
