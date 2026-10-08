import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  GitBranch,
  GitFork,
  Highlighter,
  Layers,
  MapPin,
  Network,
  PanelTop,
  Plus,
  Search,
  Server,
  Settings2,
  X,
} from 'lucide-react'
import { getPlans, getSnapshot, sendPlanCommand, trace } from '../shared/api'
import type { Context, Plan, Snapshot, TraceRequest } from '../shared/types'
import ConceptualMap, {
  type PendingEquipment,
} from '../features/map/ConceptualMap'
import { drawerSides } from '../features/map/drawers'
import NetworksDrawer from '../features/networks/NetworksDrawer'
import PhysicalExplorer from '../features/physical/PhysicalExplorer'
import { openLocation } from '../features/physical/explorerModel'
import { physicalSession } from '../features/physical/physicalSession'
import {
  chooseRoute,
  traceSession,
  type RouteRef,
} from '../features/pathfinding/traceSession'
import { mapSession } from '../features/map/mapSession'
import { highlightFor, type LocationRef } from '../features/map/highlight'
import {
  NetworkSelect,
  ViewSwitch,
  type MapView,
} from '../features/map/MapControls'
import MapResults from '../features/map/MapResults'
import MapTraceError from '../features/map/MapTraceError'
import PlanEditor from '../features/planning/PlanEditor'
import PlacementEditor from '../features/planning/PlacementEditor'
import TracePicker from '../features/pathfinding/TracePicker'
import { pickerItems } from '../features/pathfinding/picker'
import { filterTree } from '../features/explore/tree'
import { canFindFromDevice } from '../features/inspector/model'
import { endpointLabel } from '../features/pathfinding/projection'
import Inspector from '../features/inspector/Inspector'
import { indexSnapshot } from '../features/map/snapshotIndex'
import { searchEquipment } from '../features/map/search'
import './styles.css'

const ROUTE_NOT_HERE =
  'The selected route is not in this context; showing the first.'

type Drawer =
  'library' | 'explorer' | 'plans' | 'inspector' | 'trace' | 'networks' | null

