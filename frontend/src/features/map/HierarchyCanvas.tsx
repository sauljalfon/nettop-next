import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  getSmoothStepPath,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeProps,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { Route, Snapshot } from '../../shared/types'
import Name from '../../shared/ui/Name'
import RouteDiagram from '../paths/RouteDiagram'
import type { Sheet } from '../paths/sheet'
import { positionMarks } from '../physical/explorerModel'
import { routeMarks } from '../physical/inventory'
import { FIT, fitViewport, panToShowFirstFit } from './center'
import { HierarchyActions } from './hierarchyActions'
import {
  buildHierarchies,
  type InstalledSets,
  type NetworkHierarchy,
} from './hierarchy'
import { cardByKey } from './hierarchyDetails'
import { litBy, type Selection } from './hierarchySelection'
import HierarchyDrawer from './HierarchyDrawer'
import { hierarchyFit } from './hierarchyFit'
import {
  emphasisMarks,
  highlightedCards,
  hotCards,
  projectHierarchy,
  type HierarchyFlowNode,
  type HierarchyLabelNode,
  type HierarchyLineData,
} from './hierarchyFlow'
import { hierarchyLayout, selectionBoxes } from './hierarchyLayout'
import FrameCard from './FrameCard'
import HierarchyNodeCard from './HierarchyNodeCard'
import HierarchyPanel from './HierarchyPanel'
import { shouldClearOnEscape } from './keys'
import { ClearHighlight } from './MapControls'
import { mapSession, type MapSession } from './mapSession'
import { colorOf, networkColors } from './networkColors'
import { indexSnapshot, type SnapshotIndex } from './snapshotIndex'
import TierCard from './TierCard'
import { visibleArea } from './viewArea'
import './map.css'

const LabelView = memo(function LabelView({
  data,
}: NodeProps<HierarchyLabelNode>) {
  return <span className="hierarchy-label">{data.text}</span>
})

/**
 * One line, orthogonal like the demo's: out of a card's right edge, down or up
 * at `bendX`, into the next one's left edge. A drawing aid; it never feeds a
 * trace, and a click on it does nothing.
 */
function HierarchyLine(props: EdgeProps) {
  const data = props.data as HierarchyLineData
  const [path] = getSmoothStepPath({
    ...props,
    borderRadius: 0,
    centerX: data.bendX,
  })
  const stroke =
    data.onRoute || data.emphasis === 'lit'
      ? 'var(--route)'
      : data.hot
        ? 'var(--amber)'
        : data.proposed
          ? 'var(--proposed)'
          : 'var(--rule-strong)'
  const lit = data.onRoute || data.hot
  const chosen = data.emphasis === 'lit'
  return (
    <g
      data-line={props.id.replace(/^line:/, '')}
      data-on-route={data.onRoute}
      {...emphasisMarks(data.emphasis)}
    >
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={0}
        style={{
          stroke,
          strokeWidth: lit || chosen ? 3 : 1.5,
          opacity: data.emphasis === 'dim' ? 0.25 : undefined,
          strokeLinecap: 'round',
          strokeDasharray: data.proposed ? '6 4' : undefined,
        }}
      />
    </g>
  )
}

const nodeTypes = {
  hierarchyTier: TierCard,
  hierarchyNode: HierarchyNodeCard,
  hierarchyFrame: FrameCard,
  hierarchyLabel: LabelView,
}
const edgeTypes = { hierarchyLine: HierarchyLine }

/** Resolves when the running animations (a drawer sliding in or out) end, or after half a second. */
function settled(): Promise<void> {
  const running = document.getAnimations().map((a) => a.finished.catch(() => 0))
  return Promise.race([
    Promise.all(running),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]).then(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )
}

/** The network each session last fitted: coming back to the same one restores the view. */
const fittedFor = new WeakMap<MapSession, string>()
/** The selection each session last panned to: a remount does not pan to it again. */
const pannedFor = new WeakMap<MapSession, Selection>()

export interface HierarchyProps {
  snapshot: Snapshot
  index?: SnapshotIndex
  /** Of the installed topology; what the plan adds is proposed. */
  installedIDs?: ReadonlySet<string>
  installedLinkIDs?: ReadonlySet<string>
  installedContainerIds?: ReadonlySet<string>
  /** The network the map shows (App: `shownNetworks(...)[0]`); undefined when there is none. */
  networkId?: string
  /** Opens the inspector on this equipment. */
  onSelect: (equipmentId: string) => void
  /** The inspector's Find AGG / BB for this equipment. */
  onFindDevice: (equipmentId: string) => void
  /** A passive chip in the drawer: the route view on that jack. */
  onTraceJack?: (endpointId: string) => void
  onShowInPhysical: (equipmentId: string) => void
  onShowPlace: (target: { nodeId?: string }) => void
  /** The selected route: its cards and lines are lit, nothing moves. */
  route?: Route
  /** The selected route as a walk sheet; the route view draws it over the map. */
  routeSheet?: Sheet
  onRouteStep?: (endpointId: string) => void
  session?: MapSession
}

