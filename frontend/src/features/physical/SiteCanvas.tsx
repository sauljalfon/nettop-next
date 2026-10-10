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
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import { GripVertical } from 'lucide-react'
import AddContainer from '../planning/AddContainer'
import ContainerFoot from '../planning/ContainerFoot'
import { installedHint } from '../planning/containers'
import type { PlanEdit } from '../planning/editing'
import '../planning/editing.css'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getSiteLayout,
  resetSiteLayout,
  saveNodePosition,
} from '../../shared/api'
import type { NodePosition, SiteLayout, Snapshot } from '../../shared/types'
import { fitViewport } from '../map/center'
import { defaultNodeLayout } from './layout'
import { ResetLayout } from '../map/MapControls'
import { visibleArea } from '../map/viewArea'
import { colorOf, networkColors } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import CableList from './CableList'
import { nodeConnections, nodeGraph } from './connections'
import {
  allProposed,
  cableRows,
  mixOf,
  nodePositions,
  otherSiteGroups,
  positionMarks,
  restorePosition,
  siteLineWidth,
  withoutPositions,
  withSavedPosition,
  type NetworkMix,
} from './explorerModel'
import type { Inventory, RouteMarks } from './inventory'
import type { PhysicalSession } from './physicalSession'
import { NetworkChip } from './SitesGrid'
import { plural } from './text'

const TEAL = '#108b79'
const MIXED = '#8a97ab'
const FIT = { padding: 40, minZoom: 0.1, maxZoom: 1 }
/** More than 12 nodes: cards stay readable (zoom 0.6 at least); the rest is panned or scrolled to. */
const FIT_MANY = { ...FIT, minZoom: 0.6, anchor: 'top' as const }

interface CardData extends Record<string, unknown> {
  id: string
  name: string
  proposed: boolean
  /** Set in a current plan: the card offers Delete (empty) or the hint. */
  edit?: PlanEdit
  empty: boolean
  racks: number
  equipment: number
  mix: NetworkMix[]
  colors: ReadonlyMap<string, string>
  networkId?: string
  inside: number
  groups: { siteId: string; name: string; count: number }[]
  routeEquipment: number
  onOpenRacks: () => void
  onOpenGroup: (siteId: string) => void
}
type CardNode = Node<CardData, 'siteNode'>

interface LineData extends Record<string, unknown> {
  linkIds: string[]
  names: [string, string]
  kind: 'route' | 'network' | 'mixed'
  color: string
  onRoute: boolean
  onOpen: () => void
}

/**
 * A node card: its counts, its network mix, and where its cables go. Dragging
 * is free (the card is the drag surface); buttons inside it are not.
 */
const SiteNodeCard = memo(function SiteNodeCard({ data }: NodeProps<CardNode>) {
  return (
    <div
      className={`node-card ${data.routeEquipment ? 'on-route' : ''} ${data.proposed ? 'proposed-container' : ''}`}
      data-testid="node-card"
      data-node-id={data.id}
      data-proposed={data.proposed}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="center-handle"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Top}
        className="center-handle"
        isConnectable={false}
      />
      <div className="node-card-top">
        <span className="phys-label">
          NODE {data.proposed && <em className="proposed-tag">PROPOSED</em>}
        </span>
        <GripVertical size={14} className="grip" aria-hidden />
      </div>
      <strong className="node-name">{data.name}</strong>
      <span className="phys-counts">
        {plural(data.racks, 'rack')} · {data.equipment} equipment
      </span>
      <span className="phys-badges">
        {data.mix.map((m) => (
          <NetworkChip
            key={m.networkId}
            text={`${m.name} · ${m.count}`}
            color={colorOf(data.colors, m.networkId)}
            muted={!!data.networkId && data.networkId !== m.networkId}
          />
        ))}
      </span>
      {data.routeEquipment > 0 && (
        <span className="route-pill">
          on route · {data.routeEquipment} equipment
        </span>
      )}
      <span className="phys-muted">{plural(data.inside, 'cable')} inside</span>
      {data.groups.map((g) => (
        <button
          key={g.siteId}
          className="link-button nodrag nopan"
          onClick={() => data.onOpenGroup(g.siteId)}
        >
          {g.count === 1 ? '1 cable' : `${g.count} cables`} to {g.name}
        </button>
      ))}
      <button
        className="open-racks nodrag nopan"
        aria-label={`Open racks of ${data.name}`}
        onClick={data.onOpenRacks}
      >
        Open racks →
      </button>
      {data.edit && (
        <ContainerFoot
          kind="node"
          id={data.id}
          name={data.name}
          empty={data.empty}
          proposed={data.proposed}
          edit={data.edit}
        />
      )}
    </div>
  )
})

