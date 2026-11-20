import { useState } from 'react'
import type { Snapshot, TraceResult } from '../../shared/types'
import Chip from '../../shared/ui/Chip'
import Pieces from '../../shared/ui/Pieces'
import { exportHeader, exportRouteView } from '../map/exportRoute'
import { resultsSummary, resultsTitle, routeRows } from '../map/routeList'
import type { Sheet } from '../paths/sheet'
import WalkSheet from '../paths/WalkSheet'
import { endpointLabel } from '../pathfinding/projection'
import { mismatchLine, truncationNotice } from '../pathfinding/results'
import TracePicker from '../pathfinding/TracePicker'
import type { PickerItem } from '../pathfinding/picker'

type Mode = 'distribution' | 'point_to_point'

interface Props {
  snapshot: Snapshot
  // The form.
  mode: Mode
  start: string
  end: string
  startItems: readonly PickerItem[]
  endItems: readonly PickerItem[]
  pending: boolean
  onMode: (mode: Mode) => void
  onStart: (value: string) => void
  onEnd: (value: string) => void
  onRun: () => void
  /** A failed trace: its message, shown once, here. */
  error?: string
  onRefresh: () => void
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
  /** The route view and its export: on Conceptual only (they go when the Trace page arrives). */
  routeView?: { on: boolean; onChange: (on: boolean) => void }
  planName?: string
  /** Absent until the Trace page exists: then the button is not drawn. */
  onOpenPage?: () => void
}

/** The whole body of the dock's Trace tab: the form, a failed trace's error, then the results. */
export default function TraceTab(props: Props) {
  const { snapshot, result, routeIndex } = props
  const [exporting, setExporting] = useState<'png' | 'pdf'>()
  const [exportError, setExportError] = useState<string>()
  async function exportRoute(format: 'png' | 'pdf') {
    const route = result?.routes[routeIndex]
    const element = document.querySelector<HTMLElement>(
      '.flow-surface [data-testid="route-diagram"]',
    )
    if (!result || !route || !element) return
    const start = endpointLabel(snapshot, route.start)
    const end = endpointLabel(snapshot, route.end)
    setExporting(format)
    setExportError(undefined)
    try {
      await exportRouteView({
        format,
        element,
        start,
        end,
        header: exportHeader({
          start,
          end,
          mode: result.mode,
          networkName: snapshot.networks.find(
            (n) => n.id === route.sourceNetworkId,
          )?.name,
          plan: props.planName,
          date: new Date().toLocaleDateString('en-CA'),
        }),
      })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setExporting(undefined)
    }
  }

  return (
    <>
      {props.onOpenPage && (
        <button type="button" className="btn quiet" onClick={props.onOpenPage}>
          Open full page ⤢
        </button>
      )}
      <section className="trace-form">
        <label>
          Trace mode
          <select
            value={props.mode}
            disabled={props.pending}
            onChange={(e) => props.onMode(e.target.value as Mode)}
          >
            <option value="distribution">Find AGG / BB</option>
            <option value="point_to_point">Exact port → port</option>
          </select>
        </label>
        <TracePicker
          label="Start"
          items={props.startItems}
          value={props.start}
          disabled={props.pending}
          onChange={props.onStart}
        />
        {props.mode === 'point_to_point' && (
          <TracePicker
            label="Destination"
            items={props.endItems}
            value={props.end}
            onChange={props.onEnd}
          />
        )}
        <button
          className="btn primary"
          disabled={props.pending || !props.start}
          onClick={props.onRun}
        >
          {props.pending
            ? 'Tracing…'
            : props.mode === 'distribution'
              ? 'Find AGG / BB'
              : 'Trace physical path'}
        </button>
      </section>
      {props.error && (
        <p role="alert" className="inline-error">
          {props.error}
          <button className="text-button" onClick={props.onRefresh}>
            Refresh topology
          </button>
        </p>
      )}
      {result && (
        <Results
          {...props}
          result={result}
          exporting={exporting}
          exportError={exportError}
          onExport={(format) => void exportRoute(format)}
        />
      )}
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
  routeView,
  exporting,
  exportError,
  onExport,
}: Props & {
  result: TraceResult
  exporting?: 'png' | 'pdf'
  exportError?: string
  onExport: (format: 'png' | 'pdf') => void
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
          {routeView && (
            <div className="map-route-tools">
              <button
                className="route-view-toggle btn"
                aria-pressed={routeView.on}
                onClick={() => routeView.onChange(!routeView.on)}
              >
                Route view
              </button>
              {(['png', 'pdf'] as const).map((format) => (
                <button
                  key={format}
                  className="route-view-toggle btn quiet"
                  aria-label={`Export ${format.toUpperCase()}`}
                  disabled={!routeView.on || exporting !== undefined}
                  title={
                    routeView.on
                      ? `Download the route as a ${format.toUpperCase()}`
                      : 'Turn on Route view to export'
                  }
                  onClick={() => onExport(format)}
                >
                  {exporting === format ? 'Exporting…' : format.toUpperCase()}
                </button>
              ))}
              {exportError && (
                <span role="alert" className="inline-error">
                  {exportError}
                </span>
              )}
            </div>
          )}
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
