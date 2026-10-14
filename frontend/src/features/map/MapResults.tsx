import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useState } from 'react'
import type { Snapshot, TraceResult } from '../../shared/types'
import type { Sheet } from '../paths/sheet'
import WalkSheet from '../paths/WalkSheet'
import { endpointLabel } from '../pathfinding/projection'
import { exportHeader, exportRouteView } from './exportRoute'
import { mismatchLine, truncationNotice } from '../pathfinding/results'
import { resultsSummary, resultsTitle, routeRows } from './routeList'

interface Props {
  snapshot: Snapshot
  /** The selected route's walk sheet, built once by the app and shared with the route view. */
  sheet?: Sheet
  /** A muted line under the header, for example that the selected route is not in this context. */
  note?: string
  result: TraceResult
  routeIndex: number
  onRoute: (index: number) => void
  /** A walk row was clicked: select its equipment and center on it. */
  onHop: (endpointId: string) => void
  /** Open this row's endpoint in Physical, from either view. */
  onShowInPhysical: (endpointId: string) => void
  onClear: () => void
  /** Show only this route, laid out for reading (session-only). */
  routeView: boolean
  onRouteView: (on: boolean) => void
  /** The plan's name when the routes are in a plan; absent for the installed topology. */
  planName?: string
  /** In Physical: the routes and hops only, without the route view and export (they belong to the map). */
  physical?: boolean
}

/**
 * Expandable Find AGG / BB results over the map. Choosing a route only changes
 * the highlight and the automatic facets; it never moves a card or the view.
 */
export default function MapResults({
  snapshot,
  sheet,
  note,
  result,
  routeIndex,
  onRoute,
  onHop,
  onShowInPhysical,
  onClear,
  routeView,
  onRouteView,
  planName,
  physical = false,
}: Props) {
  // The map keeps the panel open; Physical opens it as one summary line.
  const [openIn, setOpenIn] = useState({ map: true, physical: false })
  const open = physical ? openIn.physical : openIn.map
  const toggle = () =>
    setOpenIn((o) =>
      physical ? { ...o, physical: !o.physical } : { ...o, map: !o.map },
    )
  const [exporting, setExporting] = useState<'png' | 'pdf'>()
  const [exportError, setExportError] = useState<string>()
  // One capture of the route view's diagram; nothing on the page changes.
  async function exportRoute(format: 'png' | 'pdf') {
    const route = result.routes[routeIndex]
    const element = document.querySelector<HTMLElement>(
      '.flow-surface [data-testid="route-diagram"]',
    )
    if (!route || !element) return
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
          plan: planName,
          date: new Date().toLocaleDateString('en-CA'),
        }),
      })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setExporting(undefined)
    }
  }
  const rows = routeRows(snapshot, result)
  const selected = result.routes[routeIndex]
  const notice = truncationNotice(result)
  return (
    <section
      className={`map-results ${open ? 'expanded' : 'collapsed'} ${physical ? 'physical' : ''}`}
      aria-label="Map trace results"
    >
      <header>
        <strong>{resultsTitle(result.mode)}</strong>
        <span className={`badge ${result.status === 'reached' ? 'green' : ''}`}>
          {result.status === 'reached' ? 'Physical path found' : 'No route'}
        </span>
        {!open && <span>{resultsSummary(snapshot, result, routeIndex)}</span>}
        <button
          className="icon-button"
          aria-expanded={open}
          aria-label={open ? 'Collapse results' : 'Expand results'}
          onClick={toggle}
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
      {note && (
        <p className="results-note" data-testid="route-note">
          {note}
        </p>
      )}
      {open && (
        <>
          {rows.length > 0 && (
            <ol className="route-list">
              {rows.map((row) => (
                <li key={row.index}>
                  <button
                    data-testid="route-row"
                    className={`route-row ${row.index === routeIndex ? 'active' : ''}`}
                    aria-pressed={row.index === routeIndex}
                    onClick={() => onRoute(row.index)}
                  >
                    <span>{row.label}</span>
                    <small>{row.counts}</small>
                  </button>
                  {row.index === routeIndex && selected && (
                    <>
                      {!physical && (
                        <div className="map-route-tools">
                          <button
                            className="route-view-toggle"
                            aria-pressed={routeView}
                            onClick={() => onRouteView(!routeView)}
                          >
                            Route view
                          </button>
                          {(['png', 'pdf'] as const).map((format) => (
                            <button
                              key={format}
                              className="route-view-toggle"
                              aria-label={`Export ${format.toUpperCase()}`}
                              disabled={!routeView || exporting !== undefined}
                              title={
                                routeView
                                  ? `Download the route as a ${format.toUpperCase()}`
                                  : 'Turn on Route view to export'
                              }
                              onClick={() => void exportRoute(format)}
                            >
                              {exporting === format
                                ? 'Exporting…'
                                : format.toUpperCase()}
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
                    </>
                  )}
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
