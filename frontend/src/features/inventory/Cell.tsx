import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import { colorOf } from '../map/networkColors'
import type { Column } from './columns'
import { StatusIcon, TypeIcon, type TypeIconKind } from './icons'
import type { EndpointPieces, InventoryRow } from './rows'

const Empty = () => <span className="inv-dim">—</span>

/** An endpoint cell: the equipment name and the label apart (a position's label names its side). */
function Endpoint({ pieces }: { pieces: EndpointPieces }) {
  return (
    <span className="inv-endpoint">
      <Name text={pieces.equipmentName} />{' '}
      <span className="mono">{pieces.label}</span>
    </span>
  )
}

export interface CellProps {
  row: InventoryRow
  column: Column
  /** The type icon of the first column. */
  icon: TypeIconKind
  colors: ReadonlyMap<string, string>
  onOpen: (row: InventoryRow) => void
}

/** One cell of the table, by the kind of its column. */
export default function Cell({ row, column, icon, colors, onOpen }: CellProps) {
  const text = row.values[column.key] ?? ''
  if (column.first)
    return (
      <span className="inv-first">
        <TypeIcon kind={icon} />
        <button
          className={`inv-link${column.kind === 'mono' ? ' mono' : ''}`}
          onClick={() => onOpen(row)}
        >
          <Name text={text} />
        </button>
        {row.proposed && <Chip kind="proposed">Proposed</Chip>}
      </span>
    )
  if (column.kind === 'endpoint') {
    const pieces = row.pieces[column.key]
    return pieces ? <Endpoint pieces={pieces} /> : <Empty />
  }
  if (text === '') return <Empty />
  switch (column.kind) {
    case 'network':
      return (
        <span className="inv-net">
          <i
            className="dot"
            style={{ background: colorOf(colors, row.raw[column.key] ?? '') }}
            aria-hidden="true"
          />
          <Name text={text} />
        </span>
      )
    case 'status': {
      const word = row.raw[column.key] ?? ''
      return (
        <span className={`inv-status${word === 'faulty' ? ' bad' : ''}`}>
          <StatusIcon status={word} />
          {text}
        </span>
      )
    }
    case 'equipmentLink':
      return (
        <button className="inv-link" onClick={() => onOpen(row)}>
          <Name text={text} />
        </button>
      )
    case 'name':
      return <Name text={text} />
    case 'mono':
      return <span className="mono">{text}</span>
    default:
      return <>{text}</>
  }
}