export default function App() {
  const client = useQueryClient()
  const [context, setContext] = useState<Context>(() =>
    new URLSearchParams(location.search).has('plan') ? 'planned' : 'installed',
  )
  const [planID, setPlanID] = useState(
    () => new URLSearchParams(location.search).get('plan') ?? '',
  )
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [pending, setPending] = useState<PendingEquipment>()
  const [status, setStatus] = useState('')
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const [view, setView] = useState<MapView>('conceptual')
  const [networkChoice, setNetworkChoice] = useState<string>()
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: ({ signal }) => getPlans(signal),
  })
  const installed = useQuery({
    queryKey: ['topology', 'installed'],
    queryFn: ({ signal }) => getSnapshot('installed', signal),
  })
  const selectedPlan =
    plans.data?.find((p) => p.id === planID) ??
    (!planID ? plans.data?.[0] : undefined)
  const selectedID = context === 'planned' ? selectedPlan?.id : undefined
  const topology = useQuery({
    queryKey:
      context === 'installed'
        ? ['topology', 'installed']
        : ['topology', 'planned', selectedID],
    queryFn: ({ signal }) => getSnapshot(context, signal, selectedID),
    enabled: context === 'installed' || !!selectedID,
  })
  useEffect(() => {
    const url = new URL(location.href)
    if (context === 'planned' && selectedID)
      url.searchParams.set('plan', selectedID)
    else url.searchParams.delete('plan')
    history.replaceState(null, '', url)
  }, [context, selectedID])
  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current)
    },
    [],
  )
  const notify = useCallback((message: string) => {
    setStatus(message)
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(''), 5000)
  }, [])
  const refresh = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['plans'] }),
      client.invalidateQueries({ queryKey: ['topology'] }),
    ])
  }, [client])
  const saved = useCallback(
    async (plan: Plan) => {
      client.setQueryData<Plan[]>(['plans'], (previous) =>
        previous?.some((p) => p.id === plan.id)
          ? previous.map((p) => (p.id === plan.id ? plan : p))
          : [...(previous ?? []), plan],
      )
      await client.invalidateQueries({
        queryKey: ['topology', 'planned', plan.id],
      })
      notify(`Saved ${plan.name} · revision ${plan.revision}`)
    },
    [client, notify],
  )
  const requestEquipment = useCallback(
    (
      kind: 'switch' | 'panel',
      rackID?: string,
      unit?: number,
      position?: { x: number; y: number },
      role?: 'aggregation',
    ) => {
      const current = topology.data
      if (context !== 'planned' || !selectedPlan || !current) return
      const rack = current.racks.find((r) => r.id === rackID),
        occupied = new Set(
          current.equipment
            .filter((e) => e.rackId === rackID)
            .flatMap((e) =>
              Array.from({ length: e.height }, (_, i) => e.unit + i),
            ),
        )
      const first = rack
        ? Array.from({ length: rack.units }, (_, i) => i + 1).find(
            (u) => !occupied.has(u),
          )
        : undefined
      setPending({
        token: Date.now(),
        kind,
        role,
        rackId: rackID ?? '',
        unit: unit ?? first ?? 1,
        position: position ?? (!rackID ? { x: 70, y: 70 } : undefined),
      })
      setDrawer('plans')
    },
    [topology.data, context, selectedPlan],
  )
  const configurePreview = useCallback(() => setDrawer('plans'), [])
  const openInspector = useCallback(() => setDrawer('inspector'), [])
  const toggleDrawer = (value: Drawer) =>
    setDrawer((previous) => (previous === value ? null : value))
  const setMode = (next: Context) => {
    setPending(undefined)
    setContext(next)
    setDrawer(next === 'planned' ? 'plans' : null)
    setStatus('')
  }
  const error = topology.error ?? installed.error ?? plans.error
  const networks = topology.data?.networks ?? installed.data?.networks ?? []
  // A network that does not exist in this context falls back to All networks.
  const networkId = networks.some((n) => n.id === networkChoice)
    ? networkChoice
    : undefined
  return (
    <div
      className={`studio ${drawerSides(drawer).left ? 'drawer-left' : ''} ${drawerSides(drawer).right ? 'drawer-right' : ''}`}
    >
      <header className="studio-header">
        <div className="brand">
          <span className="brand-mark">
            <Network size={21} />
          </span>
          net<span>top</span>
        </div>
        <span className="header-divider" />
        <div className="workspace-title">
          <strong>Network Studio</strong>
          <small>Infrastructure workspace</small>
        </div>
        <ViewSwitch view={view} onChange={setView} />
        <NetworkSelect
          networks={networks}
          value={networkId}
          onChange={setNetworkChoice}
          onManage={() => setDrawer('networks')}
        />
        <div className="context-switch">
          <button
            className={context === 'installed' ? 'active' : ''}
            aria-pressed={context === 'installed'}
            onClick={() => setMode('installed')}
          >
            Installed
          </button>
          <button
            className={context === 'planned' ? 'active' : ''}
            aria-pressed={context === 'planned'}
            onClick={() => setMode('planned')}
          >
            <GitBranch size={14} />
            Plan: {selectedPlan?.name ?? 'New draft'}
          </button>
        </div>
        <button
          className="header-action"
          onClick={() => toggleDrawer('plans')}
          aria-expanded={drawer === 'plans'}
        >
          <Layers size={16} />
          Changes
          {context === 'planned' && (
            <span className="count-badge">
              {(selectedPlan?.equipment.length ?? 0) +
                (selectedPlan?.updates?.length ?? 0) +
                (selectedPlan?.links.filter((l) => l.kind === 'cable').length ??
                  0)}
            </span>
          )}
        </button>
        <span className="local-label">LOCAL DEV</span>
      </header>
      <nav className="tool-rail" aria-label="Workspace tools">
        <button
          aria-label="Add equipment library"
          aria-expanded={drawer === 'library'}
          className={drawer === 'library' ? 'active' : ''}
          onClick={() => toggleDrawer('library')}
        >
          <Plus />
          <span>Add</span>
        </button>
        <button
          aria-label="Open explorer"
          aria-expanded={drawer === 'explorer'}
          className={drawer === 'explorer' ? 'active' : ''}
          onClick={() => toggleDrawer('explorer')}
        >
          <Search />
          <span>Explore</span>
        </button>
        <button
          aria-label="Open trace tools"
          aria-expanded={drawer === 'trace'}
          className={drawer === 'trace' ? 'active' : ''}
          onClick={() => toggleDrawer('trace')}
        >
          <GitFork />
          <span>Trace</span>
        </button>
        <button
          aria-label="Open inspector"
          aria-expanded={drawer === 'inspector'}
          className={drawer === 'inspector' ? 'active' : ''}
          onClick={() => toggleDrawer('inspector')}
        >
          <Settings2 />
          <span>Inspect</span>
        </button>
      </nav>
      {error ? (
        <div className="workspace-message" role="alert">
          <h2>Cannot load the workspace</h2>
          <p>{error.message}</p>
          <button className="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : !installed.data ||
        !plans.data ||
        ((context === 'installed' || selectedID) && !topology.data) ? (
        <div className="workspace-message">Loading infrastructure…</div>
      ) : context === 'planned' && !selectedPlan ? (
        <div className="workspace-message">
          Create or select a plan in Changes to begin.
        </div>
      ) : (
        topology.data && (
          <Workspace
            key={`${context}:${selectedID ?? 'installed'}`}
            snapshot={topology.data}
            installed={installed.data}
            plan={context === 'planned' ? selectedPlan : undefined}
            drawer={drawer}
            closeDrawer={() => setDrawer(null)}
            pending={pending}
            onCreateEquipment={requestEquipment}
            onConfigurePreview={configurePreview}
            onSelectEquipment={openInspector}
            onPlanSaved={saved}
            onRefresh={refresh}
            view={view}
            onViewChange={setView}
            networkId={networkId}
          />
        )
      )}
      {drawer === 'plans' && installed.data && plans.data && (
        <DrawerPanel
          title="Changes & plans"
          subtitle="Proposals stay separate from installed infrastructure"
          onClose={() => setDrawer(null)}
          side="right"
        >
          {context === 'installed' ? (
            <div className="empty-state">
              <GitBranch size={28} />
              <h3>Plan a change</h3>
              <p>
                Installed infrastructure is read-only here. Create a draft to
                add equipment, connect ports, or propose a new placement.
              </p>
              <button
                className="button primary"
                onClick={() => setMode('planned')}
              >
                Open planning workspace
              </button>
            </div>
          ) : (
            <>
              {pending && !pending.rackId && (
                <div className="notice">
                  <strong>Unplaced equipment preview</strong>
                  <p>
                    Choose its rack before saving. This preview is not part of
                    the network or trace graph.
                  </p>
                </div>
              )}
              <PlanEditor
                plans={plans.data}
                selected={selectedPlan}
                installed={installed.data}
                snapshot={topology.data}
                onSelect={(id) => {
                  setPending(undefined)
                  setPlanID(id)
                }}
                onSaved={saved}
                onRefresh={refresh}
                createRequest={pending}
                onCancelPreview={() => setPending(undefined)}
                onEquipmentAdded={() => {
                  setPending(undefined)
                  setDrawer(null)
                }}
              />
            </>
          )}
        </DrawerPanel>
      )}
      {drawer === 'networks' && topology.data && (
        <DrawerPanel
          title="Manage networks"
          subtitle="Networks are shared by every view."
          onClose={() => setDrawer(null)}
          side="right"
        >
          <NetworksDrawer
            snapshot={topology.data}
            onChanged={async (message) => {
              await refresh()
              notify(message)
            }}
          />
        </DrawerPanel>
      )}
      {status && (
        <div className="save-toast" role="status">
          ✓ {status}
        </div>
      )}
    </div>
  )
}

