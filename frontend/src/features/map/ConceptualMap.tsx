import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  EdgeLabelRenderer,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import { GitFork, Network, PanelTop, Plus } from 'lucide-react'
import { isPassiveEquipment } from '../../shared/equipment'
import type { Route, Snapshot } from '../../shared/types'
import { facetStart } from './facets'
import NetworkBadge from './NetworkBadge'
import { projectMap, type MapCardData, type MapFlowEdge } from './mapGraph'
import { fitViewport } from './center'
import { sameCardData, sameEdge } from './reuse'
import { visibleArea } from './viewArea'
import { indexSnapshot, type SnapshotIndex } from './snapshotIndex'
import { mapSession, type MapSession, type Viewport } from './mapSession'
import RouteDiagram from '../paths/RouteDiagram'
import type { Sheet } from '../paths/sheet'
import { ClearHighlight, MapViewSwitch, ResetLayout } from './MapControls'
import FocusCanvas from './FocusCanvas'
import OverviewCanvas from './OverviewCanvas'
import { reconciledPosition } from './reconcile'
import { SPLIT_GAP, splitPath } from './splitPath'
import { shouldClearOnEscape } from './keys'
import { stackIndex } from './stacking'
import { useViewRequests } from './useViewRequests'
import './map.css'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import { cardRoleLabel } from './cardRole'
import PlacePath from '../../shared/ui/PlacePath'

type CardNode = Node<MapCardData, 'equipment'>
type PreviewNode = Node<{ name: string; onConfigure: () => void }, 'preview'>
type MapNode = CardNode | PreviewNode

const Actions = createContext<{
  onPort: (id: string) => void
  /** Splits a pair's parallel cables into separate lines, or joins them again. */
  onToggleSplit: (pairKey: string) => void
}>({
  onPort: () => undefined,
  onToggleSplit: () => undefined,
})

