import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useState } from 'react'
import type { Snapshot, TraceResult } from '../../shared/types'
import { mismatchLine, truncationNotice } from '../pathfinding/results'
import { resultsSummary, routeRows } from './routeList'

interface Props {
  snapshot: Snapshot
  result: TraceResult
  routeIndex: number
  onRoute: (index: number) => void
  onClear: () => void
}

/**
 * Expandable Find AGG / BB results over the map. Choosing a route only changes
 * the highlight and the automatic facets; it never moves a card or the view.
 */
export default function MapResults({
  snapshot,
  result,
  routeIndex,
  onRoute,
  onClear,
}: Props) {
  const [open, setOpen] = useState(true)
  const rows = routeRows(snapshot, result)
  const notice = truncationNotice(result)
  return (
    <section
      className={`map-results ${open ? 'expanded' : 'collapsed'}`}
      aria-label="Map trace results"
    >
      <header>
        <strong>Find AGG / BB</strong>
        <span className={`badge ${result.status === 'reached' ? 'green' : ''}`}>
          {result.status === 'reached' ? 'Physical path found' : 'No route'}
        </span>
        {!open && <span>{resultsSummary(snapshot, result, routeIndex)}</span>}
        <button
          className="icon-button"
          aria-expanded={open}
          aria-label={open ? 'Collapse results' : 'Expand results'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>
        <button
          className="icon-button"
          aria-label="Clear trace"
          onClick={onClear}
        >
          <X size={16} />
        </button>
      </header>
      {open && (
        <>
          {rows.length > 0 && (
            <ol className="route-list">
              {rows.map((row) => (
                <li key={row.index}>
                  <button
                    data-testid="route-row"
                    className={row.index === routeIndex ? 'active' : ''}
                    aria-pressed={row.index === routeIndex}
                    onClick={() => onRoute(row.index)}
                  >
                    <span>{row.label}</span>
                    <small>{row.counts}</small>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="trace-explanation">{result.reason}</p>
          {result.mismatches.length > 0 && (
            <div className="trace-explanation" data-testid="mismatches">
              <strong>On another network (not routes)</strong>
              <ul>
                {result.mismatches.map((m) => (
                  <li key={`${m.start}:${m.end}`}>
                    {mismatchLine(snapshot, m)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {notice && (
            <p className="trace-explanation" data-testid="truncation">
              {notice}
            </p>
          )}
        </>
      )}
    </section>
  )
}