/**
 * One line per pair of nodes, over real cables. Solid with rounded ends, wider
 * with more cables; the count pill is a white circle at the midpoint. A drawing
 * aid: it never feeds a trace.
 */
function SiteLine(props: EdgeProps) {
  const data = props.data as LineData
  const [hover, setHover] = useState(false)
  const [path, x, y] = getStraightPath(props)
  const ids = data.linkIds.join(' ')
  const hoverProps = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  }
  return (
    <>
      <g data-cable-ids={ids} {...hoverProps}>
        <BaseEdge
          id={props.id}
          path={path}
          style={props.style}
          interactionWidth={20}
        />
      </g>
      <EdgeLabelRenderer>
        <button
          className="site-pill nodrag nopan"
          data-cable-ids={ids}
          data-on-route={data.onRoute}
          data-color={data.kind}
          aria-label={`${data.linkIds.length} cables between ${data.names[0]} and ${data.names[1]}`}
          style={{
            transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
            background: data.color,
          }}
          onClick={data.onOpen}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          {...hoverProps}
        >
          {data.linkIds.length}
        </button>
        {hover && (
          <div
            role="tooltip"
            className="site-tooltip nodrag nopan"
            style={{
              transform: `translate(-50%, -100%) translate(${x}px, ${y - 20}px)`,
            }}
          >
            {data.linkIds.map((id) => (
              <div key={id}>{id}</div>
            ))}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { siteNode: SiteNodeCard }
const edgeTypes = { siteLine: SiteLine }

interface Props {
  siteId: string
  snapshot: Snapshot
  index: SnapshotIndex
  inv: Inventory
  marks: RouteMarks
  networkId?: string
  installedLinkIDs: ReadonlySet<string>
  /** Set in a current plan: Add node, and Delete on empty nodes. */
  edit?: PlanEdit
  /** Nodes that are only in this plan. */
  proposedIds: ReadonlySet<string>
  childCounts: ReadonlyMap<string, number>
  session: PhysicalSession
  onOpenRacks: (nodeId: string) => void
  onOpenEndpoint: (endpointId: string) => void
  onError: (message: string) => void
  /** `data-node-positions` of the explorer's root; updated at rest, never while dragging. */
  onPositions: (marks: string) => void
  /** The site whose first fit is done (`data-site-fitted`); undefined while fitting. */
  onFitted: (siteId: string | undefined) => void
}

/**
 * The Site level: only the site's node cards, arranged freely. Positions are
 * saved on the server once per drop (optimistically, rolled back on failure);
 * nodes without one get the default arrangement. It fits once per site per
 * session; a refetch only reconciles positions by node ID.
 */
export default function SiteCanvas(props: Props) {
  const { siteId, onError } = props
  const client = useQueryClient()
  const key = useMemo(() => ['site-layout', siteId], [siteId])
  // A site that is only in a plan has no saved layout (the server does not know it).
  const planOnly = props.proposedIds.has(siteId)
  const layout = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getSiteLayout(siteId, signal),
    enabled: !planOnly,
  })

  const save = useMutation({
    mutationFn: (v: { nodeId: string; x: number; y: number }) =>
      saveNodePosition(siteId, v.nodeId, { x: v.x, y: v.y }),
    onMutate: async (v) => {
      await client.cancelQueries({ queryKey: key })
      const current = client.getQueryData<SiteLayout>(key) ?? {
        siteId,
        positions: [],
      }
      const prior = current.positions.find((p) => p.nodeId === v.nodeId)
      client.setQueryData(key, withSavedPosition(current, v.nodeId, v.x, v.y))
      return { prior }
    },
    onError: (_error, v, context) => {
      client.setQueryData<SiteLayout>(key, (now) =>
        restorePosition(
          now ?? { siteId, positions: [] },
          v.nodeId,
          context?.prior,
        ),
      )
      onError('Could not save the node position. It was put back where it was.')
    },
  })

  const reset = useMutation({
    mutationFn: () => resetSiteLayout(siteId),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<SiteLayout>(key)
      props.session.requestRefit(siteId)
      client.setQueryData(
        key,
        withoutPositions(previous ?? { siteId, positions: [] }),
      )
      return { previous }
    },
    onError: (_error, _v, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
      onError('Could not reset the layout. Your arrangement was kept.')
    },
  })

  if (!planOnly && layout.isPending)
    return <p className="physical-loading">Loading the saved arrangement…</p>
  return (
    <ReactFlowProvider>
      <Canvas
        {...props}
        saved={layout.data?.positions ?? []}
        loadFailed={layout.isError}
        onDrop={(nodeId, x, y) => save.mutate({ nodeId, x, y })}
        onReset={() => reset.mutate()}
      />
    </ReactFlowProvider>
  )
}