const EquipmentCard = memo(function EquipmentCard({
  id,
  data,
  selected,
}: NodeProps<CardNode>) {
  const { onPort } = useContext(Actions)
  // A route change can swap facets without changing the card's size, so the
  // size observer never fires; tell React Flow to re-read this card's handles.
  // Not on mount: React Flow measures a new card itself, in one batch with the
  // others. One call per card made a 1,500-card map re-render 1,500 times.
  const updateNodeInternals = useUpdateNodeInternals()
  const handles = data.facets.flatMap((f) => f.endpointIds).join('|')
  const measuredHandles = useRef(handles)
  useEffect(() => {
    if (measuredHandles.current === handles) return
    measuredHandles.current = handles
    updateNodeInternals(id)
  }, [id, handles, updateNodeInternals])
  const { equipment: e, summary } = data
  const Icon = isPassiveEquipment(e)
    ? PanelTop
    : e.role === 'aggregation'
      ? GitFork
      : Network
  return (
    <article
      className={`equipment-card map-card ${data.highlighted ? 'traced' : ''} ${data.highlightRole === 'card' ? 'hl' : data.highlightRole === 'neighbor' ? 'hl-neighbor' : ''} ${data.dimmed ? 'dimmed' : ''} ${selected ? 'selected' : ''} ${data.proposed ? 'proposed' : ''}`}
    >
      <div className="card-top">
        <span className="card-kind">
          <Icon size={14} />
        </span>
        <h3 className="card-name">
          <Name text={e.name} />
        </h3>
        {data.proposed ? (
          <Chip kind="proposed">Proposed</Chip>
        ) : (
          <span className="card-role">{cardRoleLabel(e)}</span>
        )}
      </div>
      <p className="map-location">
        <PlacePath parts={data.place} />
      </p>
      <div className="card-foot">
        <p className="map-badges">
          {data.badges.map((b, i) => (
            <NetworkBadge key={b} name={b} color={data.badgeColors[i]} />
          ))}
        </p>
        <p className="map-summary">
          <span className="num">{summary.cabled}</span> of{' '}
          <span className="num">{summary.total}</span> cabled
        </p>
      </div>
      {data.facets.length > 0 && (
        <ul className="map-facets" aria-label={`${e.name} shown connections`}>
          {data.facets.map((f) => (
            <li className="map-facet-row" key={f.key}>
              <button
                data-source={[f.automatic && 'auto', f.manual && 'manual']
                  .filter(Boolean)
                  .join(' ')}
                className={`nodrag map-facet chip ${f.automatic ? 'route auto' : ''} ${f.manual ? 'manual' : ''}`}
                aria-label={`${e.name} ${f.label}, find AGG / BB from here`}
                onClick={(event) => {
                  event.stopPropagation()
                  onPort(facetStart(f))
                }}
              >
                <span className="map-facet-label">
                  <Name text={f.label} />
                </span>
                {f.automatic && <small>route</small>}
                {f.manual && <small>pinned</small>}
              </button>
              {f.endpointIds.map((id) => (
                <span key={id}>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={id}
                    isConnectable={false}
                  />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={id}
                    isConnectable={false}
                  />
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="summary"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="summary"
        isConnectable={false}
      />
    </article>
  )
})

const Preview = memo(function Preview({ data }: NodeProps<PreviewNode>) {
  return (
    <button className="unplaced-card nodrag" onClick={data.onConfigure}>
      <Plus size={24} />
      <strong>New {data.name}</strong>
      <span>Unplaced · not saved</span>
      <small>Click to assign a rack and configure</small>
    </button>
  )
})
/** Opacity of a faded card or line. */
const DIM = 0.3
const ROUTE_COLOR = 'var(--route)'
const HIGHLIGHT_COLOR = 'var(--amber)'

/**
 * A cable line. Highlighted and traced at once: the teal route line keeps its
 * place and the amber highlight shows as a wider outline beneath it. A faded
 * line (something else is highlighted) is dimmed; the route is never faded.
 * Several cables are one line with a count pill that splits it; a split line
 * is offset from its siblings and labeled with its cable ID.
 */
function MapEdge(props: EdgeProps) {
  const { onToggleSplit } = useContext(Actions)
  const [hover, setHover] = useState(false)
  const data = props.data as MapFlowEdge['data'] | undefined
  const offset = data?.split
    ? (data.splitIndex - (data.splitCount - 1) / 2) * SPLIT_GAP
    : 0
  // A split line starts and ends on the handles like the joined line; only its middle fans out.
  const [path, labelX, labelY] = data?.split
    ? splitPath(
        props.sourceX,
        props.sourceY,
        props.targetX,
        props.targetY,
        data.splitIndex,
        data.splitCount,
      )
    : getBezierPath(props)
  const color = edgeColor(data)
  const ids = data?.linkIds.join(' ')
  const faded = data?.dimmed ? { opacity: DIM } : undefined
  const joined = !!data?.pairKey && !data.split
  const text = color === HIGHLIGHT_COLOR ? 'var(--amber-ink)' : 'var(--paper)'
  // The labels are portaled but still React children of the edge: keep their
  // clicks from reaching the edge's own click, which would toggle twice.
  const toggle = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (data?.pairKey) onToggleSplit(data.pairKey)
  }
  const stop = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  }
  return (
    <>
      <g data-cable-ids={ids} style={faded} {...stop}>
        {data?.highlight && data.highlighted && (
          <path d={path} className="hl-outline" fill="none" />
        )}
        <BaseEdge
          id={props.id}
          path={path}
          style={props.style}
          interactionWidth={20}
        />
      </g>
      <EdgeLabelRenderer>
        {props.label && !data?.split && (
          <span
            className="map-caption nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + (joined && data.count > 1 ? 24 : -28)}px)`,
              ...faded,
            }}
          >
            <Name text={String(props.label)} />
          </span>
        )}
        {joined && data.count > 1 && (
          <button
            className="map-pill nodrag nopan"
            data-cable-ids={ids}
            aria-label={`Split ${data.count} cables: ${ids}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: color,
              color: text,
              ...faded,
            }}
            onClick={toggle}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            {...stop}
          >
            {data.count}
          </button>
        )}
        {hover && joined && data.count > 1 && (
          <div
            role="tooltip"
            className="map-tooltip nodrag nopan"
            data-cable-ids={ids}
            style={{
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 16}px)`,
            }}
          >
            {data.linkIds.map((id) => (
              <div key={id}>{id}</div>
            ))}
          </div>
        )}
        {data?.split && (
          <span
            className="map-cable-label nodrag nopan"
            data-cable-id={data.linkIds[0]}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: color,
              ...faded,
            }}
          >
            {data.linkIds[0]}
          </span>
        )}
        {data?.split && data.splitIndex === 0 && (
          <button
            className="map-join nodrag nopan"
            data-pair-join={data.pairKey}
            aria-label={`Join ${data.splitCount} cables`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - (data.splitCount * SPLIT_GAP) / 2 - 14 + offset * -1}px)`,
              ...faded,
            }}
            onClick={toggle}
          >
            join
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

/** Route teal and highlight amber win over the network color. */
function edgeColor(data: MapFlowEdge['data'] | undefined): string {
  if (data?.highlighted) return ROUTE_COLOR
  if (data?.highlight) return HIGHLIGHT_COLOR
  return data?.color ?? 'var(--unresolved)'
}
const edgeTypes = { map: MapEdge }
const nodeTypes = {
  equipment: EquipmentCard,
  preview: Preview,
}

export interface PendingEquipment {
  token: number
  kind: 'switch' | 'panel'
  role?: 'aggregation'
  rackId: string
  unit: number
  position?: { x: number; y: number }
}
interface Props {
  snapshot: Snapshot
  installedIDs: ReadonlySet<string>
  installedLinkIDs: ReadonlySet<string>
  selected: string
  route?: Route
  /** The selected route as a walk sheet (shared with the results); the route view draws it. */
  routeSheet?: Sheet
  /** A step of the route view was clicked: open its endpoint in Physical. */
  onRouteStep?: (endpointId: string) => void
  /** Presentation filter; undefined is All networks. */
  networkId?: string
  onSelect: (id: string) => void
  /** Find AGG / BB from one exact port or position endpoint. */
  onPort: (id: string) => void
  canEdit: boolean
  onCreateEquipment: (
    kind: 'switch' | 'panel',
    rackID?: string,
    unit?: number,
    position?: { x: number; y: number },
    role?: 'aggregation',
  ) => void
  preview?: PendingEquipment
  onConfigurePreview: () => void
  /** Snapshot-only results; computed here when absent. */
  index?: SnapshotIndex
  /** Defaults to the app-wide session store. */
  session?: MapSession
  /** Containers of the installed topology: an overview node outside it is proposed. */
  installedContainerIds?: ReadonlySet<string>
}

export default function ConceptualMap(props: Props) {
  const session = props.session ?? mapSession
  const view = useSyncExternalStore(session.subscribe, session.view)
  if (view === 'focus')
    return (
      <FocusCanvas
        snapshot={props.snapshot}
        index={props.index}
        installedIds={props.installedIDs}
        selected={props.selected}
        networkId={props.networkId}
        onSelect={props.onSelect}
        onPort={props.onPort}
        route={props.route}
        routeSheet={props.routeSheet}
        onRouteStep={props.onRouteStep}
        session={session}
      />
    )
  if (view === 'overview')
    return (
      <OverviewCanvas
        snapshot={props.snapshot}
        index={props.index}
        installedContainerIds={props.installedContainerIds}
        selected={props.selected}
        networkId={props.networkId}
        onSelect={props.onSelect}
        route={props.route}
        routeSheet={props.routeSheet}
        onRouteStep={props.onRouteStep}
        session={session}
      />
    )
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

/**
 * The first fit and Reset layout's fit: the whole map when it is readable at
 * zoom 0.5 or more, otherwise the top-left part (the access layer) at 0.5 and
 * the user pans. Pixels of padding, inside the visible area.
 */
const FIT_MAP = {
  padding: 48,
  minZoom: 0.5,
  maxZoom: 1,
  anchor: 'top-left' as const,
}
/** A card's drawn size, for fitting before React Flow has measured every card. */
const CARD_FIT_WIDTH = 240
const CARD_FIT_HEIGHT = 124

function flowEdge(e: MapFlowEdge): Edge {
  const lit = e.data.highlighted
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    type: 'map',
    className:
      [e.data.highlight && 'hl', e.data.pairKey && 'map-edge-splittable']
        .filter(Boolean)
        .join(' ') || undefined,
    animated: lit,
    zIndex: 10,
    interactionWidth: 20,
    data: e.data,
    style: {
      stroke: edgeColor(e.data),
      strokeWidth:
        lit || e.data.highlight ? Math.max(3, e.data.width) : e.data.width,
      strokeDasharray: e.data.proposed ? '6 4' : undefined,
    },
  }
}

function Canvas({
  snapshot,
  installedIDs,
  installedLinkIDs,
  selected,
  route,
  routeSheet,
  onRouteStep,
  networkId,
  onSelect,
  onPort,
  canEdit,
  onCreateEquipment,
  preview,
  onConfigurePreview,
  index: givenIndex,
  session = mapSession,
}: Props) {
  const flow = useReactFlow<MapNode>()
  // Snapshot-only work is done once per snapshot; route, filter and manual
  // facets only redo the dependent part.
  const ownIndex = useMemo(
    () => (givenIndex ? undefined : indexSnapshot(snapshot)),
    [givenIndex, snapshot],
  )
  const index = (givenIndex ?? ownIndex)!
  const manual = useSyncExternalStore(session.subscribe, session.manualFacets)
  const highlight = useSyncExternalStore(session.subscribe, session.highlight)
  const split = useSyncExternalStore(session.subscribe, session.splitPairs)
  const routeViewOn = useSyncExternalStore(session.subscribe, session.routeView)
  // The route view is a layer over the map and needs a route; the map under it
  // is never touched, so turning it off leaves exactly what was there.
  const active = routeViewOn && !!routeSheet
  useEffect(() => {
    if (routeViewOn && !routeSheet) session.setRouteView(false)
  }, [routeViewOn, routeSheet, session])
  const record = useCallback((v: Viewport) => session.setViewport(v), [session])
  const layoutVersion = useSyncExternalStore(
    session.subscribe,
    session.layoutVersion,
  )
  const graph = useMemo(
    () =>
      projectMap({
        snapshot,
        session,
        networkId,
        route,
        installedIDs,
        installedLinkIDs,
        index,
      }),
    // Manual facets and the highlight are read through the session; they are dependencies so changes re-project.
    [
      snapshot,
      session,
      networkId,
      route,
      installedIDs,
      installedLinkIDs,
      index,
      manual,
      highlight,
      split,
      layoutVersion,
    ],
  )
  // A line the projection draws the same as before stays the same object, so a
  // route change redraws only the lines it touches.
  const edgeCache = useRef(
    new Map<string, { source: MapFlowEdge; out: Edge }>(),
  )
  const edges = useMemo(() => {
    const next = new Map<string, { source: MapFlowEdge; out: Edge }>()
    const out = graph.edges.map((e) => {
      const prior = edgeCache.current.get(e.id)
      const entry =
        prior && sameEdge(prior.source, e)
          ? prior
          : { source: e, out: flowEdge(e) }
      next.set(e.id, entry)
      return entry.out
    })
    edgeCache.current = next
    return out
  }, [graph.edges])
  const cableCount = useMemo(
    () => graph.edges.reduce((n, e) => n + e.data.linkIds.length, 0),
    [graph.edges],
  )

  // Local node state carries RF's measurements and in-progress drags; a
  // refetch, filter, route or context change only reconciles it by ID.
  const [nodes, setNodes] = useState<MapNode[]>(() => [...graph.nodes])
  // A layout reset drops dragged positions and fits once, then everything else
  // (trace, pins, highlight, filter) carries on untouched.
  const appliedVersion = useRef(layoutVersion)
  const [fitToken, setFitToken] = useState(0)
  useEffect(() => {
    const reset = appliedVersion.current !== layoutVersion
    appliedVersion.current = layoutVersion
    setNodes((previous) => {
      const existing = new Map(previous.map((n) => [n.id, n]))
      return graph.nodes.map((n) => {
        const prior = existing.get(n.id)
        const position = reconciledPosition(prior?.position, n.position, reset)
        // A card drawn the same as before stays the same object: a route change
        // then re-renders only the cards it touches.
        if (
          prior &&
          prior.position.x === position.x &&
          prior.position.y === position.y &&
          prior.type === 'equipment' &&
          n.type === 'equipment' &&
          sameCardData(prior.data, n.data)
        )
          return prior
        return { ...n, position, measured: prior?.measured }
      })
    })
    if (reset) setFitToken((t) => t + 1) // a layout reset: fit the full map once
  }, [graph.nodes, layoutVersion])
  const surface = useRef<HTMLDivElement>(null)
  // Under the route view the map is not reachable: no tab stops, no clicks.
  useEffect(() => {
    const map = surface.current?.querySelector<HTMLElement>('.react-flow')
    if (map) map.inert = active
  }, [active])
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  /** Fits the whole map by its cards' positions (no measuring: off-screen cards are not drawn yet). */
  const fitMap = useCallback(() => {
    const where = visibleArea(surface.current)
    const cards = nodesRef.current.filter((n) => n.type === 'equipment')
    if (!where || cards.length === 0) return Promise.resolve(false)
    const xs = cards.flatMap((n) => [
      n.position.x,
      n.position.x + CARD_FIT_WIDTH,
    ])
    const ys = cards.flatMap((n) => [
      n.position.y,
      n.position.y + CARD_FIT_HEIGHT,
    ])
    const bounds = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
    return flow
      .setViewport(fitViewport(bounds, where.box, where.covers, FIT_MAP))
      .then(() => true)
  }, [flow])
  useEffect(() => {
    if (fitToken === 0) return
    void fitMap().then(() => record(flow.getViewport()))
  }, [fitToken])
  useViewRequests(session, surface, nodes, record)
  // Esc clears the highlight without touching the trace.
  useEffect(() => {
    if (!highlight) return
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        shouldClearOnEscape(event.target as HTMLElement | null)
      )
        session.setHighlight(undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [highlight, session])
  const onNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) =>
      setNodes((previous) => {
        // Only the cards in this state; anything else React Flow reports is ignored.
        const known = new Set(previous.map((n) => n.id))
        const mine = changes.filter((c) => !('id' in c) || known.has(c.id))
        return mine.length ? applyNodeChanges(mine, previous) : previous
      }),
    [],
  )
  const decorated = useRef(
    new WeakMap<MapNode, { selected: boolean; out: MapNode }>(),
  )
  const rendered = useMemo(() => {
    // Selecting a card, or any change to one, leaves the other cards' objects alone.
    const cards: MapNode[] = nodes.map((n) => {
      const isSelected = n.id === selected
      const kept = decorated.current.get(n)
      if (kept && kept.selected === isSelected) return kept.out
      const out: MapNode = {
        ...n,
        selected: isSelected,
        zIndex:
          n.type === 'equipment'
            ? stackIndex({ selected: isSelected, facets: n.data.facets.length })
            : undefined,
      }
      decorated.current.set(n, { selected: isSelected, out })
      return out
    })
    if (preview?.position && !preview.rackId)
      cards.push({
        id: 'unsaved-preview',
        type: 'preview',
        selected: false,
        position: preview.position,
        zIndex: 20,
        data: {
          name:
            preview.role === 'aggregation'
              ? 'aggregation switch'
              : preview.kind,
          onConfigure: onConfigurePreview,
        },
      })
    return cards
  }, [nodes, selected, preview, onConfigurePreview])
  const actions = useMemo(
    () => ({ onPort, onToggleSplit: session.toggleSplit }),
    [onPort, session],
  )

  return (
    <div
      className="flow-surface"
      ref={surface}
      // The projection's own IDs: tests and tools read these instead of counting
      // what React Flow happens to have drawn inside the current viewport.
      // A focused card is a React Flow node wrapper: Enter or Space selects it
      // (and opens the inspector) like a click. Keys on a control inside it stay its own.
      onKeyDown={(event) => {
        const target = event.target as HTMLElement
        if (
          (event.key !== 'Enter' && event.key !== ' ') ||
          !target.classList.contains('react-flow__node-equipment')
        )
          return
        event.preventDefault()
        onSelect(target.dataset.id!)
      }}
      data-cards={graph.marks.cards.join(' ')}
      data-route-links={graph.marks.routeLinks.join(' ')}
      data-route-cards={graph.marks.routeCards.join(' ')}
      data-highlight-links={graph.marks.highlightLinks.join(' ')}
      data-highlight-cards={graph.marks.highlightCards.join(' ')}
      data-highlight-neighbors={graph.marks.highlightNeighbors.join(' ')}
      data-dimmed-cards={graph.marks.dimmedCards.join(' ')}
      data-split-pairs={graph.marks.splitPairs.join(' ')}
      data-route-view={active}
    >
      <Actions.Provider value={actions}>
        <ReactFlow<MapNode>
          nodes={rendered}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgeClick={(_, edge) => {
            const pair = (edge.data as MapFlowEdge['data'] | undefined)?.pairKey
            if (pair) session.toggleSplit(pair)
          }}
          onNodeClick={(_, node) => {
            if (node.type === 'equipment') onSelect(node.id)
          }}
          onNodeDragStop={(_, node) => {
            if (node.type === 'equipment')
              session.setPosition(node.id, node.position)
          }}
          onInit={() => {
            if (!session.needsFit()) return
            void fitMap().then(() => {
              if (session.needsFit()) record(flow.getViewport())
            })
          }}
          onMoveEnd={(_, viewport) => record(viewport)}
          defaultViewport={session.viewport()}
          onDragOver={(event) => {
            if (canEdit) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={(event) => {
            if (!canEdit) return
            const payload = event.dataTransfer.getData(
              'application/x-nettop-item',
            )
            if (!payload.startsWith('new:')) return
            event.preventDefault()
            const [kind, , , role] = payload.slice(4).split(':')
            if (kind === 'switch' || kind === 'panel')
              onCreateEquipment(
                kind,
                undefined,
                undefined,
                flow.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                }),
                role === 'aggregation' ? 'aggregation' : undefined,
              )
          }}
          minZoom={0.25}
          maxZoom={1.8}
          nodesConnectable={false}
          // Stacking is ours (stackIndex): a selected card is raised with the rest.
          elevateNodesOnSelect={false}
          deleteKeyCode={null}
          onlyRenderVisibleElements
        >
          <Background gap={24} size={1} />
          {!active && <Controls showInteractive={false} />}
          <Panel position="top-right" className="map-tools">
            {!active && highlight && (
              <ClearHighlight onClear={() => session.setHighlight(undefined)} />
            )}
            {!active && (
              <MapViewSwitch view="devices" onChange={session.setView} />
            )}
            {!active && <ResetLayout onReset={session.resetLayout} />}
          </Panel>
        </ReactFlow>
      </Actions.Provider>
      {active && routeSheet && (
        <div className="route-layer" data-testid="route-layer">
          <RouteDiagram
            // Another route redraws from the left.
            key={`${routeSheet.title.from.equipmentId}:${routeSheet.title.from.port}>${routeSheet.end.at?.equipmentId}:${routeSheet.end.at?.port}`}
            sheet={routeSheet}
            onStep={onRouteStep ?? (() => undefined)}
          />
        </div>
      )}
      <div className="board-caption">
        <strong>
          {graph.nodes.length} of {snapshot.equipment.length} equipment ·{' '}
          {cableCount} cables
        </strong>
        <span>Dragging a card changes this map only, never the topology</span>
      </div>
    </div>
  )
}