/** The panel at the top left also covers the canvas: the automatic fit starts right of it. */
function besidePanel(
  where: ReturnType<typeof visibleArea>,
  surface: HTMLElement | null,
): ReturnType<typeof visibleArea> {
  const panel = surface
    ?.querySelector('.hierarchy-panel')
    ?.getBoundingClientRect()
  if (!where || !panel) return where
  const left = Math.max(where.covers.left, panel.right - where.box.left)
  return { ...where, covers: { ...where.covers, left } }
}

/**
 * The hierarchy of one network: tops, AGGs and node cards in frames, drawn from
 * real cables only. Nothing is dragged or saved. It fits once per session and
 * again when the shown network changes (the provider is keyed on it); a refetch,
 * the trace, Only problems and the highlight never refit or move a card.
 */
export default function HierarchyCanvas(props: HierarchyProps) {
  const session = props.session ?? mapSession
  return (
    <ReactFlowProvider key={props.networkId ?? ''}>
      <Canvas {...props} session={session} />
    </ReactFlowProvider>
  )
}

function Canvas({
  snapshot,
  index: givenIndex,
  installedIDs,
  installedLinkIDs,
  installedContainerIds,
  networkId,
  onSelect,
  onFindDevice,
  onTraceJack,
  onShowInPhysical,
  onShowPlace,
  route,
  routeSheet,
  onRouteStep,
  session,
}: HierarchyProps & { session: MapSession }) {
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
  const onlyProblems = useSyncExternalStore(
    session.subscribe,
    session.onlyProblems,
  )
  const routeViewOn = useSyncExternalStore(session.subscribe, session.routeView)
  const active = routeViewOn && !!routeSheet
  useEffect(() => {
    if (routeViewOn && !routeSheet) session.setRouteView(false)
  }, [routeViewOn, routeSheet, session])

  // Snapshot-only work: every network at once. In a plan, what the installed
  // topology lacks is proposed.
  const installed = useMemo<InstalledSets | undefined>(
    () =>
      snapshot.context === 'planned' &&
      installedIDs &&
      installedLinkIDs &&
      installedContainerIds
        ? {
            equipment: installedIDs,
            links: installedLinkIDs,
            containers: installedContainerIds,
          }
        : undefined,
    [snapshot.context, installedIDs, installedLinkIDs, installedContainerIds],
  )
  const hierarchies = useMemo(
    () => buildHierarchies(index, installed),
    [index, installed],
  )
  const h: NetworkHierarchy | undefined =
    networkId === undefined ? undefined : hierarchies.get(networkId)
  const networkName = useCallback(
    (id: string) => snapshot.networks.find((n) => n.id === id)?.name ?? id,
    [snapshot.networks],
  )

  const open = useSyncExternalStore(session.subscribe, session.openNodes)
  const layout = useMemo(
    () => (h ? hierarchyLayout(h, { onlyProblems, open }) : undefined),
    [h, onlyProblems, open],
  )

  // The selection: a node card or a device, from a click or Show on map. What it
  // lights is computed once per selection (and per snapshot), never per render.
  const selection = useSyncExternalStore(session.subscribe, session.selection)
  const lit = useMemo(
    () => (selection ? litBy(hierarchies, index, selection) : undefined),
    [hierarchies, index, selection],
  )
  // A selection whose thing a refetch removed is cleared; the viewport and the open cards stay.
  const gone =
    selection !== undefined &&
    (selection.kind === 'equipment'
      ? !index.equipment.has(selection.id)
      : !hierarchies.has(selection.networkId) ||
        !cardByKey(hierarchies.get(selection.networkId)!, selection.key))
  useEffect(() => {
    if (gone) session.clear()
  }, [gone, session])
  const hotKey =
    selection?.kind === 'card'
      ? selection.networkId === h?.networkId
        ? selection.key
        : undefined
      : selection?.id
  const hot = useMemo(
    () => (h ? hotCards(h, hotKey) : new Set<string>()),
    [h, hotKey],
  )

  const marks = useMemo(() => routeMarks(index, route), [index, route])
  const highlight = useSyncExternalStore(session.subscribe, session.highlight)
  const highlighted = useMemo(
    () => (h ? highlightedCards(h, index, highlight) : new Set<string>()),
    [h, index, highlight],
  )
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

  // Esc clears the selection (and its drawer), unless the user is typing, a
  // dialog is open or the route view is on. The viewport and the open cards stay.
  useEffect(() => {
    if (!selection) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !routeViewOn &&
        shouldClearOnEscape(target) &&
        !target?.closest?.('[role="dialog"], [aria-modal="true"]')
      )
        session.clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, routeViewOn, session])

  // A new selection: show its network, open its cards (never close one).
  useEffect(() => {
    if (!lit || lit.networkId === undefined) return
    if (lit.networkId !== networkId) session.showNetwork(lit.networkId)
    else
      for (const key of lit.openCards)
        if (!session.openNodes().has(key)) session.toggleNode(key)
  }, [selection]) // eslint-disable-line react-hooks/exhaustive-deps

  const projected = useMemo(
    () =>
      h && layout
        ? projectHierarchy({
            h,
            layout,
            index,
            colors,
            marks,
            open,
            highlighted,
            hot,
            lit,
            selection,
          })
        : undefined,
    [h, layout, index, colors, marks, open, highlighted, hot, lit, selection],
  )

  // Local node state carries React Flow's measurements; positions are the projection's.
  const [nodes, setNodes] = useState<HierarchyFlowNode[]>(
    projected?.nodes ?? [],
  )
  useEffect(() => {
    setNodes((previous) => {
      const prior = new Map(previous.map((n) => [n.id, n]))
      return (projected?.nodes ?? []).map((n) => ({
        ...n,
        measured: prior.get(n.id)?.measured,
      }))
    })
  }, [projected])
  const projectedRef = useRef(projected)
  projectedRef.current = projected
  const onNodesChange = useCallback(
    (changes: NodeChange<HierarchyFlowNode>[]) =>
      setNodes((previous) => applyNodeChanges(changes, previous)),
    [],
  )

  const surface = useRef<HTMLDivElement>(null)
  const [fitted, setFitted] = useState(false)
  const frame = useRef(0)
  // Fits everything into the part of the canvas the panel, the drawers and the
  // overlays leave free, once the cards have been measured.
  const fitVisible = useCallback(() => {
    cancelAnimationFrame(frame.current)
    let frames = 0
    const attempt = () => {
      const where = besidePanel(visibleArea(surface.current), surface.current)
      const all = (projectedRef.current?.nodes ?? []).map((n) =>
        flow.getInternalNode(n.id),
      )
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
          .setViewport(
            fitViewport(bounds, where.box, where.covers, hierarchyFit()),
          )
          .then(() => {
            session.setHierarchyViewport(flow.getViewport())
            if (networkId !== undefined) fittedFor.set(session, networkId)
            setFitted(true)
          })
        return
      }
      if (all.length === 0 || ++frames >= 120) return setFitted(true)
      frame.current = requestAnimationFrame(attempt)
    }
    // Two frames first: the nodes have just been drawn.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(attempt)
    })
  }, [flow, session, networkId])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  useEffect(() => {
    const map = surface.current?.querySelector<HTMLElement>('.react-flow')
    if (map) map.inert = active
  }, [active])

  // A new location highlight (Explore) asks for one fit to the highlighted
  // cards, at zoom 1 or less. Each request is handled once, by whichever map
  // sees it first, so a remount never replays it. Cards not measured yet are
  // waited for.
  const fitRequest = useSyncExternalStore(session.subscribe, session.fitRequest)
  useEffect(() => {
    if (!fitRequest || fitRequest.serial <= session.fitHandled()) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const ids = [...highlighted]
        if (ids.length === 0) return session.markFitHandled(fitRequest.serial)
        const boxes = ids.map((id) => flow.getInternalNode(id))
        const where = visibleArea(surface.current)
        if (!where || boxes.some((b) => !b?.measured.width)) return // retried when the nodes change
        session.markFitHandled(fitRequest.serial)
        const xs = boxes.flatMap((b) => [
          b!.internals.positionAbsolute.x,
          b!.internals.positionAbsolute.x + b!.measured.width!,
        ])
        const ys = boxes.flatMap((b) => [
          b!.internals.positionAbsolute.y,
          b!.internals.positionAbsolute.y + (b!.measured.height ?? 0),
        ])
        const bounds = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        }
        void flow
          .setViewport(fitViewport(bounds, where.box, where.covers, FIT), {
            duration: 300,
          })
          .then(() => session.setHierarchyViewport(flow.getViewport()))
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [fitRequest, nodes, highlighted, flow, session])

  // After the first fit, a selection pans (never zooms or refits) to show its
  // card with its frame, or the card alone when both do not fit, when that is not
  // in view: once per selection, after its cards are open and the drawers that
  // stay open have settled (what covers the canvas is read then, not before).
  useEffect(() => {
    if (!selection || !lit || lit.networkId !== networkId || !h) return
    if (!fitted || !layout || pannedFor.get(session) === selection) return
    if (!lit.openCards.every((key) => open.has(key))) return
    const boxes = selectionBoxes(h, layout, lit.scrollTo)
    if (boxes.length === 0) return
    let cancelled = false
    void settled().then(() => {
      const where = visibleArea(surface.current)
      if (cancelled || !where || pannedFor.get(session) === selection) return
      pannedFor.set(session, selection)
      // The hierarchy drawer is over the canvas too.
      const drawer = surface.current
        ?.querySelector('.hierarchy-drawer')
        ?.getBoundingClientRect()
      const covers = {
        ...where.covers,
        right: Math.max(
          where.covers.right,
          drawer ? where.box.right - drawer.left : 0,
        ),
      }
      const view = panToShowFirstFit(
        boxes.map((b) => ({ x: b.x, y: b.y, width: b.w, height: b.h })),
        flow.getViewport(),
        { width: where.box.width, height: where.box.height },
        covers,
      )
      if (view)
        void flow
          .setViewport(view, { duration: 300 })
          .then(() => session.setHierarchyViewport(flow.getViewport()))
    })
    return () => {
      cancelled = true
    }
  }, [selection, lit, networkId, fitted, layout, open, flow, session, h])

  const actions = useMemo(
    () => ({
      onCard: (key: string) =>
        networkId !== undefined &&
        session.select({ kind: 'card', networkId, key }),
      onEquipment: (id: string) => session.select({ kind: 'equipment', id }),
      onClose: (key: string) => {
        session.toggleNode(key)
        const now = session.selection()
        if (now?.kind === 'card' && now.key === key) session.clear()
      },
    }),
    [session, networkId],
  )
  const drawerActions = useMemo(
    () => ({
      onClose: session.clear,
      onInspect: onSelect,
      onFind: onFindDevice,
      onShowEquipment: onShowInPhysical,
      onShowNode: (nodeId: string) => onShowPlace({ nodeId }),
      onSelectEquipment: (id: string) =>
        session.select({ kind: 'equipment', id }),
      onTraceJack: onTraceJack ?? (() => undefined),
    }),
    [
      session,
      onSelect,
      onFindDevice,
      onShowInPhysical,
      onShowPlace,
      onTraceJack,
    ],
  )

  const empty = !h
  const message =
    networkId === undefined ? (
      'No networks yet. Create one with Manage networks.'
    ) : (
      <>
        <Name text={networkName(networkId)} /> has no switches yet.
      </>
    )

  return (
    <div
      className="flow-surface hierarchy-surface"
      ref={surface}
      data-view="hierarchy"
      data-fitted={fitted || empty}
      data-network={networkId ?? ''}
      data-card-positions={layout ? positionMarks(layout.boxes) : ''}
      data-open-cards={[...open].sort().join(' ')}
      data-route-view={active}
    >
      {empty ? (
        <p className="hierarchy-empty">{message}</p>
      ) : (
        <HierarchyActions.Provider value={actions}>
          <ReactFlow<HierarchyFlowNode>
            nodes={nodes}
            edges={projected?.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onInit={() => {
              if (
                !session.hierarchyNeedsFit() &&
                networkId !== undefined &&
                fittedFor.get(session) === networkId
              )
                setFitted(true) // restored from the session viewport
              else fitVisible()
            }}
            onMoveEnd={(_, viewport) => session.setHierarchyViewport(viewport)}
            defaultViewport={session.hierarchyViewport()}
            nodesDraggable={false}
            nodesConnectable={false}
            deleteKeyCode={null}
            elevateNodesOnSelect={false}
            minZoom={0.1}
            maxZoom={1.6}
            className={fitted ? undefined : 'hierarchy-hidden'}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="var(--rule)"
              gap={20}
              size={1.2}
            />
            {!active && <Controls showInteractive={false} />}
            {!active && (
              <HierarchyPanel
                networkName={networkName(h.networkId)}
                counts={h.counts}
                onlyProblems={onlyProblems}
                onOnlyProblems={session.setOnlyProblems}
                nothing={onlyProblems && layout?.frames.size === 0}
              />
            )}
            <Panel position="top-right" className="map-tools">
              {!active && highlight && (
                <ClearHighlight
                  onClear={() => session.setHighlight(undefined)}
                />
              )}
            </Panel>
          </ReactFlow>
        </HierarchyActions.Provider>
      )}
      {!active && selection && !gone && (
        <HierarchyDrawer
          hierarchies={hierarchies}
          index={index}
          selection={selection}
          colorOf={(id) => colorOf(colors, id)}
          isProposed={(id) =>
            snapshot.context === 'planned' &&
            !!installedIDs &&
            !installedIDs.has(id)
          }
          networkName={networkName}
          actions={drawerActions}
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
