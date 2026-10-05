import { ArrowRight, GitFork, Route as RouteIcon, X } from 'lucide-react'
import type { Snapshot, TraceResult } from '../../shared/types'
import { hopRows } from './hops'
import {
  destinationOf,
  mismatchLine,
  routeOptionLabel,
  sourceNetworkNote,
  truncationNotice,
} from './results'

interface Props {
  snapshot: Snapshot
  result?: TraceResult
  routeIndex: number
  onRoute: (index: number) => void
  onHop: (endpoint: string) => void
  onClear: () => void
}

export default function TracePanel({
  snapshot,
  result,
  routeIndex,
  onRoute,
  onHop,
  onClear,
}: Props) {
  const route = result?.routes[routeIndex]
  return (
    <section
      className="trace-panel"
      aria-label="Trace results"
      aria-live="polite"
    >
      <div className="trace-heading">
        <RouteIcon size={19} />
        <h2>Path explorer</h2>
        <span
          className={`badge ${result?.status === 'reached' ? 'green' : ''}`}
        >
          {result
            ? result.status === 'reached'
              ? 'Physical path found'
              : 'No route'
            : 'Ready to trace'}
        </span>
        <div className="trace-context">
          {snapshot.context} · {snapshot.revision}
        </div>
        {result && (
          <button
            className="icon-button"
            onClick={onClear}
            aria-label="Clear trace"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {!result ? (
        <div className="trace-empty">
          <GitFork size={23} />
          <div>
            <strong>Understand every connection.</strong>
            <p>
              Select an exact port or a device, then trace to another port or
              find AGG / BB destinations. Panel bridges are included.
            </p>
          </div>
        </div>
      ) : (
        <>
          {result.routes.length > 1 && (
            <label className="route-choice">
              Route{' '}
              <select
                value={routeIndex}
                onChange={(e) => onRoute(Number(e.target.value))}
              >
                {result.routes.map((r, i) => (
                  <option key={`${r.start}:${r.end}`} value={i}>
                    {routeOptionLabel(snapshot, r)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {route && destinationOf(snapshot, route) && (
            <p className="trace-destination" data-testid="route-destination">
              {destinationOf(snapshot, route)!.name} ·{' '}
              {destinationOf(snapshot, route)!.role} ·{' '}
              {destinationOf(snapshot, route)!.network}
            </p>
          )}
          {route && sourceNetworkNote(snapshot, route) && (
            <p className="trace-explanation">
              {sourceNetworkNote(snapshot, route)}
            </p>
          )}
          {route && (
            <div className="hop-list">
              {hopRows(snapshot, route).map((row) =>
                row.kind === 'start' ? (
                  <button
                    key={row.key}
                    className="hop start"
                    data-testid="hop-row"
                    onClick={() => onHop(row.endpointId)}
                  >
                    <small>{row.title}</small>
                    {row.label}
                  </button>
                ) : (
                  <div className="hop-step" key={row.key}>
                    <ArrowRight size={15} />
                    <button
                      className={`hop ${row.kind}`}
                      data-testid="hop-row"
                      onClick={() => onHop(row.endpointId)}
                    >
                      <small>{row.title}</small>
                      {row.label}
                      <span>{row.linkId}</span>
                    </button>
                  </div>
                ),
              )}
            </div>
          )}
          <p className="trace-explanation">
            {result.reason}
            {route &&
              ` ${route.hops.filter((h) => h.kind === 'cable').length} cables · ${route.hops.filter((h) => h.kind === 'internal').length} internal bridges.`}
          </p>
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
          {truncationNotice(result) && (
            <p className="trace-explanation" data-testid="truncation">
              {truncationNotice(result)}
            </p>
          )}
        </>
      )}
    </section>
  )
}