function Canvas({
  siteId,
  snapshot,
  index,
  inv,
  marks,
  networkId,
  installedLinkIDs,
  edit,
  proposedIds,
  childCounts,
  session,
  onOpenRacks,
  onOpenEndpoint,
  onPositions,
  onFitted,
  saved,
  loadFailed,
  onDrop,
  onReset,
}: Props & {
  saved: readonly NodePosition[]
  loadFailed: boolean
  onDrop: (nodeId: string, x: number, y: number) => void
  onReset: () => void
}) {
  const flow = useReactFlow()
  const snapshotIsInstalled = snapshot.context === 'installed'
  const nodesOfSite = useMemo(
    () => snapshot.nodes.filter((n) => n.siteId === siteId),
    [snapshot.nodes, siteId],
  )
  const colors = useMemo(
    () => networkColors(snapshot.networks),
    [snapshot.networks],
  )
  // Snapshot- and site-only work; the route is applied on top of it.
  const conn = useMemo(() => nodeConnections(index, siteId), [index, siteId])
  const graph = useMemo(
    () => nodeGraph(index, siteId, conn),
    [index, siteId, conn],
  )
  const target = useMemo(
    () => nodePositions(nodesOfSite, saved, graph),
    [nodesOfSite, saved, graph],
  )
  const [list, setList] = useState<{
    label: string
    title: string
    linkIds: string[]
  }>()

  const openList = useCallback(
    (label: string, title: string, linkIds: string[]) =>
      setList({ label, title, linkIds }),
    [],
  )
  const nodeName = useCallback(
    (id: string) => index.nodes.get(id)?.name ?? id,
    [index],
  )

  const cards = useMemo(() => {
    const result = new Map<string, CardData>()
    for (const node of nodesOfSite) {
      const c = inv.nodes.get(node.id)!
      const counts = conn.byNode.get(node.id)
      const groups = otherSiteGroups(
        index,
        counts?.otherSiteLinkIds ?? [],
        siteId,
      )
      result.set(node.id, {
        id: node.id,
        name: node.name,
        proposed: proposedIds.has(node.id),
        edit,
        empty: (childCounts.get(node.id) ?? 0) === 0,
        racks: c.racks,
        equipment: c.equipment,
        mix: mixOf(c.active, snapshot.networks),
        colors,
        networkId,
        inside: counts?.inside ?? 0,
        groups: groups.map((g) => ({
          siteId: g.siteId,
          name: g.name,
          count: g.linkIds.length,
        })),
        routeEquipment: marks.equipmentByNode.get(node.id) ?? 0,
        onOpenRacks: () => onOpenRacks(node.id),
        onOpenGroup: (far) => {
          const g = groups.find((x) => x.siteId === far)!
          openList(
            `Cables from ${node.name} to ${g.name}`,
            `${plural(g.linkIds.length, 'cable')} · ${node.name} → ${g.name}`,
            g.linkIds,
          )
        },
      })
    }
    return result
  }, [
    nodesOfSite,
    inv,
    conn,
    index,
    siteId,
    snapshot.networks,
    colors,
    networkId,
    marks,
    onOpenRacks,
    openList,
    edit,
    proposedIds,
    childCounts,
  ])

  const edges = useMemo<Edge[]>(
    () =>
      conn.pairs.map((p) => {
        const [a, b] = p.nodeIds
        const onRoute = p.linkIds.some((id) => marks.links.has(id))
        const kind = onRoute ? 'route' : p.networkId ? 'network' : 'mixed'
        const color = onRoute
          ? TEAL
          : p.networkId
            ? colorOf(colors, p.networkId)
            : MIXED
        const names: [string, string] = [nodeName(a), nodeName(b)]
        return {
          id: `line:${a}:${b}`,
          source: a,
          target: b,
          type: 'siteLine',
          interactionWidth: 20,
          data: {
            linkIds: p.linkIds,
            names,
            kind,
            color,
            onRoute,
            onOpen: () =>
              openList(
                `Cables between ${names[0]} and ${names[1]}`,
                `${plural(p.linkIds.length, 'cable')} · ${names[0]} ↔ ${names[1]}`,
                p.linkIds,
              ),
          } satisfies LineData,
          style: {
            stroke: color,
            strokeWidth: siteLineWidth(p.linkIds.length),
            strokeLinecap: 'round' as const,
            strokeDasharray: allProposed(
              p.linkIds,
              installedLinkIDs,
              snapshot.context,
            )
              ? '9 7'
              : undefined,
          },
        }
      }),
    [
      conn,
      marks,
      colors,
      installedLinkIDs,
      snapshot.context,
      nodeName,
      openList,
    ],
  )

  // Local node state carries RF's measurements and in-progress drags.
  const [nodes, setNodes] = useState<CardNode[]>(() =>
    nodesOfSite.map((n) => ({
      id: n.id,
      type: 'siteNode',
      position: target.get(n.id)!,
      data: cards.get(n.id)!,
    })),
  )
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const [fitToken, setFitToken] = useState(0)
  const ready = useRef(false)
  // Hidden (not unmounted) until the first fit is done, so cards never jump in view.
  const [fitted, setFitted] = useState(false)
  const done = useCallback(() => {
    setFitted(true)
    onFitted(siteId)
  }, [onFitted, siteId])
  useEffect(() => {
    onFitted(undefined)
    return () => onFitted(undefined)
  }, [onFitted, siteId])

  // A refetch or a route change reconciles by node ID. A node moves only when
  // its own saved position changed (or it is new, or nothing is saved any more):
  // saving one node never makes the unsaved ones jump, and nothing refits.
  const lastSaved = useRef(new Map(saved.map((p) => [p.nodeId, p])))
  useEffect(() => {
    const prior = new Map(nodesRef.current.map((n) => [n.id, n]))
    const savedNow = new Map(saved.map((p) => [p.nodeId, p]))
    // A node added after the cards were drawn (a new node in a plan) goes to a
    // free place clear of where the others are drawn now, so nothing jumps.
    const drawn = new Map(
      nodesOfSite.flatMap((n) => {
        const was = prior.get(n.id)
        return was ? [[n.id, was.position] as const] : []
      }),
    )
    const placed =
      drawn.size > 0 && drawn.size < nodesOfSite.length
        ? defaultNodeLayout(nodesOfSite, drawn, graph)
        : undefined
    const reset = lastSaved.current.size > 0 && savedNow.size === 0
    const next: CardNode[] = nodesOfSite.map((n) => {
      const was = prior.get(n.id)
      const now = was
        ? target.get(n.id)!
        : (placed?.get(n.id) ?? target.get(n.id)!)
      const before = lastSaved.current.get(n.id)
      const after = savedNow.get(n.id)
      const savedChanged = before?.x !== after?.x || before?.y !== after?.y
      const moved = !was || savedChanged || reset
      return {
        id: n.id,
        type: 'siteNode',
        position: moved ? now : was.position,
        measured: was?.measured,
        data: cards.get(n.id)!,
      }
    })
    lastSaved.current = savedNow
    setNodes(next)
    onPositions(positionMarks(new Map(next.map((n) => [n.id, n.position]))))
    // A layout reset asked for one more fit.
    if (ready.current && session.needsFit(siteId)) {
      setFitted(false)
      onFitted(undefined)
      setFitToken((t) => t + 1)
    }
  }, [
    nodesOfSite,
    target,
    graph,
    saved,
    cards,
    siteId,
    session,
    onPositions,
    onFitted,
  ])

  const record = useCallback(
    () => session.setViewport(siteId, flow.getViewport()),
    [flow, session, siteId],
  )
  // Fit all the cards into the part of the canvas the drawers, the results
  // overlay and the tool rail leave free. It waits for the cards to be measured.
  const surface = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const fitVisible = useCallback(() => {
    cancelAnimationFrame(frame.current)
    let frames = 0
    const attempt = () => {
      const where = visibleArea(surface.current)
      const cards = nodesRef.current.map((n) => flow.getInternalNode(n.id))
      if (where && cards.length && cards.every((c) => c?.measured.width)) {
        const xs = cards.flatMap((c) => [
          c!.internals.positionAbsolute.x,
          c!.internals.positionAbsolute.x + c!.measured.width!,
        ])
        const ys = cards.flatMap((c) => [
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
          .setViewport(
            fitViewport(
              bounds,
              where.box,
              where.covers,
              cards.length > 12 ? FIT_MANY : FIT,
            ),
          )
          .then(() => {
            session.markFitted(siteId)
            record()
            done()
          })
        return
      }
      if (cards.length === 0 || ++frames >= 120) return done() // nothing to fit, or never measured
      frame.current = requestAnimationFrame(attempt)
    }
    // Two frames first: a reset has just moved the cards.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(attempt)
    })
  }, [flow, session, siteId, record, done])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useEffect(() => {
    if (fitToken > 0) fitVisible()
  }, [fitToken, fitVisible])

  const onNodesChange = useCallback(
    (changes: NodeChange<CardNode>[]) =>
      setNodes((previous) => applyNodeChanges(changes, previous)),
    [],
  )

  return (
    <div className="site-screen">
      <div className="site-flow" ref={surface}>
        <ReactFlow<CardNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgeClick={(_, edge) => (edge.data as LineData).onOpen()}
          onNodeDragStop={(_, node) => {
            // A node only in a plan has no saved layout row: it stays where it
            // was dropped for this session, and gets one once it is recorded.
            if (!proposedIds.has(node.id))
              onDrop(node.id, node.position.x, node.position.y)
            onPositions(
              positionMarks(
                new Map(
                  nodesRef.current.map((n) => [
                    n.id,
                    n.id === node.id ? node.position : n.position,
                  ]),
                ),
              ),
            )
          }}
          onInit={() => {
            ready.current = true
            if (session.needsFit(siteId)) fitVisible()
            else done() // restored from the session viewport
          }}
          onMoveEnd={() => record()}
          defaultViewport={session.viewport(siteId)}
          minZoom={0.1}
          maxZoom={1.6}
          nodesConnectable={false}
          deleteKeyCode={null}
          elevateNodesOnSelect={false}
          // An empty site has nothing to fit (and React Flow never initializes it).
          className={
            fitted || nodesOfSite.length === 0 ? undefined : 'site-hidden'
          }
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#c3ccd8"
            gap={20}
            size={1.2}
          />
          <Controls showInteractive={false} />
          <Panel
            position="top-left"
            className="site-note"
            data-testid="site-note"
          >
            Lines are cables between nodes, counted from real cable records.
            Positions are your arrangement, not a floor plan.
            {loadFailed &&
              ' Saved positions could not be loaded; defaults are shown.'}
          </Panel>
          {(edit || snapshotIsInstalled) && (
            <Panel
              position="bottom-right"
              className="site-edit nodrag nopan"
              data-testid="site-edit"
            >
              {edit ? (
                <AddContainer kind="node" parentId={siteId} edit={edit} />
              ) : (
                <p className="installed-hint" data-testid="installed-hint">
                  {installedHint('add a node')}
                </p>
              )}
            </Panel>
          )}
          <Panel position="top-right" className="map-tools">
            <ResetLayout
              onReset={() => {
                setList(undefined)
                onReset()
              }}
            />
          </Panel>
        </ReactFlow>
        {list && (
          <CableList
            label={list.label}
            title={list.title}
            rows={cableRows(index, list.linkIds)}
            onOpen={onOpenEndpoint}
            onClose={() => setList(undefined)}
          />
        )}
        {nodesOfSite.length === 0 && (
          <p className="physical-loading">This site has no nodes.</p>
        )}
      </div>
    </div>
  )
}
