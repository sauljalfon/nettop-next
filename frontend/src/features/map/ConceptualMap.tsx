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
  NodeToolbar,
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
import {
  connectionCaption,
  connectionEntries,
  searchConnections,
  type ConnectionEntry,
} from './connections'
import { facetStart } from './facets'
import { projectMap, type MapCardData, type MapFlowEdge } from './mapGraph'
import { indexSnapshot, type SnapshotIndex } from './snapshotIndex'
import { mapSession, type MapSession } from './mapSession'
import { ClearHighlight, ResetLayout } from './MapControls'
import { reconciledPosition } from './reconcile'
import { SPLIT_GAP, splitPath } from './splitPath'
import { shouldClearOnEscape } from './keys'
import { stackIndex } from './stacking'
import { useViewRequests } from './useViewRequests'
import './map.css'

type CardNode = Node<MapCardData, 'equipment'>
type PreviewNode = Node<{ name: string; onConfigure: () => void }, 'preview'>
type MapNode = CardNode | PreviewNode

const Actions = createContext<{
  onPort: (id: string) => void
  onTraceDevice: (id: string) => void
  onToggleManual: (equipmentId: string, key: string) => void
  /** Splits a pair's parallel cables into separate lines, or joins them again. */
  onToggleSplit: (pairKey: string) => void
  /** Cards whose connections popover is open. */
  openLists: ReadonlySet<string>
  onToggleList: (equipmentId: string) => void
  /** Cabled ports or positions of an equipment; computed when a list opens. */
  entriesOf: (equipmentId: string) => ConnectionEntry[]
  /** Network label for an entry on another network than the active filter. */
  captionOf: (entry: ConnectionEntry) => string | undefined
}>({
  onPort: () => undefined,
  onTraceDevice: () => undefined,
  onToggleManual: () => undefined,
  onToggleSplit: () => undefined,
  openLists: new Set(),
  onToggleList: () => undefined,
  entriesOf: () => [],
  captionOf: () => undefined,
})

function Connections({
  equipmentId,
  name,
  manualKeys,
}: {
  equipmentId: string
  name: string
  manualKeys: readonly string[]
}) {
  const { entriesOf, captionOf, onToggleManual } = useContext(Actions)
  const [query, setQuery] = useState('')
  const entries = useMemo(
    () => entriesOf(equipmentId),
    [entriesOf, equipmentId],
  )
  const shown = searchConnections(entries, query)
  return (
    <div
      className="map-connections nodrag nowheel"
      // The popover is a React child of its card: keep its clicks from selecting it.
      onClick={(event) => event.stopPropagation()}
    >
      <input
        aria-label={`Search ${name} connections`}
        placeholder="Search, e.g. 3C/5"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul aria-label={`${name} connections`}>
        {shown.map((entry) => {
          const caption = captionOf(entry)
          return (
            <li key={entry.key}>
              <label>
                <input
                  type="checkbox"
                  checked={manualKeys.includes(entry.key)}
                  onChange={() => onToggleManual(equipmentId, entry.key)}
                />
                <span>{entry.label}</span>
                {caption && <small className="badge">{caption}</small>}
              </label>
            </li>
          )
        })}
      </ul>
      {!shown.length && (
        <p className="muted">
          {entries.length ? 'No match.' : 'Nothing is cabled yet.'}
        </p>
      )}
    </div>
  )
}

