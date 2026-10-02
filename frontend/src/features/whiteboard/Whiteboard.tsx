import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  type NodeProps,
  type NodeChange,
} from '@xyflow/react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  GitFork,
  MapPin,
  Network,
  PanelTop,
  Server,
  Plus,
} from 'lucide-react'
import type { Route, Snapshot } from '../../shared/types'
import { hierarchyGraph, type CanvasNode } from './hierarchy'
import './interaction.css'

const Container = memo(function Container({ id, data }: NodeProps<CanvasNode>) {
  const Icon =
    data.kind === 'site' ? MapPin : data.kind === 'node' ? Building2 : Server
  const [over, setOver] = useState(false)
  return (
    <section
      className={`canvas-container ${data.kind} ${data.highlighted ? 'traced' : ''} ${over ? 'drop-over' : ''}`}
      aria-label={`${data.kind}: ${data.name}`}
      onDragOver={(e) => {
        if (data.kind === 'rack' && data.onDropItem) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        if (data.kind !== 'rack' || !data.onDropItem) return
        e.preventDefault()
        e.stopPropagation()
        data.onDropItem(
          data.entityID,
          e.dataTransfer.getData('application/x-nettop-item'),
        )
      }}
    >
      <div className="container-heading">
        <span className="container-icon">
          <Icon size={19} />
        </span>
        <div>
          <small>
            {data.kind === 'node' ? 'PHYSICAL NODE' : data.kind.toUpperCase()}
          </small>
          <h3>{data.name}</h3>
        </div>
        <button
          className="nodrag icon-button"
          aria-label={`${data.collapsed ? 'Expand' : 'Collapse'} ${data.name}`}
          onClick={() => data.onToggle?.(id)}
        >
          {data.collapsed ? (
            <ChevronRight size={17} />
          ) : (
            <ChevronDown size={17} />
          )}
        </button>
      </div>
      <p className="container-summary">{data.subtitle}</p>
      {data.kind === 'rack' && (
        <button
          className="nodrag rack-elevation-link"
          onClick={() => data.onOpenRack?.(data.entityID)}
        >
          Open elevation ↗
        </button>
      )}
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="target" position={Position.Right} id="in-right" />
      <Handle type="source" position={Position.Right} id="out" />
      <Handle type="source" position={Position.Left} id="out-left" />
    </section>
  )
})

