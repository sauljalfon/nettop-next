import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  getStraightPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeProps,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import {
  createContext,
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { Route, Snapshot } from '../../shared/types'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import { routeMarks } from '../physical/inventory'
import { OPENER, useInlineDialog } from '../planning/useInlineDialog'
import RouteDiagram from '../paths/RouteDiagram'
import type { Sheet } from '../paths/sheet'
import { fitViewport } from './center'
import { buildFocus } from './focus'
import {
  projectFocus,
  type FocusCardNode,
  type FocusCenterNode,
  type FocusEndsNode,
  type FocusFlowNode,
  type FocusGroupNode,
  type FocusIncoming,
  type FocusLabel,
  type FocusLineData,
  type PanelCircuit,
  type StepPiece,
} from './focusFlow'
import { focusLayout } from './focusLayout'
import { mapSession, type MapSession } from './mapSession'
import NetworkBadge from './NetworkBadge'
import { colorOf, networkColors } from './networkColors'
import { indexSnapshot, type SnapshotIndex } from './snapshotIndex'
import { visibleArea } from './viewArea'
import './map.css'

/** Focus is the readable view: the fit never shrinks it (text stays at 11px or more, D33); a wider focus pans. */
const FIT = { padding: 40, minZoom: 1, maxZoom: 1.2 }
/** Handles are points at the card's centre, so a line runs exactly between centres. */
const POINT = { width: 0, height: 0, minWidth: 0, minHeight: 0 }

const Actions = createContext<{
  onFocus: (equipmentId: string) => void
  onSelect: (equipmentId: string) => void
  onToggleGroup: (key: string) => void
  onOpenLine: (edgeId: string) => void
}>({
  onFocus: () => undefined,
  onSelect: () => undefined,
  onToggleGroup: () => undefined,
  onOpenLine: () => undefined,
})
const Names = createContext<{
  colors: ReadonlyMap<string, string>
  networkName: (id: string) => string
}>({ colors: new Map(), networkName: (id) => id })

const Handles = () => (
  <>
    <Handle
      type="target"
      position={Position.Top}
      className="overview-handle"
      style={POINT}
      isConnectable={false}
    />
    <Handle
      type="source"
      position={Position.Top}
      className="overview-handle"
      style={POINT}
      isConnectable={false}
    />
  </>
)

/** The center (large) or a neighbour (smaller): what the equipment is and where it is. */
const EquipmentCard = memo(function EquipmentCard({
  data,
  center,
}: {
  data: FocusCardNode['data']
  center: boolean
}) {
  const { onFocus, onSelect } = useContext(Actions)
  const { colors, networkName } = useContext(Names)
  return (
    <article
      className={`focus-card${center ? ' center' : ''}${data.proposed ? ' proposed' : ''}${data.dimmed ? ' dimmed' : ''}${data.selected ? ' selected' : ''}${data.onRoute ? ' on-route' : ''}`}
      data-equipment-id={data.equipmentId}
      data-side={data.side}
      data-on-route={data.onRoute}
      style={{ height: data.height }}
    >
      <Handles />
      <button
        type="button"
        className="focus-card-body"
        onClick={() => {
          if (!center) onFocus(data.equipmentId)
          onSelect(data.equipmentId)
        }}
      >
        <span className="focus-card-top">
          <strong className="focus-card-name">
            <Name text={data.name} />
          </strong>
          {data.proposed && <Chip kind="proposed">Proposed</Chip>}
        </span>
        <span className="focus-card-tags">
          <Chip kind="role">{data.role}</Chip>
          {data.networkId && (
            <NetworkBadge
              name={networkName(data.networkId)}
              color={colorOf(colors, data.networkId)}
            />
          )}
        </span>
        <span className="focus-card-place">
          <PlacePath parts={data.place} />
          <span className="num"> U{data.unit}</span>
        </span>
      </button>
      <IncomingRows rows={data.incoming} />
    </article>
  )
})
const CenterView = memo(function CenterView({
  data,
}: NodeProps<FocusCenterNode>) {
  return <EquipmentCard data={data} center />
})
const CardView = memo(function CardView({ data }: NodeProps<FocusCardNode>) {
  return <EquipmentCard data={data} center={false} />
})

/** More neighbours than fit: one card per node and side; open, a scrollable list of its members. */
const GroupView = memo(function GroupView({ data }: NodeProps<FocusGroupNode>) {
  const { onFocus, onSelect, onToggleGroup } = useContext(Actions)
  return (
    <article
      className={`focus-card focus-group${data.open ? ' open' : ''}${data.onRoute ? ' on-route' : ''}`}
      data-group-node={data.nodeId ?? ''}
      data-side={data.side}
      data-on-route={data.onRoute}
      style={data.open ? undefined : { height: data.height }}
    >
      <Handles />
      <button
        type="button"
        className="focus-card-body"
        aria-expanded={data.open}
        onClick={() => onToggleGroup(data.key)}
      >
        <strong className="focus-card-name">
          {data.nodeName ? <Name text={data.nodeName} /> : 'No node'}
        </strong>
        <span className="focus-card-place">
          {data.count} {data.count === 1 ? 'switch' : 'switches'}
        </span>
      </button>
      <IncomingRows rows={data.incoming} />
      {data.open && (
        <ul className="focus-group-list nodrag nopan nowheel">
          {data.members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="overview-row"
                onClick={() => {
                  onFocus(m.id)
                  onSelect(m.id)
                }}
              >
                <Name text={m.name} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
})

const StepsText = ({ steps }: { steps: readonly StepPiece[] }) => (
  <>
    {steps.map((s, i) => (
      <Fragment key={i}>
        {i > 0 && ' · '}
        <span className="focus-step">
          <Name text={s.name} /> <span className="num">{s.place}</span>
        </span>
      </Fragment>
    ))}
  </>
)

/** The lines of a row, one per element: "via" and each step, "+N more", "direct" or "N circuits". */
function RowLines({ label }: { label: FocusLabel }) {
  if (label.kind === 'direct')
    return <span className="focus-via-line">direct</span>
  if (label.kind === 'count')
    return <span className="focus-via-line">{label.count} circuits</span>
  return (
    <>
      <span className="focus-via-line">via</span>
      {label.steps.map((step, i) => (
        <span key={i} className="focus-via-line focus-step">
          <Name text={step.name} /> <span className="num">{step.place}</span>
        </span>
      ))}
      {label.more > 0 && (
        <span className="focus-via-line">+{label.more} more</span>
      )}
    </>
  )
}

/**
 * What the lines that end at a card say, one row each: where each comes from
 * (with two or more) and its via steps. With circuits a row is the button that
 * opens the line's circuit panel; a group's row only says.
 */
function IncomingRows({ rows }: { rows: readonly FocusIncoming[] }) {
  const { onOpenLine } = useContext(Actions)
  if (rows.length === 0) return null
  return (
    <div className="focus-rows">
      {rows.map((row) => {
        const className = `focus-via nodrag nopan${row.onRoute ? ' on-route' : ''}`
        const key = row.lineId.slice('line:'.length)
        const content = (
          <>
            {rows.length > 1 && (
              <span className="focus-via-line focus-via-parent">
                <Name text={row.parentName} />
              </span>
            )}
            <RowLines label={row.label} />
          </>
        )
        return row.hasCircuits ? (
          <button
            key={row.lineId}
            type="button"
            className={className}
            data-on-route={row.onRoute}
            data-line={key}
            {...{ [OPENER]: row.lineId }}
            onClick={() => onOpenLine(row.lineId)}
          >
            {content}
          </button>
        ) : (
          <span
            key={row.lineId}
            className={className}
            data-on-route={row.onRoute}
            data-line={key}
          >
            {content}
          </span>
        )
      })}
    </div>
  )
}

/** The circuits ending before active equipment, under the center card. */
const EndsView = memo(function EndsView({ data }: NodeProps<FocusEndsNode>) {
  return (
    <section
      className="focus-ends nodrag nopan"
      aria-label="Circuits that end before active equipment"
    >
      <h3 className="section-title">
        Circuits that end before active equipment
      </h3>
      <ul>
        {data.rows.map((row) => (
          <li key={row.port.id}>
            <span className="focus-end-port">{row.port.label}</span>
            {row.via.length > 0 && (
              <>
                {' via '}
                <StepsText steps={row.via} />
              </>
            )}
            {' · '}
            {row.end.kind === 'free' ? 'free at ' : 'ends at '}
            <Name text={row.end.equipment} />{' '}
            <span className="num">{row.end.place}</span>
            {row.end.side && ` ${row.end.side}`}
          </li>
        ))}
      </ul>
    </section>
  )
})

/** A line between two cards. It carries no text; a drawing aid that never feeds a trace. */
function FocusLine(props: EdgeProps) {
  const [path] = getStraightPath(props)
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={props.style}
      interactionWidth={20}
    />
  )
}

const nodeTypes = {
  focusCenter: CenterView,
  focusCard: CardView,
  focusGroup: GroupView,
  focusEnds: EndsView,
}
const edgeTypes = { focusLine: FocusLine }

/** The small panel listing a line's circuits, with Find AGG / BB from each start port. */
function CircuitPanel({
  circuits,
  from,
  to,
  openerKey,
  onClose,
  onPort,
}: {
  circuits: readonly PanelCircuit[]
  from: string
  to: string
  openerKey: string
  onClose: () => void
  onPort: (endpointId: string) => void
}) {
  const dialog = useInlineDialog<HTMLDivElement>(onClose, openerKey)
  return (
    <div
      {...dialog}
      className="focus-panel"
      role="dialog"
      aria-label={`Circuits between ${from} and ${to}`}
    >
      <h3 className="section-title">
        Circuits · <Name text={from} /> ↔ <Name text={to} />
      </h3>
      <ul>
        {circuits.map((c) => (
          <li key={c.start.id}>
            <span className="focus-circuit-ports">
              <Name text={c.start.equipment} />{' '}
              <span className="num">{c.start.label}</span>
              {' → '}
              <Name text={c.end.equipment} />{' '}
              <span className="num">{c.end.label}</span>
            </span>
            <span className="focus-circuit-via">
              {c.via.length > 0 ? <StepsText steps={c.via} /> : 'direct'}
            </span>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                onPort(c.start.id)
                onClose()
              }}
            >
              {/* One child: the button's flex gap would widen the space before the port. */}
              <span>
                Find AGG / BB from <Name text={c.start.label} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn quiet" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

export interface FocusProps {
  snapshot: Snapshot
  index?: SnapshotIndex
  /** Equipment of the installed topology; one outside it is proposed. */
  installedIds?: ReadonlySet<string>
  selected: string
  networkId?: string
  onSelect: (equipmentId: string) => void
  /** Find AGG / BB from one exact endpoint. */
  onPort: (endpointId: string) => void
  /** The selected route: its equipment and lines are lit, nothing moves. */
  route?: Route
  routeSheet?: Sheet
  onRouteStep?: (endpointId: string) => void
  session?: MapSession
}

export default function FocusCanvas(props: FocusProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

function Canvas({
  snapshot,
  index: givenIndex,
  installedIds,
  selected,
  networkId,
  onSelect,
  onPort,
  route,
  routeSheet,
  onRouteStep,
  session = mapSession,
}: FocusProps) {
  const flow = useReactFlow()
  const ownIndex = useMemo(
    () => (givenIndex ? undefined : indexSnapshot(snapshot)),
    [givenIndex, snapshot],
  )
  const index = (givenIndex ?? ownIndex)!
  const focusId = useSyncExternalStore(session.subscribe, session.focusId) ?? ''
  const hops = useSyncExternalStore(session.subscribe, session.hops)
  const openGroups = useSyncExternalStore(session.subscribe, session.openGroups)
  const routeViewOn = useSyncExternalStore(session.subscribe, session.routeView)
  const active = routeViewOn && !!routeSheet
  useEffect(() => {
    if (routeViewOn && !routeSheet) session.setRouteView(false)
  }, [routeViewOn, routeSheet, session])
  const colors = useMemo(
    () => networkColors(snapshot.networks),
    [snapshot.networks],
  )
  const networkName = useCallback(
    (id: string) => snapshot.networks.find((n) => n.id === id)?.name ?? id,
    [snapshot.networks],
  )
  const names = useMemo(() => ({ colors, networkName }), [colors, networkName])

  // A location highlight changes nothing here; its fit request is not left for
  // the overview to replay later.
  const fitRequest = useSyncExternalStore(session.subscribe, session.fitRequest)
  useEffect(() => {
    if (fitRequest && fitRequest.serial > session.fitHandled())
      session.markFitHandled(fitRequest.serial)
  }, [fitRequest, session])

  const known = index.equipment.has(focusId)
  const focus = useMemo(
    () => buildFocus(index, focusId, { hops }),
    [index, focusId, hops],
  )
  const layout = useMemo(() => focusLayout(index, focus), [index, focus])
  const marks = useMemo(() => routeMarks(index, route), [index, route])
  const projected = useMemo(
    () =>
      projectFocus({
        index,
        focus,
        layout,
        selected,
        networkId,
        colors,
        installedIds,
        openGroups,
        marks,
      }),
    [
      index,
      focus,
      layout,
      selected,
      networkId,
      colors,
      installedIds,
      openGroups,
      marks,
    ],
  )

  // Local node state carries React Flow's measurements; a refetch only
  // reconciles it by ID.
  const [nodes, setNodes] = useState<FocusFlowNode[]>(projected.nodes)
  useEffect(() => {
    setNodes((previous) => {
      const prior = new Map(previous.map((n) => [n.id, n]))
      return projected.nodes.map((n) => ({
        ...n,
        measured: prior.get(n.id)?.measured,
      }))
    })
  }, [projected.nodes])
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const onNodesChange = useCallback(
    (changes: NodeChange<FocusFlowNode>[]) =>
      setNodes((previous) => applyNodeChanges(changes, previous)),
    [],
  )

  // Fit once per focus and per hop count (not on a refetch): the whole Focus
  // inside what the drawers and overlays leave free, between zoom 0.6 and 1.2.
  const surface = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const [fitted, setFitted] = useState(false)
  const fitVisible = useCallback(() => {
    cancelAnimationFrame(frame.current)
    let frames = 0
    const attempt = () => {
      const where = visibleArea(surface.current)
      const all = nodesRef.current.map((n) => flow.getInternalNode(n.id))
      if (where && all.length && all.every((c) => c?.measured.width)) {
        const xs = all.flatMap((c) => [
          c!.internals.positionAbsolute.x,
          c!.internals.positionAbsolute.x + c!.measured.width!,
        ])
        const ys = all.flatMap((c) => [
          c!.internals.positionAbsolute.y,
          c!.internals.positionAbsolute.y + (c!.measured.height ?? 0),
        ])
        const bounds = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        }
        void flow
          .setViewport(fitViewport(bounds, where.box, where.covers, FIT))
          .then(() => setFitted(true))
        return
      }
      if (all.length === 0 || ++frames >= 120) return setFitted(true)
      frame.current = requestAnimationFrame(attempt)
    }
    // Two frames first: the nodes of a new focus have just been replaced.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(attempt)
    })
  }, [flow])
  const fitKey = `${focusId}|${hops}`
  useEffect(() => {
    if (known) fitVisible()
    else setFitted(true)
    return () => cancelAnimationFrame(frame.current)
  }, [fitKey, known, fitVisible])

  useEffect(() => {
    const map = surface.current?.querySelector<HTMLElement>('.react-flow')
    if (map) map.inert = active
  }, [active])

  // The line whose circuit panel is open.
  const [openLine, setOpenLine] = useState<string>()
  useEffect(() => setOpenLine(undefined), [focusId, hops])
  const line = projected.edges.find((e) => e.id === openLine)
  const lineData = line?.data as FocusLineData | undefined
  const nameOf = (id: string) => index.equipment.get(id)?.name ?? id

  const actions = useMemo(
    () => ({
      onFocus: (id: string) => session.focusOn(id),
      onSelect,
      onToggleGroup: session.toggleGroup,
      onOpenLine: (id: string) => setOpenLine(id),
    }),
    [session, onSelect],
  )
  const lastEmpty = known && focus.rings.length < hops
  const centerName = nameOf(focusId)
  const empty = known && focus.rings.length === 0 && focus.ends.length === 0

  return (
    <div
      className="flow-surface focus-surface"
      ref={surface}
      data-view="focus"
      data-focus-id={focusId}
      data-hops={hops}
      data-route-view={active}
    >
      {known && (
        <Names.Provider value={names}>
          <Actions.Provider value={actions}>
            <ReactFlow<FocusFlowNode>
              nodes={nodes}
              edges={projected.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              nodesDraggable={false}
              nodesConnectable={false}
              deleteKeyCode={null}
              elevateNodesOnSelect={false}
              minZoom={0.2}
              maxZoom={1.6}
              className={fitted ? undefined : 'overview-hidden'}
            >
              <Background
                variant={BackgroundVariant.Dots}
                color="var(--rule)"
                gap={20}
                size={1.2}
              />
              {!active && <Controls showInteractive={false} />}
            </ReactFlow>
          </Actions.Provider>
        </Names.Provider>
      )}
      {!active && (
        <>
          <div className="focus-toolbar">
            <button type="button" className="btn" onClick={session.back}>
              ‹ Overview
            </button>
            {known && (
              <>
                <span className="focus-hops">Hops: {hops}</span>
                <button
                  type="button"
                  className="btn"
                  disabled={hops <= 1}
                  onClick={() => session.setHops(hops - 1)}
                >
                  −1 hop
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={hops >= 3 || lastEmpty}
                  onClick={() => session.setHops(hops + 1)}
                >
                  +1 hop
                </button>
                {lastEmpty && (
                  <span className="focus-nothing">Nothing further</span>
                )}
              </>
            )}
          </div>
        </>
      )}
      {!known && (
        <p className="overview-empty">{focusId} is not in this topology.</p>
      )}
      {empty && (
        <p className="focus-empty">
          No cables on <Name text={centerName} />.
        </p>
      )}
      {!active && lineData && line && (
        <CircuitPanel
          key={line.id}
          circuits={lineData.circuits}
          from={nameOf(lineData.from)}
          to={nameOf(lineData.to)}
          openerKey={line.id}
          onClose={() => setOpenLine(undefined)}
          onPort={onPort}
        />
      )}
      {active && routeSheet && (
        <div className="route-layer" data-testid="route-layer">
          <RouteDiagram
            key={`${routeSheet.title.from.equipmentId}:${routeSheet.title.from.port}>${routeSheet.end.at?.equipmentId}:${routeSheet.end.at?.port}`}
            sheet={routeSheet}
            onStep={onRouteStep ?? (() => undefined)}
          />
        </div>
      )}
    </div>
  )
}
