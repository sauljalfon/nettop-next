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
  getSmoothStepPath,
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
import { Crosshair, GitFork, Network, PanelTop, Plus } from 'lucide-react'
import { isPassiveEquipment } from '../../shared/equipment'
import type { Route, Snapshot } from '../../shared/types'
import {
  connectionCaption,
  connectionEntries,
  searchConnections,
  type ConnectionEntry,
} from './connections'
import { facetStart } from './facets'
import type { BoundaryBundle, Focus } from './focus'
import {
  projectMap,
  type MapBoundaryNode,
  type MapCardData,
  type MapFlowEdge,
} from './mapGraph'
import { indexSnapshot, type SnapshotIndex } from './snapshotIndex'
import { mapSession, type MapSession } from './mapSession'
import { ClearHighlight, ResetLayout } from './MapControls'
import { reconciledPosition } from './reconcile'
import { stackIndex } from './stacking'
import { useCenterRequests } from './useCenterRequests'
import './map.css'

type CardNode = Node<MapCardData, 'equipment'>
type PreviewNode = Node<{ name: string; onConfigure: () => void }, 'preview'>
type BoundaryNode = Node<MapBoundaryNode['data'], 'boundary'>
type MapNode = CardNode | PreviewNode | BoundaryNode

const Actions = createContext<{
  onPort: (id: string) => void
  onTraceDevice: (id: string) => void
  onToggleManual: (equipmentId: string, key: string) => void
  onFocus: (focus: Focus) => void
  onToggleBundle: (id: string) => void
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
  onFocus: () => undefined,
  onToggleBundle: () => undefined,
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
  const { onPort, onTraceDevice, onFocus, openLists, onToggleList } =
    useContext(Actions)
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
      className={`equipment-card map-card ${data.highlighted ? 'traced' : ''} ${data.foundRole ? `found found-${data.foundRole}` : ''} ${selected ? 'selected' : ''} ${data.proposed ? 'proposed' : ''}`}
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
      <p className="map-location">
        {data.location}
        {data.focusNode && (
          <button
            className="nodrag map-focus"
            aria-label={`Focus ${data.focusNodeName}`}
            title={`Focus ${data.focusNodeName}`}
            onClick={(event) => {
              event.stopPropagation()
              onFocus(data.focusNode!)
            }}
          >
            <Crosshair size={12} />
          </button>
        )}
      </p>
      <p className="map-summary">
        {summary.cabled} of {summary.total} cabled
      </p>
      {data.badges.length > 0 && (
        <p className="map-badges">
          {data.badges.map((b) => (
            <span className="badge" key={b}>
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

const BoundaryCard = memo(function BoundaryCard({
  data,
}: NodeProps<BoundaryNode>) {
  const { onToggleBundle } = useContext(Actions)
  const { bundle } = data
  const shownIds = bundle.linkIds.slice(0, 6).join(' · ')
  return (
    <aside
      className={`boundary-card ${bundle.expanded ? 'expanded' : ''}`}
      data-cable-ids={bundle.linkIds.join(' ')}
    >
      <strong>{bundle.label}</strong>
      <small className="cable-ids">
        {shownIds}
        {bundle.linkIds.length > 6 && ` · +${bundle.linkIds.length - 6}`}
      </small>
      <button
        className="nodrag"
        aria-expanded={bundle.expanded}
        aria-label={`${bundle.expanded ? 'Collapse' : 'Expand'} ${bundle.label}`}
        onClick={(event) => {
          event.stopPropagation()
          onToggleBundle(bundle.id)
        }}
      >
        {bundle.expanded ? 'Collapse' : 'Expand'}
      </button>
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
    </aside>
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
/**
 * A cable line. Found and traced at once: the teal route line keeps its place
 * and the found color shows as a wider amber outline beneath it.
 */
function MapEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath(props)
  const data = props.data as MapFlowEdge['data'] | undefined
  return (
    <g data-cable-ids={data?.linkIds.join(' ')}>
      {data?.found && data.highlighted && (
        <path d={path} className="found-outline" fill="none" />
      )}
      <BaseEdge
        id={props.id}
        path={path}
        label={props.label}
        labelX={labelX}
        labelY={labelY}
        style={props.style}
        interactionWidth={20}
      />
    </g>
  )
}
const edgeTypes = { map: MapEdge }
const nodeTypes = {
  equipment: EquipmentCard,
  preview: Preview,
  boundary: BoundaryCard,
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
    className: e.data.found ? 'found' : undefined,
    animated: lit,
    zIndex: 10,
    interactionWidth: 20,
    data: e.data,
    style: {
      stroke: lit ? '#108b79' : e.data.found ? '#e09a00' : '#9bacc0',
      strokeWidth: lit || e.data.found ? 3 : 1.8,
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
  const focus = useSyncExternalStore(session.subscribe, session.focus)
  const foundId = useSyncExternalStore(session.subscribe, session.foundId)
  const layoutVersion = useSyncExternalStore(
    session.subscribe,
    session.layoutVersion,
  )
  const expanded = useSyncExternalStore(
    session.subscribe,
    session.expandedBundles,
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
    // Manual facets, focus and expansion are read through the session; they are dependencies so changes re-project.
    [
      snapshot,
      session,
      networkId,
      route,
      installedIDs,
      installedLinkIDs,
      index,
      manual,
      focus,
      expanded,
      layoutVersion,
      foundId,
    ],
  )
  const edges = useMemo(() => graph.edges.map(flowEdge), [graph.edges])
  const cableCount = useMemo(
    () => graph.edges.reduce((n, e) => n + e.data.linkIds.length, 0),
    [graph.edges],
  )

  // Local node state carries RF's measurements and in-progress drags; a
  // refetch, filter, route or context change only reconciles it by ID.
  const [nodes, setNodes] = useState<MapNode[]>(() => [
    ...graph.nodes,
    ...graph.boundaries,
  ])
  // A layout reset drops dragged positions and fits once, then everything else
  // (trace, pins, focus, filter) carries on untouched.
  const appliedVersion = useRef(layoutVersion)
  const [fitToken, setFitToken] = useState(0)
  useEffect(() => {
    const reset = appliedVersion.current !== layoutVersion
    appliedVersion.current = layoutVersion
    setNodes((previous) => {
      const existing = new Map(previous.map((n) => [n.id, n]))
      return [...graph.nodes, ...graph.boundaries].map((n) => {
        const prior = existing.get(n.id)
        return {
          ...n,
          position: reconciledPosition(prior?.position, n.position, reset),
          measured: prior?.measured,
        }
      })
    })
    if (reset) setFitToken((t) => t + 1)
  }, [graph.nodes, graph.boundaries, layoutVersion])
  useEffect(() => {
    if (fitToken === 0) return
    void flow.fitView(FIT).then(() => session.setViewport(flow.getViewport()))
  }, [fitToken])
  const surface = useRef<HTMLDivElement>(null)
  useCenterRequests(session, surface, nodes)
  // Esc clears the highlight (found state) without touching the trace.
  useEffect(() => {
    if (!foundId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') session.setFound(undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [foundId, session])
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
      onFocus: session.setFocus,
      onToggleBundle: session.toggleBundle,
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
    <div className="flow-surface" ref={surface}>
      <Actions.Provider value={actions}>
        <ReactFlow<MapNode>
          nodes={rendered}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            if (node.type === 'equipment') onSelect(node.id)
          }}
          onNodeDragStop={(_, node) => {
            if (node.type === 'equipment' || node.type === 'boundary')
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
            {foundId && (
              <ClearHighlight onClear={() => session.setFound(undefined)} />
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
