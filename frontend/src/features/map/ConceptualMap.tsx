import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge,
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
import { indexSnapshot } from './snapshotIndex'
import { mapSession, type MapSession } from './mapSession'
import './map.css'

type CardNode = Node<MapCardData, 'equipment'>
type PreviewNode = Node<{ name: string; onConfigure: () => void }, 'preview'>
type MapNode = CardNode | PreviewNode

const Actions = createContext<{
  onPort: (id: string) => void
  onTraceDevice: (id: string) => void
  onToggleManual: (equipmentId: string, key: string) => void
  /** Cabled ports or positions of an equipment; computed when a list opens. */
  entriesOf: (equipmentId: string) => ConnectionEntry[]
  /** Network label for an entry on another network than the active filter. */
  captionOf: (entry: ConnectionEntry) => string | undefined
}>({
  onPort: () => undefined,
  onTraceDevice: () => undefined,
  onToggleManual: () => undefined,
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
    <div className="map-connections nodrag nowheel">
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
  const { onPort, onTraceDevice } = useContext(Actions)
  const [listOpen, setListOpen] = useState(false)
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
      className={`equipment-card map-card ${data.highlighted ? 'traced' : ''} ${selected ? 'selected' : ''} ${data.proposed ? 'proposed' : ''}`}
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
            setListOpen((v) => !v)
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
      {listOpen && (
        <Connections
          equipmentId={e.id}
          name={e.name}
          manualKeys={data.manualKeys}
        />
      )}
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
const nodeTypes = { equipment: EquipmentCard, preview: Preview }

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
    type: 'smoothstep',
    animated: lit,
    zIndex: 10,
    interactionWidth: 20,
    data: e.data,
    style: {
      stroke: lit ? '#108b79' : '#9bacc0',
      strokeWidth: lit ? 3 : 1.8,
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
  session = mapSession,
}: Props) {
  const flow = useReactFlow<MapNode>()
  // Snapshot-only work is done once per snapshot; route, filter and manual
  // facets only redo the dependent part.
  const index = useMemo(() => indexSnapshot(snapshot), [snapshot])
  const manual = useSyncExternalStore(session.subscribe, session.manualFacets)
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
    // `manual` is read through the session; it is a dependency so toggles re-project.
    [
      snapshot,
      session,
      networkId,
      route,
      installedIDs,
      installedLinkIDs,
      index,
      manual,
    ],
  )
  const edges = useMemo(() => graph.edges.map(flowEdge), [graph.edges])
  const cableCount = useMemo(
    () => graph.edges.reduce((n, e) => n + e.data.linkIds.length, 0),
    [graph.edges],
  )

  // Local node state carries RF's measurements and in-progress drags; a
  // refetch, filter, route or context change only reconciles it by ID.
  const [nodes, setNodes] = useState<MapNode[]>(() =>
    graph.nodes.map((n) => ({ ...n })),
  )
  useEffect(() => {
    setNodes((previous) => {
      const existing = new Map(previous.map((n) => [n.id, n]))
      return graph.nodes.map((n) => {
        const prior = existing.get(n.id)
        return {
          ...n,
          position: prior?.position ?? n.position,
          measured: prior?.measured,
        }
      })
    })
  }, [graph.nodes])
  const onNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) =>
      setNodes((previous) => applyNodeChanges(changes, previous)),
    [],
  )
  const rendered = useMemo(() => {
    const cards: MapNode[] = nodes.map((n) => ({
      ...n,
      selected: n.id === selected,
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
  }, [nodes, selected, preview, onConfigurePreview])
  const entriesOf = useCallback(
    (id: string) => connectionEntries(snapshot, index, id),
    [snapshot, index],
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
      entriesOf,
      captionOf,
    }),
    [onPort, onTraceDevice, session, entriesOf, captionOf],
  )

  return (
    <div className="flow-surface">
      <Actions.Provider value={actions}>
        <ReactFlow<MapNode>
          nodes={rendered}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
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
          deleteKeyCode={null}
          onlyRenderVisibleElements
        >
          <Background color="#ccd5df" gap={24} size={1} />
          <Controls showInteractive={false} />
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