const EquipmentCard = memo(function EquipmentCard({
  id,
  data,
  selected,
}: NodeProps<CardNode>) {
  const { onPort, onTraceDevice, openLists, onToggleList } = useContext(Actions)
  const listOpen = openLists.has(id)
  // A route change can swap facets without changing the card's size, so the
  // size observer never fires; tell React Flow to re-read this card's handles.
  const updateNodeInternals = useUpdateNodeInternals()
  const handles = data.facets.flatMap((f) => f.endpointIds).join('|')
  useEffect(() => {
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
      <div className="equipment-heading">
        <span className="equipment-icon">
          <Icon size={21} />
        </span>
        <span className={`badge ${data.proposed ? 'green' : ''}`}>
          {data.proposed ? 'PROPOSED' : e.role}
        </span>
      </div>
      <h3>{e.name}</h3>
      <p className="map-location">{data.location}</p>
      <p className="map-summary">
        {summary.cabled} of {summary.total} cabled
      </p>
      {data.badges.length > 0 && (
        <p className="map-badges">
          {data.badges.map((b, i) => (
            <span
              className="badge network-badge"
              key={b}
              style={{
                color: data.badgeColors[i],
                background: `${data.badgeColors[i]}1f`,
              }}
            >
              {b}
            </span>
          ))}
        </p>
      )}
      <div className="map-card-actions">
        <button
          className="nodrag"
          aria-expanded={listOpen}
          aria-label={`Show connections of ${e.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onToggleList(id)
          }}
        >
          Show connections
        </button>
        {selected && e.kind === 'switch' && (
          <button
            className="nodrag"
            aria-label={`Find AGG / BB from all ports of ${e.name}`}
            onClick={(event) => {
              event.stopPropagation()
              onTraceDevice(e.id)
            }}
          >
            Find AGG / BB
          </button>
        )}
      </div>
      {/* A floating popover: it never changes the card's size. */}
      <NodeToolbar
        isVisible={listOpen}
        position={Position.Bottom}
        align="start"
        offset={6}
      >
        <Connections
          equipmentId={e.id}
          name={e.name}
          manualKeys={data.manualKeys}
        />
      </NodeToolbar>
      {data.facets.length > 0 && (
        <ul className="map-facets" aria-label={`${e.name} shown connections`}>
          {data.facets.map((f) => (
            <li className="map-facet-row" key={f.key}>
              <button
                data-source={[f.automatic && 'auto', f.manual && 'manual']
                  .filter(Boolean)
                  .join(' ')}
                className={`nodrag map-facet ${f.automatic ? 'auto' : ''} ${f.manual ? 'manual' : ''}`}
                aria-label={`${e.name} ${f.label}, find AGG / BB from here`}
                onClick={(event) => {
                  event.stopPropagation()
                  onPort(facetStart(f))
                }}
              >
                <span className="map-facet-label">{f.label}</span>
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
const ROUTE_COLOR = '#108b79'
const HIGHLIGHT_COLOR = '#e09a00'

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
  const text = color === HIGHLIGHT_COLOR ? '#3a2a00' : '#fff'
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
            {props.label}
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
  return data?.color ?? '#9bacc0'
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
  /** Presentation filter; undefined is All networks. */
  networkId?: string
  onSelect: (id: string) => void
  /** Find AGG / BB from one exact port or position endpoint. */
  onPort: (id: string) => void
  /** Find AGG / BB from every port of an active device. */
  onTraceDevice: (id: string) => void
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
}

export default function ConceptualMap(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

const FIT = { padding: 0.18, maxZoom: 1 }

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
  networkId,
  onSelect,
  onPort,
  onTraceDevice,
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
  const edges = useMemo(() => graph.edges.map(flowEdge), [graph.edges])
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
        return {
          ...n,
          position: reconciledPosition(prior?.position, n.position, reset),
          measured: prior?.measured,
        }
      })
    })
    if (reset) setFitToken((t) => t + 1)
  }, [graph.nodes, layoutVersion])
  useEffect(() => {
    if (fitToken === 0) return
    void flow.fitView(FIT).then(() => session.setViewport(flow.getViewport()))
  }, [fitToken])
  const surface = useRef<HTMLDivElement>(null)
  useViewRequests(session, surface, nodes)
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
  const [openLists, setOpenLists] = useState<ReadonlySet<string>>(new Set())
  const toggleList = useCallback(
    (id: string) =>
      setOpenLists((previous) => {
        const next = new Set(previous)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    [],
  )
  const onNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) =>
      setNodes((previous) => applyNodeChanges(changes, previous)),
    [],
  )
  const rendered = useMemo(() => {
    const cards: MapNode[] = nodes.map((n) => ({
      ...n,
      selected: n.id === selected,
      zIndex:
        n.type === 'equipment'
          ? stackIndex({
              selected: n.id === selected,
              popoverOpen: openLists.has(n.id),
              facets: n.data.facets.length,
            })
          : undefined,
    }))
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
  }, [nodes, selected, openLists, preview, onConfigurePreview])
  const entriesOf = useCallback(
    (id: string) => connectionEntries(index, id),
    [index],
  )
  const captionOf = useCallback(
    (entry: ConnectionEntry) =>
      connectionCaption(entry, networkId, snapshot.networks),
    [networkId, snapshot.networks],
  )
  const actions = useMemo(
    () => ({
      onPort,
      onTraceDevice,
      onToggleManual: session.toggleManual,
      onToggleSplit: session.toggleSplit,
      openLists,
      onToggleList: toggleList,
      entriesOf,
      captionOf,
    }),
    [
      onPort,
      onTraceDevice,
      session,
      openLists,
      toggleList,
      entriesOf,
      captionOf,
    ],
  )

  return (
    <div
      className="flow-surface"
      ref={surface}
      // The projection's own IDs: tests and tools read these instead of counting
      // what React Flow happens to have drawn inside the current viewport.
      data-cards={graph.marks.cards.join(' ')}
      data-route-links={graph.marks.routeLinks.join(' ')}
      data-route-cards={graph.marks.routeCards.join(' ')}
      data-highlight-links={graph.marks.highlightLinks.join(' ')}
      data-highlight-cards={graph.marks.highlightCards.join(' ')}
      data-highlight-neighbors={graph.marks.highlightNeighbors.join(' ')}
      data-dimmed-cards={graph.marks.dimmedCards.join(' ')}
      data-split-pairs={graph.marks.splitPairs.join(' ')}
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
            void flow.fitView(FIT).then(() => {
              if (session.needsFit()) session.setViewport(flow.getViewport())
            })
          }}
          onMoveEnd={(_, viewport) => session.setViewport(viewport)}
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
          <Background color="#ccd5df" gap={24} size={1} />
          <Controls showInteractive={false} />
          <Panel position="top-right" className="map-tools">
            {highlight && (
              <ClearHighlight onClear={() => session.setHighlight(undefined)} />
            )}
            <ResetLayout onReset={session.resetLayout} />
          </Panel>
        </ReactFlow>
      </Actions.Provider>
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
