import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  Panel,
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
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { getMapLayout, resetMapLayout, saveMapPosition } from '../../shared/api'
import type { MapLayout, NodePosition, Snapshot } from '../../shared/types'
import RouteDiagram from '../paths/RouteDiagram'
import type { Sheet } from '../paths/sheet'
import { positionMarks } from '../physical/explorerModel'
import { NODE_WIDTH, type Position as Point } from '../physical/layout'
import { fitViewport } from './center'
import { MapViewSwitch, ResetLayout } from './MapControls'
import { mapSession, type MapSession } from './mapSession'
import { networkColors } from './networkColors'
import NodeCard from './NodeCard'
import { buildOverview } from './overview'
import {
  panIntoView,
  projectOverview,
  restoreMapPosition,
  withoutMapPositions,
  withSavedMapPosition,
  type OverviewCardNode,
  type OverviewLineData,
  type OverviewSiteNode,
} from './overviewFlow'
import { overviewLayout, siteFrames } from './overviewLayout'
import { indexSnapshot, type SnapshotIndex } from './snapshotIndex'
import { visibleArea } from './viewArea'
import Name from '../../shared/ui/Name'
import './map.css'

/** Handles are points at the card's centre, so a line runs exactly between centres. */
const POINT = { width: 0, height: 0, minWidth: 0, minHeight: 0 }
const KEY = ['map-layout']
const FIT = { padding: 40, minZoom: 0.1, maxZoom: 1 }

const Actions = createContext<{
  onToggle: (nodeId: string) => void
  onSelect: (equipmentId: string) => void
}>({ onToggle: () => undefined, onSelect: () => undefined })

const CardNodeView = memo(function CardNodeView({
  data,
}: NodeProps<OverviewCardNode>) {
  const { onToggle, onSelect } = useContext(Actions)
  return (
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
      <NodeCard data={data} onToggle={onToggle} onSelect={onSelect} />
    </>
  )
})

const SiteFrameView = memo(function SiteFrameView({
  data,
}: NodeProps<OverviewSiteNode>) {
  return (
    <div className="overview-frame">
      <span className="overview-frame-name">
        <Name text={data.name} />
      </span>
    </div>
  )
})

