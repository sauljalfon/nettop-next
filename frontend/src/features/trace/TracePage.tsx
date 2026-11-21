import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { Route, Snapshot, TraceResult } from '../../shared/types'
import { kindLabel } from '../../shared/equipment'
import Name from '../../shared/ui/Name'
import Pieces from '../../shared/ui/Pieces'
import PlacePath from '../../shared/ui/PlacePath'
import { exportHeader, exportRouteView } from '../map/exportRoute'
import { colorOf, networkColors } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { useHdfNumbering } from '../physical/hdfNumbering'
import { jackName } from '../paths/PathPlates'
import { endpointLabel, endpointPieces } from '../pathfinding/projection'
import { truncationNotice } from '../pathfinding/results'
import { traceSession } from '../pathfinding/traceSession'
import type { PathPlate } from '../paths/pathLine'
import TraceCanvas from './TraceCanvas'
import TraceDrawing, { type DrawnLine } from './TraceDrawing'
import {
  portOutcomes,
  resultCounts,
  resultGroups,
  routeLine,
  sharedEquipment,
  walkRows,
  type ResultItem,
} from './model'
import { countsLine, countsPhrases, pickItem } from './page'
import './trace.css'

type Installed = {
  equipment: ReadonlySet<string>
  links: ReadonlySet<string>
}

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  /** In a plan: what is installed, so proposed plates and cables are dashed. */
  installed?: Installed
  /** Absent when there is no trace for this topology: the page says "No trace". */
  result?: TraceResult
  /** The trace is running (or running again). */
  pending?: boolean
  /** A failed trace's message. */
  error?: string
  onRefresh?: () => void
  routeIndex: number
  onRoute: (index: number) => void
  onBack: () => void
  /** Show in Physical: that equipment's page, on that jack. */
  onOpen: (equipmentId: string, endpointId?: string) => void
  /** The tree, with the chosen route lit in place. */
  onShowOnMap: () => void
  planName?: string
}

const typing = (el: Element | null) =>
  !!el &&
  (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
    (el as HTMLElement).isContentEditable)

/**
 * The Trace page (D46): one trace on a whole page, without the dock. The list
 * of every result on the left; the chosen route (or all of them) drawn end to
 * end as hardware, then its walk step by step. It draws only the server's
 * routes and the stored walk; frames, zoom and amber marks are drawing aids.
 */