export function DrawerPanel({
  title,
  subtitle,
  onClose,
  side = 'left',
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  side?: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <aside className={`studio-drawer ${side}`} aria-label={title}>
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="drawer-content">{children}</div>
    </aside>
  )
}

interface WorkspaceProps {
  snapshot: Snapshot
  installed: Snapshot
  plan?: Plan
  drawer: Drawer
  closeDrawer: () => void
  pending?: PendingEquipment
  onCreateEquipment: (
    kind: 'switch' | 'panel',
    rackID?: string,
    unit?: number,
    position?: { x: number; y: number },
    role?: 'aggregation',
  ) => void
  onConfigurePreview: () => void
  onSelectEquipment: () => void
  onPlanSaved: (plan: Plan) => Promise<void>
  onRefresh: () => Promise<void>
  view: MapView
  onViewChange: (view: MapView) => void
  networkId?: string
}

function Workspace({
  snapshot,
  installed,
  plan,
  drawer,
  closeDrawer,
  pending,
  onCreateEquipment,
  onConfigurePreview,
  onSelectEquipment,
  onPlanSaved,
  onRefresh,
  view,
  onViewChange,
  networkId,
}: WorkspaceProps) {
  const [selected, setSelected] = useState(snapshot.equipment[0]?.id ?? '')
  const [physicalError, setPhysicalError] = useState('')
  const [mode, setMode] = useState<'distribution' | 'point_to_point'>(
    'distribution',
  )
  const [start, setStart] = useState(
    snapshot.equipment.find((e) => e.role === 'access')
      ? `device:${snapshot.equipment.find((e) => e.role === 'access')!.id}`
      : (snapshot.endpoints[0]?.id ?? ''),
  )
  const [end, setEnd] = useState(
    snapshot.endpoints.find((p) =>
      snapshot.equipment.some(
        (e) => e.id === p.equipmentId && e.role === 'aggregation',
      ),
    )?.id ?? '',
  )
  const [routeIndex, setRouteIndex] = useState(0)
  const [routeFellBack, setRouteFellBack] = useState(false)
  const traceMutation = useMutation({
    mutationFn: (input: { request: TraceRequest; wanted?: RouteRef }) =>
      trace(snapshot.context, input.request, plan?.id, snapshot.revision),
    onSuccess: (data, input) => {
      // The route with the same start and end as before, else the first.
      const chosen = chooseRoute(data, input.wanted)
      const route = data.routes[chosen.index]
      setRouteIndex(chosen.index)
      setRouteFellBack(chosen.fellBack)
      traceSession.selectRoute(route && { start: route.start, end: route.end })
    },
  })
  // A trace the user starts is remembered outside this Workspace, so an
  // Installed/Plan switch (which remounts it) can run it again; clearing forgets it.
  const startTrace = useCallback(
    (request: TraceRequest) => {
      traceSession.start(request)
      setRouteFellBack(false)
      traceMutation.mutate({ request })
    },
    [traceMutation.mutate],
  )
  const clearTrace = useCallback(() => {
    traceSession.clear()
    setRouteFellBack(false)
    traceMutation.reset()
  }, [traceMutation.reset])
  const placement = useMutation({
    mutationFn: (input: {
      equipmentId: string
      rackId: string
      unit: number
    }) =>
      sendPlanCommand(plan!.id, {
        type: 'move_equipment',
        expectedRevision: plan!.revision,
        placement: input,
      }),
    onSuccess: onPlanSaved,
  })
  const equipment =
    snapshot.equipment.find((e) => e.id === selected) ?? snapshot.equipment[0]
  // The trace pickers' lists, built once per snapshot (and mode).
  const startItems = useMemo(
    () => pickerItems(snapshot, { devices: mode === 'distribution' }),
    [snapshot, mode],
  )
  const endItems = useMemo(
    () => pickerItems(snapshot, { devices: false }),
    [snapshot],
  )
  // Snapshot-only work, shared by the map and the inspector.
  const index = useMemo(() => indexSnapshot(snapshot), [snapshot])
  const routeView = useSyncExternalStore(
    mapSession.subscribe,
    mapSession.routeView,
  )
  const installedIDs = useMemo(
    () => new Set(installed.equipment.map((e) => e.id)),
    [installed.equipment],
  )
  const installedLinkIDs = useMemo(
    () => new Set(installed.links.map((l) => l.id)),
    [installed.links],
  )
  const route =
    traceMutation.data?.revision === snapshot.revision
      ? traceMutation.data.routes[routeIndex]
      : undefined
  // On mount (a context switch) and whenever the topology revision changes, the
  // remembered trace is run again against this snapshot.
  useEffect(() => {
    placement.reset()
    const stored = traceSession.get()
    if (!stored) return traceMutation.reset()
    setRouteFellBack(false)
    traceMutation.mutate({ request: stored.request, wanted: stored.route })
  }, [snapshot.revision])
  const chooseRouteIndex = useCallback(
    (i: number) => {
      setRouteIndex(i)
      setRouteFellBack(false)
      const r = traceMutation.data?.routes[i]
      traceSession.selectRoute(r && { start: r.start, end: r.end })
    },
    [traceMutation.data],
  )
  const select = useCallback(
    (id: string) => {
      setSelected(id)
      onSelectEquipment()
    },
    [onSelectEquipment],
  )
  const selectPort = useCallback(
    (id: string) => {
      const port = snapshot.endpoints.find((p) => p.id === id)
      if (!port) return
      setSelected(port.equipmentId)
      setStart(id)
      clearTrace()
      onSelectEquipment()
    },
    [snapshot.endpoints, onSelectEquipment, clearTrace],
  )
  const traceFromPort = useCallback(
    (id: string) => {
      const port = snapshot.endpoints.find((p) => p.id === id)
      if (!port) return
      setSelected(port.equipmentId)
      setMode('distribution')
      setStart(id)
      startTrace({ mode: 'distribution', start: id })
    },
    [snapshot.endpoints, startTrace],
  )
  // Choosing a site or node (in Explore, or from the inspector's location links):
  // highlight its equipment and cables on the map, and fit the view to them once.
  const highlightLocation = useCallback(
    (location: LocationRef) => {
      mapSession.setHighlight(location)
      onViewChange('conceptual')
      const h = highlightFor(index, location)
      if (h) mapSession.requestFit([...h.equipmentIds, ...h.neighborIds])
    },
    [index, onViewChange],
  )
  // In Physical, Explore navigates Physical: site and node open their screens.
  const openPlace = useCallback(
    (target: { siteId?: string; nodeId?: string }) =>
      physicalSession.navigate(openLocation(index, target)),
    [index],
  )
  // A hop or a cable end opened in Physical selects its equipment (without the
  // inspector) and shows its rack; the equipment page comes with M4 step 6.
  const openEquipmentPhysical = useCallback(
    (equipmentId: string) => {
      setSelected(equipmentId)
      physicalSession.navigate(openLocation(index, { equipmentId }))
    },
    [index],
  )
  // From the inspector or a hop in either view: the equipment page, with an
  // endpoint selected when given. Selection is shared, so the inspector keeps it.
  const showInPhysical = useCallback(
    (equipmentId: string, endpointId?: string) => {
      setSelected(equipmentId)
      physicalSession.navigate(openLocation(index, { equipmentId, endpointId }))
      onViewChange('physical')
    },
    [index, onViewChange],
  )
  const openEndpointPhysical = useCallback(
    (endpointId: string) => {
      const owner = index.owner.get(endpointId)
      if (owner) setSelected(owner)
      physicalSession.navigate(openLocation(index, { endpointId }))
    },
    [index],
  )
  const openRack = useCallback(
    (id: string) => {
      physicalSession.navigate(openLocation(index, { rackId: id }))
      onViewChange('physical')
    },
    [index, onViewChange],
  )
  const canEdit =
    !!plan &&
    snapshot.revision === `${plan.baseRevision}/${plan.id}@${plan.revision}` &&
    !placement.isPending
  const move = useCallback(
    (id: string, rackID: string, unit?: number) => {
      if (!plan) return
      const item = snapshot.equipment.find((e) => e.id === id),
        rack = snapshot.racks.find((r) => r.id === rackID)
      if (!item || !rack) return
      const occupied = new Set(
        snapshot.equipment
          .filter((e) => e.rackId === rackID && e.id !== id)
          .flatMap((e) =>
            Array.from({ length: e.height }, (_, i) => e.unit + i),
          ),
      )
      const first = Array.from({ length: rack.units }, (_, i) => i + 1).find(
        (u) =>
          u + item.height - 1 <= rack.units &&
          Array.from({ length: item.height }, (_, i) => u + i).every(
            (slot) => !occupied.has(slot),
          ),
      )
      placement.mutate({
        equipmentId: id,
        rackId: rackID,
        unit: unit ?? first ?? rack.units + 1,
      })
    },
    [plan, snapshot],
  )
  function runTrace() {
    startTrace(
      mode === 'point_to_point'
        ? { mode, start, end }
        : start.startsWith('device:')
          ? { mode, device: start.slice(7) }
          : { mode, start },
    )
  }
  function traceSelectedDevice() {
    if (equipment) {
      setMode('distribution')
      setStart(`device:${equipment.id}`)
      startTrace({ mode: 'distribution', device: equipment.id })
    }
  }
  // Select the card, show the map and center on the card. No highlight.
  const showOnMap = useCallback(
    (id: string) => {
      setSelected(id)
      onViewChange('conceptual')
      mapSession.requestCenter(id)
    },
    [onViewChange],
  )
  // Equipment chosen in Explore (a click, or Enter in its search) also opens the inspector.
  const chooseEquipment = useCallback(
    (id: string) => {
      if (view === 'physical') return openEquipmentPhysical(id)
      showOnMap(id)
      onSelectEquipment()
    },
    [view, openEquipmentPhysical, showOnMap, onSelectEquipment],
  )
  const drawerEquipment = equipment && (
    <Inspector
      snapshot={snapshot}
      index={index}
      equipment={equipment}
      installedIDs={installedIDs}
      session={mapSession}
      onFindFromDevice={traceSelectedDevice}
      onFindFromHere={traceFromPort}
      onShowOnMap={showOnMap}
      onShowInPhysical={showInPhysical}
      onHighlight={highlightLocation}
      onOpenRack={openRack}
    >
      {plan && (
        <PlacementEditor
          key={`${equipment.id}:${equipment.rackId}:${equipment.unit}`}
          equipment={equipment}
          racks={snapshot.racks}
          pending={!canEdit}
          onMove={(input) => placement.mutate(input)}
        />
      )}
    </Inspector>
  )
  return (
    <main className="workspace-canvas">
      {view === 'conceptual' && (
        <div className="canvas-topline">
          <div>
            <span className="eyebrow">CONCEPTUAL MAP</span>
            <h1>Connected infrastructure.</h1>
          </div>
        </div>
      )}
      {view === 'conceptual' ? (
        <ConceptualMap
          snapshot={snapshot}
          index={index}
          installedIDs={installedIDs}
          installedLinkIDs={installedLinkIDs}
          selected={selected}
          route={route}
          networkId={networkId}
          onSelect={select}
          onPort={traceFromPort}
          canEdit={canEdit}
          onCreateEquipment={onCreateEquipment}
          preview={pending}
          onConfigurePreview={onConfigurePreview}
        />
      ) : (
        <PhysicalExplorer
          snapshot={snapshot}
          index={index}
          route={route}
          networkId={networkId}
          installedLinkIDs={installedLinkIDs}
          selectedEquipmentId={selected}
          installedIds={installedIDs}
          canEdit={canEdit}
          onMoveEquipment={move}
          onCreateEquipment={(kind, rackID, unit, role) =>
            onCreateEquipment(kind, rackID, unit, undefined, role)
          }
          onSelectEquipment={setSelected}
          onFindFromEndpoint={traceFromPort}
          onShowOnMap={showOnMap}
          onError={setPhysicalError}
        />
      )}
      {drawer === 'library' && (
        <DrawerPanel
          title="Equipment library"
          subtitle="Drag onto a rack, or start an unplaced preview"
          onClose={closeDrawer}
        >
          <EquipmentLibrary canEdit={canEdit} onCreate={onCreateEquipment} />
        </DrawerPanel>
      )}
      {drawer === 'explorer' && (
        <DrawerPanel
          title="Explore infrastructure"
          subtitle="Site → node → rack → equipment"
          onClose={closeDrawer}
        >
          <Explorer
            snapshot={snapshot}
            selected={selected}
            onChoose={chooseEquipment}
            onOpenRack={openRack}
            onHighlight={highlightLocation}
            physical={view === 'physical'}
            onOpenPlace={openPlace}
            canEdit={canEdit}
          />
        </DrawerPanel>
      )}
      {(drawer === 'inspector' || drawer === 'trace') && (
        <DrawerPanel
          title={drawer === 'trace' ? 'Trace tools' : 'Equipment inspector'}
          subtitle={
            drawer === 'trace'
              ? 'Exact physical continuity, calculated by Go'
              : 'Select equipment on the map to inspect it'
          }
          onClose={closeDrawer}
          side="right"
        >
          {drawer === 'inspector' && drawerEquipment}
          {drawer === 'trace' && (
            <section className="trace-form">
              <p className="section-label">Pathfinding</p>
              <label>
                Trace mode
                <select
                  value={mode}
                  disabled={traceMutation.isPending}
                  onChange={(e) => {
                    const next = e.target.value as typeof mode
                    setMode(next)
                    if (
                      next === 'point_to_point' &&
                      start.startsWith('device:')
                    )
                      setStart(
                        snapshot.endpoints.find(
                          (p) => p.equipmentId === start.slice(7),
                        )?.id ?? '',
                      )
                    clearTrace()
                  }}
                >
                  <option value="distribution">Find AGG / BB</option>
                  <option value="point_to_point">Exact port → port</option>
                </select>
              </label>
              <TracePicker
                label="Start"
                items={startItems}
                value={start}
                disabled={traceMutation.isPending}
                onChange={(value) => {
                  setStart(value)
                  clearTrace()
                }}
              />
              {mode === 'point_to_point' && (
                <TracePicker
                  label="Destination"
                  items={endItems}
                  value={end}
                  onChange={(value) => {
                    setEnd(value)
                    clearTrace()
                  }}
                />
              )}
              <button
                className="button primary"
                disabled={traceMutation.isPending || !start}
                onClick={runTrace}
              >
                {traceMutation.isPending
                  ? 'Tracing…'
                  : mode === 'distribution'
                    ? 'Find AGG / BB'
                    : 'Trace physical path'}
              </button>
              <p className="muted">
                Cables and panel bridges only. No inferred transit through
                switch ports.
              </p>
            </section>
          )}
          {traceMutation.error && (
            <p role="alert" className="inline-error">
              {traceMutation.error.message}
              <button className="text-button" onClick={() => void onRefresh()}>
                Refresh topology
              </button>
            </p>
          )}
          {placement.error && (
            <p role="alert" className="inline-error">
              {placement.error.message}
              <button className="text-button" onClick={() => void onRefresh()}>
                Refresh draft
              </button>
            </p>
          )}
        </DrawerPanel>
      )}
      {placement.error && drawer !== 'inspector' && (
        <div role="alert" className="error-toast">
          {placement.error.message}
          <button
            onClick={() => placement.reset()}
            className="icon-button"
            aria-label="Dismiss placement error"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {/* The Trace and inspector drawers show a trace error themselves. */}
      {view === 'conceptual' &&
        traceMutation.error &&
        drawer !== 'inspector' &&
        drawer !== 'trace' && (
          <MapTraceError
            message={traceMutation.error.message}
            onRefresh={() => void onRefresh()}
            onDismiss={() => clearTrace()}
          />
        )}
      {traceMutation.data?.revision === snapshot.revision && (
        <MapResults
          snapshot={snapshot}
          index={index}
          note={routeFellBack ? ROUTE_NOT_HERE : undefined}
          result={traceMutation.data}
          routeIndex={routeIndex}
          onRoute={chooseRouteIndex}
          onHop={(endpointId) => {
            const port = snapshot.endpoints.find((p) => p.id === endpointId)
            if (!port) return
            if (view === 'physical') return openEndpointPhysical(endpointId)
            select(port.equipmentId)
            mapSession.requestCenter(port.equipmentId)
          }}
          onShowInPhysical={(endpointId) => {
            const owner = snapshot.endpoints.find((p) => p.id === endpointId)
            if (owner) showInPhysical(owner.equipmentId, endpointId)
          }}
          onClear={() => clearTrace()}
          routeView={routeView}
          onRouteView={mapSession.setRouteView}
          planName={plan?.name}
          physical={view === 'physical'}
        />
      )}
      {physicalError && (
        <div role="alert" className="error-toast">
          {physicalError}
          <button
            onClick={() => setPhysicalError('')}
            className="icon-button"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  )
}

function EquipmentLibrary({
  canEdit,
  onCreate,
}: {
  canEdit: boolean
  onCreate: WorkspaceProps['onCreateEquipment']
}) {
  return (
    <>
      <div className="notice">
        <strong>
          {canEdit ? 'Build your planned network' : 'Installed view'}
        </strong>
        <p>
          {canEdit
            ? 'Drop inside a rack to assign it. Drop on empty canvas to preview without saving.'
            : 'Switch to a plan in the top bar to add or move equipment.'}
        </p>
      </div>
      {(
        [
          {
            name: 'Access switch',
            kind: 'switch',
            role: undefined,
            Icon: Network,
            description: 'Connect endpoints at the edge',
          },
          {
            name: 'Aggregation',
            kind: 'switch',
            role: 'aggregation',
            Icon: GitFork,
            description: 'An AGG destination for Find AGG / BB',
          },
          {
            name: 'Patch panel',
            kind: 'panel',
            role: undefined,
            Icon: PanelTop,
            description: 'Front / rear continuity per position',
          },
        ] as const
      ).map((item) => (
        <button
          key={item.name}
          className="library-item"
          draggable={canEdit}
          disabled={!canEdit}
          onDragStart={(e) => {
            e.dataTransfer.setData(
              'application/x-nettop-item',
              `new:${item.kind}:::${item.role ?? ''}`,
            )
            e.dataTransfer.effectAllowed = 'copy'
          }}
          onClick={() =>
            onCreate(item.kind, undefined, undefined, undefined, item.role)
          }
        >
          <span className="equipment-icon">
            <item.Icon size={22} />
          </span>
          <div>
            <strong>{item.name}</strong>
            <small>{item.description}</small>
          </div>
          <span className="drag-grip">⠿</span>
        </button>
      ))}
      <p className="muted">
        Site, node, and rack creation will be added through the same validated
        planning model.
      </p>
    </>
  )
}

function Explorer({
  snapshot,
  selected,
  onChoose,
  onOpenRack,
  onHighlight,
  physical,
  onOpenPlace,
  canEdit,
}: {
  snapshot: Snapshot
  selected: string
  /** Select the equipment, open the inspector and center on its card. */
  onChoose: (id: string) => void
  onOpenRack: (id: string) => void
  /** Highlight a site or node on the map. */
  onHighlight: (location: LocationRef) => void
  /** In Physical, a site or node opens its screen instead of highlighting on the map. */
  physical: boolean
  onOpenPlace: (target: { siteId?: string; nodeId?: string }) => void
  canEdit: boolean
}) {
  const [search, setSearch] = useState('')
  const tree = useMemo(() => filterTree(snapshot, search), [snapshot, search])
  return (
    <>
      <label className="search">
        <Search size={17} />
        <input
          aria-label="Find equipment"
          placeholder="Find equipment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(event) => {
            // Enter chooses the first match: names by prefix first, then the rest.
            if (event.key !== 'Enter') return
            const first = searchEquipment(snapshot.equipment, search)[0]
            if (first) onChoose(first.id)
          }}
        />
      </label>
      {/* With search text, sites, nodes and racks without a match are hidden. */}
      {tree.map(({ site, nodes }) => (
        <section key={site.id} className="explorer-site">
          <h3>
            <MapPin size={16} />
            <button
              className="location-name"
              aria-label={
                physical
                  ? `Open ${site.name} in Physical`
                  : `Highlight ${site.name} on the map`
              }
              title={physical ? 'Open in Physical' : 'Highlight on the map'}
              onClick={() =>
                physical
                  ? onOpenPlace({ siteId: site.id })
                  : onHighlight({ kind: 'site', id: site.id })
              }
            >
              {site.name}
              {!physical && (
                <Highlighter size={13} className="location-icon" aria-hidden />
              )}
            </button>
          </h3>
          {nodes.map(({ node, racks }) => (
            <section key={node.id} className="explorer-node">
              <h4>
                <Building2 size={15} />
                <button
                  className="location-name"
                  aria-label={
                    physical
                      ? `Open ${node.name} in Physical`
                      : `Highlight ${node.name} on the map`
                  }
                  title={physical ? 'Open in Physical' : 'Highlight on the map'}
                  onClick={() =>
                    physical
                      ? onOpenPlace({ nodeId: node.id })
                      : onHighlight({ kind: 'node', id: node.id })
                  }
                >
                  {node.name}
                  {!physical && (
                    <Highlighter
                      size={13}
                      className="location-icon"
                      aria-hidden
                    />
                  )}
                </button>
              </h4>
              {racks.map(({ rack, equipment }) => (
                <section className="tree-rack" key={rack.id}>
                  <button
                    className="rack-link"
                    onClick={() => onOpenRack(rack.id)}
                  >
                    <Server size={15} />
                    {rack.name}
                    <small>{rack.units}U ↗</small>
                  </button>
                  {equipment.map((e) => (
                    <button
                      className={`tree-equipment ${selected === e.id ? 'active' : ''}`}
                      draggable={canEdit}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-nettop-item',
                          `equipment:${e.id}`,
                        )
                        event.dataTransfer.effectAllowed = 'copyMove'
                      }}
                      key={e.id}
                      onClick={() => onChoose(e.id)}
                    >
                      <span className="dot" />
                      {e.name}
                      <small>U{e.unit}</small>
                    </button>
                  ))}
                </section>
              ))}
            </section>
          ))}
        </section>
      ))}
      {search.trim() && tree.length === 0 && (
        <p className="muted">No equipment matches.</p>
      )}
    </>
  )
}