/** One straight line per cabled pair with its cable count. A drawing aid; it never feeds a trace. */
function OverviewLine(props: EdgeProps) {
  const data = props.data as OverviewLineData
  const [path] = getStraightPath(props)
  const { x, y } = data.pill
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={props.style}
        className={data.dimmed ? 'dimmed' : undefined}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        <span
          className={`overview-pill nodrag nopan${data.dimmed ? ' dimmed' : ''}`}
          role="img"
          data-pair={data.pair}
          aria-label={`${data.count} ${data.count === 1 ? 'cable' : 'cables'} between ${data.names[0]} and ${data.names[1]}`}
          style={{
            transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
            background: props.style?.stroke as string | undefined,
          }}
        >
          {data.count}
        </span>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { overviewCard: CardNodeView, overviewSite: SiteFrameView }
const edgeTypes = { overviewLine: OverviewLine }

export interface OverviewProps {
  snapshot: Snapshot
  index?: SnapshotIndex
  /** Containers of the installed topology; a node outside it is proposed. */
  installedContainerIds?: ReadonlySet<string>
  selected: string
  networkId?: string
  onSelect: (equipmentId: string) => void
  /** The selected route as a walk sheet; the route view draws it over the overview. */
  routeSheet?: Sheet
  onRouteStep?: (endpointId: string) => void
  session?: MapSession
}

/**
 * The conceptual overview: node cards in site frames, a line per cabled pair
 * with its cable count. Positions of installed nodes are saved on the server
 * once per drop (optimistically, rolled back on failure); proposed nodes keep
 * theirs for the session. It fits once per session; a refetch only reconciles
 * positions by node ID.
 */
export default function OverviewCanvas(props: OverviewProps) {
  const client = useQueryClient()
  const [error, setError] = useState<string>()
  const layout = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => getMapLayout(signal),
  })
  const session = props.session ?? mapSession

  const save = useMutation({
    mutationFn: (v: { nodeId: string; x: number; y: number }) =>
      saveMapPosition(v.nodeId, { x: v.x, y: v.y }),
    onMutate: async (v) => {
      setError(undefined)
      await client.cancelQueries({ queryKey: KEY })
      const current = client.getQueryData<MapLayout>(KEY) ?? { positions: [] }
      const prior = current.positions.find((p) => p.nodeId === v.nodeId)
      client.setQueryData(
        KEY,
        withSavedMapPosition(current, v.nodeId, v.x, v.y),
      )
      return { prior }
    },
    onError: (_error, v, context) => {
      client.setQueryData<MapLayout>(KEY, (now) =>
        restoreMapPosition(now ?? { positions: [] }, v.nodeId, context?.prior),
      )
      setError(
        'Could not save the node position. It was put back where it was.',
      )
    },
  })

  const reset = useMutation({
    mutationFn: () => resetMapLayout(),
    onMutate: async () => {
      setError(undefined)
      await client.cancelQueries({ queryKey: KEY })
      const previous = client.getQueryData<MapLayout>(KEY)
      client.setQueryData(
        KEY,
        withoutMapPositions(previous ?? { positions: [] }),
      )
      return { previous }
    },
    onSuccess: () => session.resetOverview(),
    onError: (_error, _v, context) => {
      if (context?.previous) client.setQueryData(KEY, context.previous)
      setError('Could not reset the arrangement. Your arrangement was kept.')
    },
  })

  if (layout.isPending)
    return (
      <div className="flow-surface overview-surface" data-view="overview">
        <p className="physical-loading">Loading the saved arrangement…</p>
      </div>
    )
  return (
    <ReactFlowProvider>
      <Canvas
        {...props}
        session={session}
        saved={layout.data?.positions ?? []}
        loadFailed={layout.isError}
        error={error}
        onDrop={(nodeId, x, y) => save.mutate({ nodeId, x, y })}
        onReset={() => reset.mutate()}
      />
    </ReactFlowProvider>
  )
}

