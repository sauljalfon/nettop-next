import { Download } from 'lucide-react'
import { useInlineDialog } from '../planning/useInlineDialog'
import { COLUMNS, type Column, type InventoryList } from './columns'
import { toCsv } from './csv'
import type { InventoryRow } from './rows'

export const LIST_TITLES: Record<InventoryList, string> = {
  equipment: 'Equipment',
  ports: 'Ports and positions',
  cables: 'Cables',
  racks: 'Racks',
  problems: 'Problems',
  work: 'Work list',
}

/** A side pane over a scrim: Escape closes it and focus returns to its opener. */
export function Pane({
  title,
  openerKey,
  onClose,
  footer,
  mark,
  children,
}: {
  title: string
  openerKey: string
  onClose: () => void
  footer: React.ReactNode
  /** The pane's name and counts, as data-inventory-pane[-…] marks the specs read. */
  mark?: { pane: string } & Record<string, string | number>
  children: React.ReactNode
}) {
  const dialog = useInlineDialog<HTMLElement>(onClose, openerKey)
  return (
    <>
      <div className="inv-scrim" onClick={onClose} />
      <aside
        className="inv-pane drawer"
        role="dialog"
        aria-label={title}
        {...dialog}
        {...Object.fromEntries(
          Object.entries(mark ?? {}).map(([k, v]) => [
            `data-inventory-${k === 'pane' ? 'pane' : `pane-${k}`}`,
            v,
          ]),
        )}
      >
        <div className="inv-pane-h">
          <h2>{title}</h2>
          <button className="inv-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="inv-pane-b">{children}</div>
        <div className="inv-pane-f">{footer}</div>
      </aside>
    </>
  )
}

export function CsvPane({
  rows,
  columns,
  fileName,
  onDownload,
  onClose,
}: {
  /** Every filtered record, sorted. */
  rows: readonly InventoryRow[]
  columns: readonly Column[]
  fileName: string
  onDownload: () => void
  onClose: () => void
}) {
  return (
    <Pane
      title="Export to CSV"
      openerKey="csv"
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={onDownload}>
            <Download size={16} aria-hidden="true" />
            Download
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p>
        The file holds exactly the records and columns shown:{' '}
        <b>{rows.length.toLocaleString('en')} records</b>, {columns.length}{' '}
        columns, with the current filters, search and sort. A CSV is flat: it is
        never grouped.
      </p>
      <div>
        <span className="inv-dim">File name</span>
        <div className="mono">{fileName}</div>
      </div>
      <p className="inv-dim">
        The file starts with a UTF-8 mark, so Excel shows Hebrew names
        correctly.
      </p>
      <label>
        <span className="inv-dim">Preview (first 20 records)</span>
        <textarea readOnly value={toCsv(rows.slice(0, 20), columns)} />
      </label>
    </Pane>
  )
}

export function ColumnsPane({
  list,
  hidden,
  onToggle,
  onClose,
}: {
  list: InventoryList
  hidden: ReadonlySet<string>
  onToggle: (key: string) => void
  onClose: () => void
}) {
  return (
    <Pane
      title="Edit columns"
      openerKey="columns"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <p>
        Choose the columns of <b>{LIST_TITLES[list]}</b>. The first column is
        always shown. The CSV export follows this choice.
      </p>
      <div className="inv-checks">
        {COLUMNS[list].map((c) => (
          <label key={c.key}>
            <input
              type="checkbox"
              checked={!!c.first || !hidden.has(c.key)}
              disabled={!!c.first}
              onChange={() => onToggle(c.key)}
            />
            {c.label}
          </label>
        ))}
      </div>
    </Pane>
  )
}