export default function TracePage(props: Props) {
  const { snapshot, index, installed, result, onBack } = props
  const view = useSyncExternalStore(
    traceSession.subscribe,
    traceSession.pageView,
  )
  const picture = useSyncExternalStore(
    traceSession.subscribe,
    traceSession.picture,
  )
  const numbering = useHdfNumbering()
  const colors = useMemo(
    () => networkColors(snapshot.networks),
    [snapshot.networks],
  )
  // A mismatch chosen on this page; a route chosen in the list clears it.
  const [mismatch, setMismatch] = useState<number>()
  const [exporting, setExporting] = useState<'png' | 'pdf'>()
  const [exportError, setExportError] = useState<string>()
  const drawingEl = useRef<HTMLDivElement>(null)
  const walkEl = useRef<HTMLDivElement>(null)

  // Esc leaves Picture only, unless a field, a menu or a dialog took the key.
  useEffect(() => {
    if (!picture) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (typing(event.target as Element | null)) return
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      )
        return
      traceSession.setPicture(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [picture])

  const picked = useMemo(
    () => (result ? pickItem(result, props.routeIndex, mismatch) : undefined),
    [result, props.routeIndex, mismatch],
  )
  const lines = useMemo(() => {
    const m = new Map<Route, ReturnType<typeof routeLine>>()
    if (result)
      for (const r of [...result.routes, ...result.mismatches])
        m.set(r, routeLine(index, r, installed))
    return m
  }, [result, index, installed])

  const bar = (
    <PageBar
      {...props}
      view={view}
      picture={picture}
      canDraw={!!picked}
      canStack={!!result && result.routes.length > 0}
      exporting={exporting}
      exportError={exportError}
      onExport={async (format) => {
        const route = picked?.route
        const element = drawingEl.current
        if (!result || !route || !element) return
        const start = endpointLabel(snapshot, route.start)
        const end = endpointLabel(snapshot, route.end)
        setExporting(format)
        setExportError(undefined)
        try {
          await exportRouteView({
            format,
            // The PDF is the drawing, then the walk (One route only).
            elements:
              format === 'pdf' && walkEl.current
                ? [element, walkEl.current]
                : [element],
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
          setExportError(
            error instanceof Error ? error.message : 'Export failed.',
          )
        } finally {
          setExporting(undefined)
        }
      }}
    />
  )

  const shell = (body: React.ReactNode) => (
    <section
      className="trace-page"
      data-testid="trace-page"
      data-picture={picture}
      data-view={view}
      aria-label="Trace page"
    >
      {bar}
      {body}
    </section>
  )

  if (!result) {
    return shell(
      <div className="tp-empty" role={props.error ? 'alert' : 'status'}>
        {props.pending ? (
          <p>Tracing…</p>
        ) : props.error ? (
          <p className="inline-error">
            {props.error}
            {props.onRefresh && (
              <button
                type="button"
                className="text-button"
                onClick={props.onRefresh}
              >
                Refresh topology
              </button>
            )}
          </p>
        ) : (
          <>
            <h2>No trace</h2>
            <p className="sub">
              Run Find AGG / BB from the dock’s Trace tab or from a jack, then
              open it here.
            </p>
          </>
        )}
      </div>,
    )
  }

  const stacked = view === 'all' && result.routes.length > 0
  const counts = resultCounts(result)
  const groups = resultGroups(result)
  const notice = truncationNotice(result)
  // Point-to-point routes have no destination role: one group of their own.
  const plain = result.routes
    .map((route, index): ResultItem => ({ kind: 'route', index, route }))
    .filter((i) => !i.route.destinationRole)

  const chooseItem = (item: ResultItem) => {
    if (item.kind === 'mismatch') setMismatch(item.index)
    else {
      setMismatch(undefined)
      props.onRoute(item.index)
    }
  }
  const openOne = (item: ResultItem) => {
    chooseItem(item)
    traceSession.setPageView('one')
  }

  // --- the list
  const list = (
    <aside className="tp-list" aria-label="Results" data-testid="trace-list">
      <div className="tp-summary">
        <span>
          <b>{countsLine(counts)}</b>
        </span>
        {result.mode === 'distribution' && (
          <span>
            from {counts.reachedPorts} of {counts.searchedPorts} ports
          </span>
        )}
      </div>
      {notice && (
        <p className="callout" data-testid="truncation">
          {notice}
        </p>
      )}
      {counts.routes + counts.mismatches === 0 && (
        <p className="sub" data-testid="trace-none">
          {result.reason || 'No route found.'}
        </p>
      )}
      {(
        [
          ['AGG', groups.aggregation],
          ['BB', groups.backbone],
          ['Routes', plain],
          ['Mismatch · another network', groups.mismatches],
        ] as const
      ).map(([label, items]) =>
        items.length ? (
          <div key={label} className="tp-group">
            <div className="group-label" data-testid="trace-group">
              <span>{label}</span>
              <span>{items.length}</span>
            </div>
            <div className="dlist">
              {items.map((item) => (
                <ListItem
                  key={`${item.kind}${item.index}`}
                  snapshot={snapshot}
                  item={item}
                  steps={lines.get(item.route)?.steps ?? []}
                  cables={lines.get(item.route)?.cables ?? 0}
                  pressed={
                    picked?.kind === item.kind && picked.index === item.index
                  }
                  onClick={() => chooseItem(item)}
                />
              ))}
            </div>
          </div>
        ) : null,
      )}
      <Outcomes index={index} snapshot={snapshot} result={result} />
    </aside>
  )

  // --- the drawing
  let drawn: DrawnLine[] = []
  let shared: Set<string> | undefined
  let titleNode: React.ReactNode = null
  let note: React.ReactNode = null
  let body: React.ReactNode = null
  const start = picked?.route.start ?? result.routes[0]?.start
  const startName = start
    ? (index.equipment.get(index.owner.get(start) ?? '')?.name ?? start)
    : ''

  if (stacked) {
    const sets = result.routes.map((r) => lines.get(r)?.steps ?? [])
    shared = sharedEquipment(sets)
    const names = [...shared].map((id) => index.equipment.get(id)?.name ?? id)
    drawn = result.routes.map((route, i) => {
      const item: ResultItem = { kind: 'route', index: i, route }
      return {
        key: `${route.start}>${route.end}#${i}`,
        steps: lines.get(route)?.steps ?? [],
        current: picked?.kind === 'route' && picked.index === i,
        head: (
          <>
            <b>
              <Pieces pieces={routeTitle(snapshot, route)} />
            </b>
            <span className="tag">{roleTag(route)}</span>
            <span className="sub">
              {cablesText(lines.get(route)?.cables ?? 0)}
            </span>
            {!picture && (
              <button
                type="button"
                className="btn quiet"
                onClick={() => openOne(item)}
              >
                Open this route
              </button>
            )}
          </>
        ),
      }
    })
    titleNode = (
      <>
        All routes from <Name text={startName} />
      </>
    )
    note = names.length > 0 && (
      <p className="callout" data-testid="trace-shared">
        <b>
          Every route passes{' '}
          {names.map((n, i) => (
            <span key={n}>
              {i > 0 && ', '}
              <Name text={n} />
            </span>
          ))}
          .
        </b>{' '}
        Different jacks, the same equipment: a problem there cuts all{' '}
        {result.routes.length}.
      </p>
    )
  } else if (picked) {
    const line = lines.get(picked.route)!
    drawn = [{ key: 'one', steps: line.steps }]
    titleNode = <Pieces pieces={routeTitle(snapshot, picked.route)} />
    if (picked.kind === 'mismatch') {
      const source = snapshot.networks.find(
        (n) => n.id === picked.route.sourceNetworkId,
      )?.name
      const target = snapshot.networks.find(
        (n) => n.id === picked.route.destinationNetworkId,
      )?.name
      const destination = picked.route.destinationEquipmentId
      note = (
        <p
          className="callout mismatch"
          data-testid="trace-note"
          style={
            picked.route.destinationNetworkId
              ? ({
                  '--net': colorOf(colors, picked.route.destinationNetworkId),
                } as React.CSSProperties)
              : undefined
          }
        >
          <b>A mismatch, not a route.</b>{' '}
          <Pieces
            pieces={endpointPieces(snapshot, picked.route.start).slice(2)}
          />{' '}
          is on{' '}
          {source ? (
            <Name text={source} />
          ) : (
            'a network that cannot be resolved'
          )}
          , and the circuit ends at{' '}
          <Name
            text={
              destination
                ? (index.equipment.get(destination)?.name ?? destination)
                : endpointLabel(snapshot, picked.route.end)
            }
          />{' '}
          on {target ? <Name text={target} /> : 'another network'}. Check the
          cable at either end.
        </p>
      )
    }
  }

  const sectionKey = stacked
    ? 'all'
    : picked
      ? `${picked.kind}${picked.index}`
      : 'none'
  const picTitle = stacked ? (
    <>
      {titleNode} ·{' '}
      <span className="sub">
        equipment every route passes is outlined in amber
      </span>
    </>
  ) : (
    picked && (
      <>
        {titleNode} ·{' '}
        <span className="sub">
          {cablesText(lines.get(picked.route)?.cables ?? 0)}
        </span>
      </>
    )
  )

  const canvas = drawn.length > 0 && (
    <TraceCanvas
      key={`${sectionKey}|${picture}`}
      picture={picture}
      onPicture={traceSession.setPicture}
      title={picTitle}
      drawingRef={drawingEl}
    >
      <TraceDrawing
        index={index}
        lines={drawn}
        colors={colors}
        numbering={numbering}
        shared={shared}
        onOpen={(endpointId) => {
          const owner = index.owner.get(endpointId)
          if (owner) props.onOpen(owner, endpointId)
        }}
      />
    </TraceCanvas>
  )

  const oneLine = picked ? lines.get(picked.route) : undefined
  const plates = (oneLine?.steps ?? []).filter(
    (s): s is PathPlate => s.kind === 'plate',
  )
  const racks = new Set(plates.map((p) => p.rackId ?? p.place.join('/')))
  const nodes = new Set(
    plates.map(
      (p) =>
        index.places.get(p.equipmentId)?.nodeId ??
        p.place.slice(0, 2).join('/'),
    ),
  )

  let main: React.ReactNode
  if (picture) {
    main = <div className="tp-body">{canvas}</div>
  } else if (stacked) {
    main = (
      <div className="tp-body">
        <div className="tp-title">
          <h2 data-testid="trace-title">{titleNode}</h2>
          <div className="sub">
            {result.routes.length} routes · each one end to end
            {result.mismatches.length > 0 && ' · the mismatches are left out'}
          </div>
        </div>
        {note}
        {canvas}
      </div>
    )
  } else if (picked) {
    main = (
      <div className="tp-body">
        <div className="tp-title">
          <h2 data-testid="trace-title">{titleNode}</h2>
          <div className="tp-summary" data-testid="trace-counts">
            {countsPhrases({
              cables: oneLine?.cables ?? 0,
              equipment: plates.length,
              racks: racks.size,
              nodes: nodes.size,
            }).map((t, i) => (
              <span key={i}>{i === 0 ? <b>{t}</b> : t}</span>
            ))}
            <span>{networkPhrase(snapshot, picked.route, picked.kind)}</span>
          </div>
        </div>
        {note}
        {canvas}
        <div className="section-label">Walk, step by step</div>
        <Walk
          index={index}
          steps={oneLine?.steps ?? []}
          numbering={numbering}
          colors={colors}
          walkRef={walkEl}
          onOpen={props.onOpen}
        />
      </div>
    )
  } else {
    main = (
      <div className="tp-body">
        <p className="sub" data-testid="trace-none-drawn">
          Nothing to draw: this trace found no route and no mismatch.
        </p>
      </div>
    )
  }

  return shell(
    <div className={`tp${picture ? ' pic' : ''}`}>
      {!picture && list}
      {main}
    </div>,
  )
}

const cablesText = (n: number) => `${n} ${n === 1 ? 'cable' : 'cables'}`
const roleTag = (route: Route) =>
  route.destinationRole === 'aggregation'
    ? 'AGG'
    : route.destinationRole === 'backbone'
      ? 'BB'
      : 'Route'

/** "EDGE-17 · Port 1 → AGG-03 · Port 1", each name its own piece. */
const routeTitle = (snapshot: Snapshot, route: Route) => [
  ...endpointPieces(snapshot, route.start),
  { text: ' → ' },
  ...endpointPieces(snapshot, route.end),
]

function networkPhrase(
  snapshot: Snapshot,
  route: Route,
  kind: 'route' | 'mismatch',
) {
  const name = (id?: string) => snapshot.networks.find((n) => n.id === id)?.name
  const src = name(route.sourceNetworkId)
  if (kind === 'mismatch')
    return (
      <>
        {src ? <Name text={src} /> : 'Network unresolved'} →{' '}
        <b className="net-other">
          {name(route.destinationNetworkId) ? (
            <Name text={name(route.destinationNetworkId)!} />
          ) : (
            'another network'
          )}
        </b>
      </>
    )
  return (
    <>
      {src ? <Name text={src} /> : 'Network unresolved'}
      {route.destinationRole &&
        ` · ends at ${route.destinationRole === 'aggregation' ? 'AGG' : 'BB'}`}
    </>
  )
}

function ListItem({
  snapshot,
  item,
  steps,
  cables,
  pressed,
  onClick,
}: {
  snapshot: Snapshot
  item: ResultItem
  steps: ReturnType<typeof routeLine>['steps']
  cables: number
  pressed: boolean
  onClick: () => void
}) {
  const plates = steps.filter((s): s is PathPlate => s.kind === 'plate')
  const via = plates.slice(1, -1)
  const network = snapshot.networks.find(
    (n) => n.id === item.route.destinationNetworkId,
  )?.name
  return (
    <button
      type="button"
      className={item.kind === 'mismatch' ? 'mm' : undefined}
      data-testid="trace-item"
      data-kind={item.kind}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <b>
        <Pieces pieces={endpointPieces(snapshot, item.route.end)} />
      </b>
      <span className="r">
        {item.kind === 'mismatch' ? (
          network ? (
            <Name text={network} />
          ) : (
            'another network'
          )
        ) : (
          roleTag(item.route)
        )}{' '}
        · {cablesText(cables)}
      </span>
      <span className="s">
        from {plates[0] && <Name text={plates[0].name} />}
        {via.length > 0 && ' · via '}
        {via.map((p, i) => (
          <span key={i}>
            {i > 0 && ', '}
            <Name text={p.name} />
          </span>
        ))}
      </span>
    </button>
  )
}

function Outcomes({
  index,
  snapshot,
  result,
}: {
  index: SnapshotIndex
  snapshot: Snapshot
  result: TraceResult
}) {
  const { lines, counts } = useMemo(
    () => portOutcomes(index, result),
    [index, result],
  )
  if (result.starts.length === 0) return null
  const networkName = (id?: string) =>
    snapshot.networks.find((n) => n.id === id)?.name
  return (
    <details className="outcomes">
      <summary>What each port found · {result.starts.length} searched</summary>
      {lines.map((l) => (
        <div key={l.endpointId}>
          <span className="mono">
            <Name text={l.equipmentName} /> · <Name text={l.jack} />
          </span>
          <span>
            {l.outcome === 'mismatch' && 'mismatch · '}
            {l.destinationName && <Name text={l.destinationName} />}
            {l.outcome === 'mismatch' &&
              networkName(l.destinationNetworkId) && (
                <>
                  , <Name text={networkName(l.destinationNetworkId)!} />
                </>
              )}
          </span>
        </div>
      ))}
      {counts.no_destination > 0 && (
        <div>
          <span>{counts.no_destination} ports</span>
          <span>no destination</span>
        </div>
      )}
      {counts.disconnected > 0 && (
        <div>
          <span>{counts.disconnected} ports</span>
          <span>disconnected · no cable</span>
        </div>
      )}
      {counts.unresolved_network > 0 && (
        <div>
          <span>{counts.unresolved_network} ports</span>
          <span>network unresolved</span>
        </div>
      )}
    </details>
  )
}

function Walk({
  index,
  steps,
  numbering,
  colors,
  walkRef,
  onOpen,
}: {
  index: SnapshotIndex
  steps: ReturnType<typeof routeLine>['steps']
  numbering: ReturnType<typeof useHdfNumbering>
  colors: ReadonlyMap<string, string>
  walkRef: React.Ref<HTMLDivElement>
  onOpen: (equipmentId: string, endpointId?: string) => void
}) {
  const rows = useMemo(() => walkRows(index, steps), [index, steps])
  return (
    <div className="walk" data-testid="trace-walk" ref={walkRef}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Equipment</th>
            <th>Where</th>
            <th>Arrives at</th>
            <th>Leaves from</th>
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'cable')
              return (
                <tr
                  key={`c${row.linkId}`}
                  className="cable"
                  data-testid="walk-cable"
                  style={
                    {
                      '--net': colorOf(colors, row.networkId ?? ''),
                    } as React.CSSProperties
                  }
                >
                  <td />
                  <td colSpan={5}>
                    cable{' '}
                    <span className="mono">
                      <Name text={row.linkId} />
                    </span>
                  </td>
                  <td />
                </tr>
              )
            const jack = row.arrives ?? row.leaves
            const text = (j?: typeof jack) =>
              j ? jackName(index, row.plate, j, numbering) : '—'
            return (
              <tr
                key={`s${row.n}`}
                data-testid="walk-row"
                data-endpoint={jack?.endpointId}
              >
                <td className="no">{row.n}</td>
                <td className="walk-name">
                  <b>
                    <Name text={row.plate.name} />
                  </b>{' '}
                  <span className="tag">
                    {kindLabel({ kind: row.plate.equipmentKind })}
                  </span>
                </td>
                <td className="walk-where sub">
                  <PlacePath parts={row.plate.place} />
                </td>
                <td className="walk-arrives mono">
                  {row.arrives ? <Name text={text(row.arrives)} /> : '—'}
                </td>
                <td className="walk-leaves mono">
                  {row.leaves ? <Name text={text(row.leaves)} /> : '—'}
                </td>
                <td className="walk-note sub">{row.note}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      onOpen(row.plate.equipmentId, jack?.endpointId)
                    }
                  >
                    Open
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PageBar({
  snapshot,
  index,
  view,
  picture,
  canDraw,
  canStack,
  exporting,
  exportError,
  onExport,
  onBack,
  onShowOnMap,
}: Props & {
  view: 'one' | 'all'
  picture: boolean
  canDraw: boolean
  canStack: boolean
  exporting?: 'png' | 'pdf'
  exportError?: string
  onExport: (format: 'png' | 'pdf') => void
}) {
  const request = traceSession.get()?.request
  const start = !request
    ? []
    : 'device' in request
      ? [
          { name: index.equipment.get(request.device)?.name ?? request.device },
          { text: ' · all ports' },
        ]
      : endpointPieces(snapshot, request.start)
  return (
    <header className="tp-bar" data-testid="trace-bar">
      <div className="tp-crumbs">
        <button type="button" className="tp-back" onClick={onBack}>
          ← Back
        </button>
        <span className="sep" aria-hidden="true">
          ›
        </span>
        <span className="here">Trace</span>
      </div>
      {!picture && request && (
        <span className="tp-start" data-testid="trace-start">
          <span className="chip muted">
            {request.mode === 'distribution' ? 'Find AGG / BB' : 'Port to port'}
          </span>
          {start.length > 0 && (
            <span>
              <Pieces pieces={start} />
            </span>
          )}
        </span>
      )}
      <span className="spacer" />
      {canDraw && (
        <div className="seg" role="group" aria-label="Show">
          <button
            type="button"
            aria-pressed={view !== 'all' || !canStack}
            onClick={() => traceSession.setPageView('one')}
          >
            One route
          </button>
          <button
            type="button"
            aria-pressed={view === 'all' && canStack}
            disabled={!canStack}
            onClick={() => traceSession.setPageView('all')}
          >
            All routes
          </button>
        </div>
      )}
      {!picture && canDraw && (
        <button type="button" className="btn quiet" onClick={onShowOnMap}>
          Show on map
        </button>
      )}
      {canDraw && (
        <>
          <span className="sub">Export</span>
          {(['png', 'pdf'] as const).map((format) => (
            <button
              key={format}
              type="button"
              className="btn"
              disabled={exporting !== undefined}
              title={
                format === 'png'
                  ? 'Download the drawing as a picture, with a header: start → end, Installed or the plan, the date'
                  : 'Download one PDF page: the drawing and the walk'
              }
              onClick={() => onExport(format)}
            >
              {exporting === format ? 'Exporting…' : format.toUpperCase()}
            </button>
          ))}
        </>
      )}
      {exportError && (
        <span role="alert" className="inline-error">
          {exportError}
        </span>
      )}
    </header>
  )
}
