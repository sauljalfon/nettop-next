import type { Snapshot, TraceResult } from '../../shared/types'
import Chip from '../../shared/ui/Chip'
import Pieces from '../../shared/ui/Pieces'
import { resultsSummary, resultsTitle, routeRows } from '../map/routeList'
import type { Sheet } from '../paths/sheet'
import WalkSheet from '../paths/WalkSheet'
import { mismatchLine, truncationNotice } from '../pathfinding/results'

interface Props {
  snapshot: Snapshot
  /** A failed trace: its message, shown once, here. */
  error?: string
  onRefresh: () => void
  /** A request is in flight. */
  pending?: boolean
  // The results.
  result?: TraceResult
  routeIndex: number
  onRoute: (index: number) => void
  /** The selected route's walk sheet. */
  sheet?: Sheet
  /** A muted line, for example that the selected route is not in this context. */
  note?: string
  /** A walk row was clicked. */
  onHop: (endpointId: string) => void
  onShowInPhysical: (endpointId: string) => void
  onClear: () => void
  /** Open full page ⤢: the Trace page, for the trace shown here. */
  onOpenPage?: () => void
}

/** The whole body of the dock's Trace tab: a failed trace's error, then the results. */
export default function TraceTab(props: Props) {
  const { result } = props
  return (
    <>
      {props.pending && !result && !props.error && (
        <p className="dock-note">Tracing…</p>
      )}
      {props.error && (
        <p role="alert" className="inline-error">
          {props.error}
          <button className="text-button" onClick={props.onRefresh}>
            Refresh topology
          </button>
          <button className="text-button" onClick={props.onClear}>
            Clear trace
          </button>
        </p>
      )}
      {result && <Results {...props} result={result} />}
    </>
  )
}

function Results({
  snapshot,
  result,
  routeIndex,
  onRoute,
  sheet,
  note,
  onHop,
  onShowInPhysical,
  onClear,
  onOpenPage,
}: Props & {
  result: TraceResult
}) {
  const rows = routeRows(snapshot, result)
  const selected = result.routes[routeIndex]
  const notice = truncationNotice(result)
  return (
    <section className="trace-results" aria-label="Trace results">
      <div className="group-label">
        <strong>{resultsTitle(result.mode)}</strong>
        <Chip kind={result.status === 'reached' ? 'route' : 'state'}>
          {result.status === 'reached' ? 'Physical path found' : 'No route'}
        </Chip>
        {onOpenPage && (
          <button type="button" className="btn quiet" onClick={onOpenPage}>
            Open full page ⤢
          </button>
        )}
        <button type="button" className="btn quiet" onClick={onClear}>
          Clear trace
        </button>
      </div>
      <p className="trace-summary">
        {resultsSummary(snapshot, result, routeIndex)}
      </p>
      {note && (
        <p className="dock-note" data-testid="route-note">
          {note}
        </p>
      )}
      {rows.length > 0 && (
        <ol className="dlist route-list">
          {rows.map((row) => (
            <li key={row.index}>
              <button
                data-testid="route-row"
                className="route-row"
                aria-pressed={row.index === routeIndex}
                onClick={() => onRoute(row.index)}
              >
                <span>
                  <Pieces pieces={row.pieces} />
                </span>
                <small className="r">{row.counts}</small>
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
              <li key={`${m.start}:${m.end}`}>{mismatchLine(snapshot, m)}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <p className="trace-explanation" data-testid="truncation">
          {notice}
        </p>
      )}
      {selected && (
        <div className="route-detail">
          <div className="group-label">
            <strong>Walk of the selected route</strong>
          </div>
          {sheet && (
            <WalkSheet
              sheet={sheet}
              onRow={onHop}
              onShowInPhysical={onShowInPhysical}
            />
          )}
        </div>
      )}
    </section>
  )
}
