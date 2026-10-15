import { Server } from 'lucide-react'
import { Fragment } from 'react'
import {
  endPieces,
  metaPieces,
  notePieces,
  type CableItem,
  type PlaceItem,
  type RowItem,
  type Sheet,
} from './sheet'
import Name from '../../shared/ui/Name'
import Pieces from '../../shared/ui/Pieces'
import './paths.css'

interface Props {
  sheet: Sheet
  /** A row was clicked: the endpoint it enters at. */
  onRow: (endpointId: string) => void
  /** When given, each row also gets a Server button to show its endpoint in Physical. */
  onShowInPhysical?: (endpointId: string) => void
}

function Place({ item }: { item: PlaceItem }) {
  const parts = [
    { name: item.site, bold: false },
    { name: item.node, bold: false },
    { name: item.rack, bold: true },
  ].filter((p) => p.name)
  return (
    <li className="walk-place" data-testid="walk-place">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="walk-sep" aria-hidden="true">
              ›
            </span>
          )}
          {p.bold ? (
            <b>
              <Name text={p.name} />
            </b>
          ) : (
            <Name text={p.name} />
          )}
        </Fragment>
      ))}
    </li>
  )
}

const STOP = ' · nothing connected'

function Row({
  item,
  className,
  onRow,
  onShowInPhysical,
}: {
  item: RowItem
  className: string
  onRow: Props['onRow']
  onShowInPhysical?: Props['onShowInPhysical']
}) {
  const stopped = item.stop && item.text.endsWith(STOP)
  return (
    <li className={`walk-step ${className}`}>
      <button
        type="button"
        className="walk-step-btn"
        data-testid="walk-row"
        data-endpoint={item.endpointId}
        onClick={() => onRow(item.endpointId)}
      >
        <span className="walk-unit">U{item.unit}</span>
        <span className="walk-name">
          <Name text={item.name} />
          <span className={`walk-tag ${item.tag.toLowerCase()}`}>
            {item.tag}
          </span>
        </span>
        <span className="walk-io">
          {stopped ? (
            <>
              {item.text.slice(0, -STOP.length)} ·{' '}
              <span className="walk-stop">nothing connected</span>
            </>
          ) : (
            item.text
          )}
        </span>
      </button>
      {onShowInPhysical && (
        <button
          type="button"
          className="row-action"
          title="Show in Physical"
          aria-label={`Show in Physical: ${item.name}`}
          onClick={() => onShowInPhysical(item.endpointId)}
        >
          <Server size={13} />
        </button>
      )}
    </li>
  )
}

function Cable({ item }: { item: CableItem }) {
  return (
    <li className="walk-cable" data-testid="walk-cable" data-link={item.linkId}>
      <span className="walk-line" aria-hidden="true" />
      <span className="walk-what">
        {item.label ? (
          <span>
            cable{' '}
            <b>
              <Name text={item.label} />
            </b>
          </span>
        ) : (
          <span>
            cable, no label ·{' '}
            <span className="walk-id" title={item.fullId}>
              {item.shortId}
            </span>
          </span>
        )}
        {item.note && (
          <span className="walk-leave">
            <Pieces pieces={notePieces(item.note)} />
          </span>
        )}
      </span>
    </li>
  )
}

/**
 * A path as a sheet: one row per equipment under its place, the cables between
 * them with a note when they leave a rack, node or site, and how the path ends.
 */
export default function WalkSheet({ sheet, onRow, onShowInPhysical }: Props) {
  const lastRow = sheet.items.map((it) => it.type).lastIndexOf('row')
  const { kind, role } = sheet.end
  return (
    <div className="walk-sheet" data-testid="walk-sheet">
      <p className="walk-meta">
        <Pieces pieces={metaPieces(sheet)} />
      </p>
      <ol className="walk-list">
        {sheet.items.map((item, i) => {
          if (item.type === 'place') return <Place key={i} item={item} />
          if (item.type === 'cable') return <Cable key={i} item={item} />
          const last = i === lastRow
          const className = [
            last && kind === 'destination' ? 'dest' : '',
            last && kind === 'destination' && role === 'backbone'
              ? 'bbdest'
              : '',
            item.stop ? 'free' : '',
          ].join(' ')
          return (
            <Row
              key={i}
              item={item}
              className={className}
              onRow={onRow}
              onShowInPhysical={onShowInPhysical}
            />
          )
        })}
      </ol>
      <p
        className={`walk-end ${endClass(sheet)}`}
        data-testid="walk-end"
        data-end={kind}
      >
        <Pieces pieces={endPieces(sheet)} />
      </p>
    </div>
  )
}

function endClass(sheet: Sheet) {
  const { kind, role } = sheet.end
  if (kind === 'destination') return role === 'backbone' ? 'bbdest' : 'dest'
  return kind === 'free' || kind === 'none' ? 'free' : ''
}