function Canvas({
  snapshot,
  index: givenIndex,
  installedContainerIds,
  selected,
  networkId,
  onSelect,
  routeSheet,
  onRouteStep,
  session,
  saved,
  loadFailed,
  error,
  onDrop,
  onReset,
}: OverviewProps & {
  session: MapSession
  saved: readonly NodePosition[]
  loadFailed: boolean
  error?: string
  onDrop: (nodeId: string, x: number, y: number) => void
  onReset: () => void
}) {
  const flow = useReactFlow()
  const ownIndex = useMemo(
    () => (givenIndex ? undefined : indexSnapshot(snapshot)),
    [givenIndex, snapshot],
  )
  const index = (givenIndex ?? ownIndex)!
  const colors = useMemo(
    () => networkColors(snapshot.networks),
    [snapshot.networks],
  )
  const openNodes = useSyncExternalStore(session.subscribe, session.openNodes)
  const proposedPositions = useSyncExternalStore(
    session.subscribe,
    session.proposedPositions,
  )
  const version = useSyncExternalStore(
    session.subscribe,
    session.overviewVersion,
  )
  const routeViewOn = useSyncExternalStore(session.subscribe, session.routeView)
  const active = routeViewOn && !!routeSheet
  useEffect(() => {
    if (routeViewOn && !routeSheet) session.setRouteView(false)
  }, [routeViewOn, routeSheet, session])

  // Snapshot-only work; the network only changes what is dimmed.
  const overview = useMemo(
    () =>
      buildOverview(index, {
        networkId,
        installedNodeIds: installedContainerIds,
      }),
    [index, networkId, installedContainerIds],
  )
  // The server's positions for installed nodes, the session's for proposed ones.
  const known = useMemo(() => {
    const result = new Map<string, Point>()
    for (const p of saved) result.set(p.nodeId, { x: p.x, y: p.y })
    for (const [id, p] of proposedPositions) result.set(id, p)
    return result
  }, [saved, proposedPositions])
  const target = useMemo(
    () => overviewLayout(overview, known),
    [overview, known],
  )

  // At rest, a card is where its own saved position says, or where it already
  // was: saving one node never makes the others jump, and a refetch never refits.
  // `settled` is also what the site frames are drawn around, so they follow a
  // drop and not the pointer.
  const [settled, setSettled] = useState<ReadonlyMap<string, Point>>(target)
  const settledRef = useRef(settled)
  settledRef.current = settled
  const lastKnown = useRef(known)
  const appliedVersion = useRef(version)
  const [fitToken, setFitToken] = useState(0)
  useEffect(() => {
    const before = lastKnown.current
    const resetNow =
      appliedVersion.current !== version ||
      (before.size > 0 && known.size === 0)
    const refit = appliedVersion.current !== version
    appliedVersion.current = version
    lastKnown.current = known
    const prior = settledRef.current
    const next = new Map<string, Point>()
    for (const n of overview.nodes) {
      const was = prior.get(n.id)
      const a = before.get(n.id)
      const b = known.get(n.id)
      const changed = a?.x !== b?.x || a?.y !== b?.y
      next.set(n.id, !was || changed || resetNow ? target.get(n.id)! : was)
    }
    setSettled(next)
    if (refit) setFitToken((t) => t + 1)
  }, [overview, target, known, version])

  const frames = useMemo(
    () => siteFrames(overview, settled),
    [overview, settled],
  )
  // Open cards are not the closed size; their lines and pills follow the measured one.
  const [sizes, setSizes] = useState<
    ReadonlyMap<string, { width: number; height: number }>
  >(new Map())
  const projected = useMemo(
    () =>
      projectOverview({
        overview,
        index,
        positions: settled,
        frames,
        openNodes,
        selected,
        colors,
        sizes,
      }),
    [overview, index, settled, frames, openNodes, selected, colors, sizes],
  )

  // Local node state carries React Flow's measurements and an in-progress drag.
  const dragging = useRef<string | undefined>(undefined)
  const [nodes, setNodes] = useState(projected.nodes)
  useEffect(() => {
    setNodes((previous) => {
      const prior = new Map(previous.map((n) => [n.id, n]))
      return projected.nodes.map((n) => {
        const was = prior.get(n.id)
        return {
          ...n,
          measured: was?.measured,
          position:
            was && n.id === dragging.current ? was.position : n.position,
        }
      })
    })
  }, [projected.nodes])
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const sizeKey = useRef('[]')
  useEffect(() => {
    const open = nodes.flatMap((n) =>
      n.type === 'overviewCard' && n.data.open && n.measured?.width
        ? [
            [
              n.id,
              Math.round(n.measured.width),
              Math.round(n.measured.height ?? 0),
            ] as const,
          ]
        : [],
    )
    const key = JSON.stringify(open)
    if (key === sizeKey.current) return
    sizeKey.current = key
    setSizes(
      new Map(open.map(([id, width, height]) => [id, { width, height }])),
    )
  }, [nodes])
  const onNodesChange = useCallback(
    (changes: NodeChange<(typeof nodes)[number]>[]) =>
      setNodes((previous) => applyNodeChanges(changes, previous)),
    [],
  )

  const surface = useRef<HTMLDivElement>(null)
  const [fitted, setFitted] = useState(false)
  const frame = useRef(0)
  // Fits everything into the part of the canvas the drawers and overlays leave
  // free, once the cards have been measured.
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
          .then(() => {
            session.setOverviewViewport(flow.getViewport())
            setFitted(true)
          })
        return
      }
      if (all.length === 0 || ++frames >= 120) return setFitted(true)
      frame.current = requestAnimationFrame(attempt)
    }
    // Two frames first: a reset has just moved the cards.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(attempt)
    })
  }, [flow, session])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useEffect(() => {
    if (fitToken > 0) fitVisible()
  }, [fitToken, fitVisible])

  useEffect(() => {
    const map = surface.current?.querySelector<HTMLElement>('.react-flow')
    if (map) map.inert = active
  }, [active])

  // A card the user has just opened is panned fully into view: by the smallest
  // amount, at the current zoom, inside what the drawers leave free. Only a
  // click or key press does this, never a refetch.
  const revealFrame = useRef(0)
  const reveal = useCallback(
    (id: string) => {
      cancelAnimationFrame(revealFrame.current)
      let frames = 0
      const attempt = () => {
        const el = surface.current?.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${CSS.escape(id)}"]`,
        )
        const where = visibleArea(surface.current)
        const measured = flow.getInternalNode(id)?.measured.width
        if (el && where && measured && measured > NODE_WIDTH) {
          const { dx, dy } = panIntoView(el.getBoundingClientRect(), {
            left: where.box.left + where.covers.left,
            right: where.box.right - where.covers.right,
            top: where.box.top + where.covers.top,
            bottom: where.box.bottom - where.covers.bottom,
          })
          if (dx || dy) {
            const v = flow.getViewport()
            void flow
              .setViewport({ x: v.x + dx, y: v.y + dy, zoom: v.zoom })
              .then(() => session.setOverviewViewport(flow.getViewport()))
          }
          return
        }
        if (++frames < 60) revealFrame.current = requestAnimationFrame(attempt)
      }
      revealFrame.current = requestAnimationFrame(attempt)
    },
    [flow, session],
  )
  useEffect(() => () => cancelAnimationFrame(revealFrame.current), [])
  const actions = useMemo(
    () => ({
      onToggle: (id: string) => {
        const opening = !session.openNodes().has(id)
        session.toggleNode(id)
        if (opening) reveal(id)
      },
      onSelect,
    }),
    [session, onSelect, reveal],
  )
  const empty = overview.nodes.length === 0

  return (
    <div
      className="flow-surface overview-surface"
      ref={surface}
      data-view="overview"
      data-fitted={fitted || empty}
      data-node-positions={positionMarks(settled)}
      data-route-view={active}
    >
      {empty ? (
        <p className="overview-empty">
          No nodes yet. Add a site and a node in Physical, in a plan.
        </p>
      ) : (
        <Actions.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={projected.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStart={(_, node) => {
              dragging.current = node.id
            }}
            onNodeDragStop={(_, node) => {
              dragging.current = undefined
              if (node.type !== 'overviewCard') return
              const at = { x: node.position.x, y: node.position.y }
              setSettled((now) => new Map(now).set(node.id, at))
              // A node only in a plan is not on the server: it stays for the session.
              if (installedContainerIds && !installedContainerIds.has(node.id))
                session.setProposedPosition(node.id, at)
              else onDrop(node.id, at.x, at.y)
            }}
            onInit={() => {
              if (session.overviewNeedsFit()) fitVisible()
              else setFitted(true) // restored from the session viewport
            }}
            onMoveEnd={(_, viewport) => session.setOverviewViewport(viewport)}
            defaultViewport={session.overviewViewport()}
            minZoom={0.1}
            maxZoom={1.6}
            nodesConnectable={false}
            deleteKeyCode={null}
            elevateNodesOnSelect={false}
            className={fitted ? undefined : 'overview-hidden'}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="var(--rule)"
              gap={20}
              size={1.2}
            />
            {!active && <Controls showInteractive={false} />}
            {!active && (
              <Panel position="top-left" className="overview-note">
                Lines are cables between nodes, counted from real cable records.
                Positions are your arrangement, not a floor plan.
                {loadFailed &&
                  ' Saved positions could not be loaded; defaults are shown.'}
              </Panel>
            )}
            <Panel position="top-right" className="map-tools">
              {!active && (
                <>
                  <MapViewSwitch view="overview" onChange={session.setView} />
                  <ResetLayout label="Reset arrangement" onReset={onReset} />
                </>
              )}
            </Panel>
            {error && (
              <Panel position="bottom-left" className="overview-error">
                <p role="status">{error}</p>
              </Panel>
            )}
          </ReactFlow>
        </Actions.Provider>
      )}
      {empty && (
        <div className="map-tools overview-empty-tools">
          <MapViewSwitch view="overview" onChange={session.setView} />
        </div>
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