const EquipmentCard = memo(function EquipmentCard({
  data,
  selected,
}: NodeProps<CanvasNode>) {
  const Icon =
    data.equipment?.kind === 'panel'
      ? PanelTop
      : data.equipment?.role === 'aggregation'
        ? GitFork
        : Network
  const count = data.ports?.length ?? 0
  return (
    <article
      className={`equipment-card ${data.highlighted ? 'traced' : ''} ${selected ? 'selected' : ''} ${data.proposed ? 'proposed' : ''}`}
    >
      <div className="equipment-heading">
        <span className="equipment-icon">
          <Icon size={21} />
        </span>
        <span className={`badge ${data.proposed ? 'green' : ''}`}>
          {data.proposed ? 'PROPOSED' : data.equipment?.role}
        </span>
      </div>
      <h3>{data.name}</h3>
      <p>{data.subtitle}</p>
      <div className="compact-ports">
        {data.ports?.slice(0, 8).map((p) => (
          <button
            className={`nodrag ${data.activePorts?.includes(p.id) ? 'lit' : ''}`}
            key={p.id}
            title={p.label}
            aria-label={`${data.name} ${p.label}, set trace start`}
            onClick={(e) => {
              e.stopPropagation()
              data.onPort?.(p.id)
            }}
          />
        ))}
        {count > 8 && <small>+{count - 8}</small>}
      </div>
      {data.ports?.map((p, i) => (
        <div key={p.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={`${p.id}:in`}
            style={{ top: `${25 + (i * 60) / Math.max(count, 1)}%` }}
            isConnectable={false}
          />
          <Handle
            type="target"
            position={Position.Right}
            id={`${p.id}:in-right`}
            style={{ top: `${25 + (i * 60) / Math.max(count, 1)}%` }}
            isConnectable={false}
          />
          <Handle
            type="source"
            position={Position.Left}
            id={`${p.id}:out-left`}
            style={{ top: `${25 + (i * 60) / Math.max(count, 1)}%` }}
            isConnectable={false}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`${p.id}:out`}
            style={{ top: `${25 + (i * 60) / Math.max(count, 1)}%` }}
            isConnectable={false}
          />
        </div>
      ))}
    </article>
  )
})
const Preview = memo(function Preview({ data }: NodeProps<CanvasNode>) {
  return (
    <button className="unplaced-card nodrag" onClick={data.onConfigure}>
      <Plus size={24} />
      <strong>New {data.name}</strong>
      <span>Unplaced · not saved</span>
      <small>Click to assign a rack and configure</small>
    </button>
  )
})
const nodeTypes = {
  container: Container,
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
  installedIDs: Set<string>
  installedLinkIDs: Set<string>
  selected: string
  route?: Route
  onSelect: (id: string) => void
  onPort: (id: string) => void
  canEdit: boolean
  positions: Record<string, { x: number; y: number }>
  onLayoutPosition: (id: string, position: { x: number; y: number }) => void
  onCreateEquipment: (
    kind: 'switch' | 'panel',
    rackID?: string,
    unit?: number,
    position?: { x: number; y: number },
    role?: 'aggregation',
  ) => void
  onMoveEquipment: (id: string, rackID: string) => void
  onOpenRack: (id: string) => void
  preview?: PendingEquipment
  onConfigurePreview: () => void
}
export default function Whiteboard(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

function Canvas({
  snapshot,
  installedIDs,
  installedLinkIDs,
  selected,
  route,
  onSelect,
  onPort,
  canEdit,
  positions,
  onLayoutPosition,
  onCreateEquipment,
  onMoveEquipment,
  onOpenRack,
  preview,
  onConfigurePreview,
}: Props) {
  const flow = useReactFlow<CanvasNode>()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [],
  )
  const dropItem = useCallback(
    (rackID: string, payload: string) => {
      if (!canEdit) return
      if (payload.startsWith('equipment:'))
        onMoveEquipment(payload.slice(10), rackID)
      if (payload.startsWith('new:')) {
        const [kind, , , role] = payload.slice(4).split(':')
        if (kind === 'switch' || kind === 'panel')
          onCreateEquipment(
            kind,
            rackID,
            undefined,
            undefined,
            role === 'aggregation' ? 'aggregation' : undefined,
          )
      }
    },
    [canEdit, onMoveEquipment, onCreateEquipment],
  )
  const projected = useMemo(() => {
    const graph = hierarchyGraph(snapshot, collapsed, route)
    graph.nodes = graph.nodes.map((node) => ({
      ...node,
      selected: node.id === selected,
      data: {
        ...node.data,
        proposed: node.type === 'equipment' && !installedIDs.has(node.id),
        onToggle: toggle,
        onOpenRack,
        onPort,
        onDropItem: canEdit ? dropItem : undefined,
      },
    }))
    graph.edges = graph.edges.map((edge) => ({
      ...edge,
      style: {
        ...edge.style,
        strokeDasharray: edge.data!.linkIds.some(
          (id) => !installedLinkIDs.has(id),
        )
          ? '6 4'
          : undefined,
      },
    }))
    if (preview?.position && !preview.rackId)
      graph.nodes.push({
        id: 'unsaved-preview',
        type: 'preview',
        position: preview.position,
        zIndex: 20,
        style: { width: 240, height: 135 },
        data: {
          kind: 'preview',
          entityID: 'unsaved',
          name:
            preview.role === 'aggregation'
              ? 'aggregation switch'
              : preview.kind,
          subtitle: 'Unplaced',
          highlighted: false,
          onConfigure: onConfigurePreview,
        },
      })
    return graph
  }, [
    snapshot,
    collapsed,
    route,
    selected,
    installedIDs,
    installedLinkIDs,
    toggle,
    onOpenRack,
    onPort,
    canEdit,
    dropItem,
    preview,
    onConfigurePreview,
  ])
  const [nodes, setNodes] = useState<CanvasNode[]>(projected.nodes)
  const [dropTarget, setDropTarget] = useState<string>()
  const dragOrigin = useRef<{ x: number; y: number } | undefined>(undefined)
  const pointer = (event: MouseEvent | TouchEvent) =>
    'clientX' in event
      ? { x: event.clientX, y: event.clientY }
      : {
          x: event.changedTouches[0].clientX,
          y: event.changedTouches[0].clientY,
        }
  const findRackAt = useCallback(
    (x: number, y: number) => {
      const point = flow.screenToFlowPosition({ x, y }),
        all = flow.getNodes(),
        byID = new Map(all.map((n) => [n.id, n]))
      return all
        .filter((n) => n.data.kind === 'rack')
        .find((n) => {
          let left = n.position.x,
            top = n.position.y,
            parent = n.parentId
          while (parent) {
            const ancestor = byID.get(parent)
            if (!ancestor) break
            left += ancestor.position.x
            top += ancestor.position.y
            parent = ancestor.parentId
          }
          return (
            point.x >= left &&
            point.x <= left + Number(n.style?.width ?? 0) &&
            point.y >= top &&
            point.y <= top + Number(n.style?.height ?? 0)
          )
        })
    },
    [flow],
  )
  const previousParents = useRef(
    new Map(projected.nodes.map((n) => [n.id, n.parentId])),
  )
  const rackMembers = useRef(
    new Map(
      snapshot.racks.map((r) => [
        r.id,
        snapshot.equipment
          .filter((e) => e.rackId === r.id)
          .map((e) => e.id)
          .join('|'),
      ]),
    ),
  )
  useEffect(() => {
    const changedRacks = new Set<string>()
    for (const rack of snapshot.racks) {
      const signature = snapshot.equipment
        .filter((e) => e.rackId === rack.id)
        .map((e) => e.id)
        .join('|')
      if (rackMembers.current.get(rack.id) !== signature)
        changedRacks.add(`rack:${rack.id}`)
      rackMembers.current.set(rack.id, signature)
    }
    setNodes((previous) => {
      const existing = new Map(previous.map((n) => [n.id, n]))
      const next = projected.nodes.map((n) => {
        const prior = existing.get(n.id),
          sameParent = previousParents.current.get(n.id) === n.parentId
        const saved = positions[n.id]
        const reset = n.parentId && changedRacks.has(n.parentId)
        if (reset) onLayoutPosition(n.id, n.position)
        return {
          ...n,
          position:
            sameParent && !reset
              ? (prior?.position ?? saved ?? n.position)
              : n.position,
          measured: prior?.measured,
        }
      })
      for (const node of projected.nodes)
        previousParents.current.set(node.id, node.parentId)
      return next
    })
  }, [projected.nodes, positions, snapshot, onLayoutPosition])
  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) =>
      setNodes((previous) => applyNodeChanges(changes, previous)),
    [],
  )
  const firstFit = useRef(false)
  useEffect(() => {
    if (firstFit.current) return
    const timer = setTimeout(() => {
      void flow.fitView({ padding: 0.18, maxZoom: 1 })
      firstFit.current = true
    }, 100)
    return () => clearTimeout(timer)
  }, [flow])
  const renderedNodes = useMemo(
    () =>
      dropTarget
        ? nodes.map((n) =>
            n.id === dropTarget ? { ...n, className: 'rack-drag-target' } : n,
          )
        : nodes,
    [nodes, dropTarget],
  )
  return (
    <div className="flow-surface">
      <ReactFlow<CanvasNode>
        nodes={renderedNodes}
        edges={projected.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          if (node.type === 'equipment') onSelect(node.id)
        }}
        onNodeDragStart={(_, node) => {
          dragOrigin.current = node.position
        }}
        onNodeDrag={(event, node) => {
          if (node.type !== 'equipment') return
          const point = pointer(event),
            rack = findRackAt(point.x, point.y)
          setDropTarget((previous) =>
            previous === rack?.id ? previous : rack?.id,
          )
        }}
        onNodeDragStop={(event, node) => {
          setDropTarget(undefined)
          if (node.type === 'equipment') {
            const point = pointer(event),
              rack = findRackAt(point.x, point.y)
            if (!rack || rack.id !== node.parentId) {
              const origin = dragOrigin.current
              if (origin)
                setNodes((previous) =>
                  previous.map((n) =>
                    n.id === node.id ? { ...n, position: origin } : n,
                  ),
                )
              if (rack && canEdit) onMoveEquipment(node.id, rack.data.entityID)
              return
            }
          }
          onLayoutPosition(node.id, node.position)
        }}
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
              flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
              role === 'aggregation' ? 'aggregation' : undefined,
            )
        }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesConnectable={false}
        deleteKeyCode={null}
        defaultEdgeOptions={{ interactionWidth: 20 }}
        onlyRenderVisibleElements
      >
        <Background color="#ccd5df" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="board-caption">
        <strong>
          {dropTarget
            ? `Drop in ${snapshot.racks.find((r) => `rack:${r.id}` === dropTarget)?.name ?? 'rack'}${canEdit ? ' · planned placement' : ' · installed view is read-only'}`
            : `${snapshot.sites.length} sites · ${snapshot.nodes.length} nodes · ${snapshot.racks.length} racks`}
        </strong>
        <span>
          Move inside a rack to arrange · Move across racks to propose placement
        </span>
      </div>
    </div>
  )
}
