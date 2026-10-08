import { X } from 'lucide-react'
import type { CableRow } from './explorerModel'

/**
 * The real cables behind a line or a card's link: each with both ends and
 * their racks. A row's end opens that endpoint. A list, not a modal: it sits
 * over the canvas and closes with its button or Esc.
 */
export default function CableList({
  label,
  title,
  rows,
  onOpen,
  onClose,
}: {
  label: string
  title: string
  rows: CableRow[]
  onOpen: (endpointId: string) => void
  onClose: () => void
}) {
  return (
    <section
      className="cable-list nodrag nopan"
      aria-label={label}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <header>
        <strong>{title}</strong>
        <button
          className="icon-button"
          aria-label="Close cable list"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </header>
      <ul>
        {rows.map((row) => (
          <li
            key={row.linkId}
            data-testid="cable-row"
            data-link-id={row.linkId}
          >
            <code>{row.linkId}</code>
            {[row.a, row.b].map((end, i) => (
              <span className="cable-end" key={end.endpointId}>
                {i === 1 && <i aria-hidden>↔</i>}
                <button
                  className="link-button"
                  aria-label={`Open ${end.label}`}
                  onClick={() => onOpen(end.endpointId)}
                >
                  {end.label}
                </button>
                <small>{end.rack}</small>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
