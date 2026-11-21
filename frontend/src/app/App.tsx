import {
  memo,
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
  Plus,
  Search,
  Server,
  Settings2,
  X,
} from 'lucide-react'
import {
  APIError,
  getPlans,
  getSnapshot,
  removeChange,
  sendBatch,
  sendPlanCommand,
  trace,
} from '../shared/api'
import type {
  Context,
  Plan,
  PlanCommand,
  Snapshot,
  TraceRequest,
} from '../shared/types'
import ConceptualMap from '../features/map/ConceptualMap'
import Dock, { DockBody, DockProvider } from '../features/frame/DockView'
import { dockSession, useDock, type DockState } from '../features/frame/dock'
import {
  buildSearchItems,
  inspectorQuery,
  searchExplore,
  type SearchItems,
} from '../features/explore/portSearch'
import { useDebounced, useIdleLazy, type Lazy } from '../shared/lazy'
import NetworksDrawer from '../features/networks/NetworksDrawer'
import PhysicalExplorer from '../features/physical/PhysicalExplorer'
import InventoryPage from '../features/inventory/InventoryPage'
import { inventorySession } from '../features/inventory/inventorySession'
import { openLocation } from '../features/physical/explorerModel'
import { physicalSession } from '../features/physical/physicalSession'
import {
  chooseRoute,
  traceSession,
  type RouteRef,
} from '../features/pathfinding/traceSession'
import { mapSession, shownNetworks } from '../features/map/mapSession'
import { highlightFor, type LocationRef } from '../features/map/highlight'
import {
  NetworkSelect,
  ViewSwitch,
  type MapView,
} from '../features/map/MapControls'
import TraceTab from '../features/frame/TraceTab'
import TracePage from '../features/trace/TracePage'
import { walkOfRoute } from '../features/paths/follow'
import { buildSheet } from '../features/paths/sheet'
import LibraryItems, {
  type PendingEquipment,
} from '../features/planning/LibraryItems'
import { locationTree } from '../features/patching/patching'
import PlacementEditor from '../features/planning/PlacementEditor'
import { pickerItems } from '../features/pathfinding/picker'
import { filterTree } from '../features/explore/tree'
import { canFindFromDevice } from '../features/inspector/model'
import { endpointLabel } from '../features/pathfinding/projection'
import Inspector, { type OpenRequest } from '../features/inspector/Inspector'
import {
  indexSnapshot,
  type SnapshotIndex,
} from '../features/map/snapshotIndex'
import { changeCount } from '../features/planning/changeCount'
import ChangesDrawer from '../features/planning/ChangesDrawer'
import {
  draftsOf,
  isStale,
  recordedMessage,
} from '../features/planning/changes'
import { containerIds } from '../features/planning/containers'
import { locationFor } from '../features/planning/goTo'
import type { RecordedInfo } from '../features/planning/ReviewStep'
import StaleCard from '../features/planning/StaleCard'
import type { GoTarget } from '../features/planning/summary'
import EnvironmentBadge from '../features/environment/EnvironmentBadge'
import type { PlanEdit } from '../features/planning/editing'
import PatchingHost from '../features/patching/PatchingHost'
import HdfForm from '../features/planning/HdfForm'
import { resolveLocation } from '../features/physical/location'
import { searchEquipment } from '../features/map/search'
import './styles.css'
import Pieces from '../shared/ui/Pieces'
import Name from '../shared/ui/Name'

const ROUTE_NOT_HERE =
  'The selected route is not in this context; showing the first.'

export default function App() {
  const client = useQueryClient()
  const [context, setContext] = useState<Context>(() =>
    new URLSearchParams(location.search).has('plan') ? 'planned' : 'installed',
  )
  const [planID, setPlanID] = useState(
    () => new URLSearchParams(location.search).get('plan') ?? '',
  )
  const dock = useDock()
  const [pending, setPending] = useState<PendingEquipment>()
  const [status, setStatus] = useState('')
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const [view, setView] = useState<MapView>('conceptual')
  // The view the Trace page was opened from: ← Back returns to it, still mounted.
  const [pageBack, setPageBack] =
    useState<Exclude<MapView, 'trace'>>('conceptual')
  // The dock as it was when the page opened: ← Back puts it back (the page itself has no dock).
  const dockBefore = useRef<DockState | null>(null)
  const openTracePage = useCallback(
    (before?: DockState) => {
      if (view !== 'trace') {
        setPageBack(view)
        dockBefore.current = before ?? dockSession.get()
      }
      traceSession.setPicture(false)
      dockSession.close()
      setView('trace')
    },
    [view],
  )
  const closeTracePage = useCallback(
    (restoreDock = true) => {
      setView(pageBack)
      const before = dockBefore.current
      dockBefore.current = null
      if (restoreDock && before?.open) dockSession.open(before.tab)
    },
    [pageBack],
  )
  const [networkChoice, setNetworkChoice] = useState<string>()
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: ({ signal }) => getPlans(signal),
  })
  const installed = useQuery({
    queryKey: ['topology', 'installed'],
    queryFn: ({ signal }) => getSnapshot('installed', signal),
  })
  // Recorded plans are history: only drafts can be opened in Plan view.
  const drafts = useMemo(() => draftsOf(plans.data ?? []), [plans.data])
  const selectedPlan =
    drafts.find((p) => p.id === planID) ?? (!planID ? drafts[0] : undefined)
  // A draft on an older Installed cannot be drawn: it shows a card instead.
  const stale =
    !!selectedPlan &&
    !!installed.data &&
    isStale(selectedPlan, installed.data.revision)
  const selectedID = context === 'planned' ? selectedPlan?.id : undefined
  const topology = useQuery({
    queryKey:
      context === 'installed'
        ? ['topology', 'installed']
        : ['topology', 'planned', selectedID],
    queryFn: ({ signal }) => getSnapshot(context, signal, selectedID),
    // Not before Installed is known: until then a stale draft cannot be told from a current one.
    enabled:
      context === 'installed' || (!!selectedID && !!installed.data && !stale),
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
  // A direct fix keeps the topology revision, so nothing refetches by itself:
  // Installed, every plan (drawn on Installed) and the history are refetched.
  const fixed = useCallback(
    async (message: string) => {
      await Promise.all([
        refresh(),
        client.invalidateQueries({ queryKey: ['history'] }),
      ])
      notify(message)
    },
    [refresh, client, notify],
  )
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
      kind: 'switch' | 'panel' | 'rack_item',
      rackID?: string,
      unit?: number,
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
      })
      dockSession.open('add')
    },
    [topology.data, context, selectedPlan],
  )
  const openInspector = useCallback(() => dockSession.open('inspector'), [])
  const setMode = (next: Context) => {
    setPending(undefined)
    setContext(next)
    dockSession.setPlanned(next === 'planned')
    if (next === 'planned') dockSession.open('changes')
    setStatus('')
  }
  // Installed's drawer: open a draft in Plan view, or start a new one.
  const openPlan = (id: string) => {
    setPlanID(id)
    setMode('planned')
  }
  const createdFromInstalled = async (plan: Plan) => {
    setPlanID(plan.id)
    setMode('planned')
    await saved(plan)
  }
  // After a record (or a repeated one that found the plan already recorded):
  // Installed, with the same physical location and trace (the Workspace reruns
  // the remembered trace when its topology revision changes).
  const recorded = async ({ plan, changes, already }: RecordedInfo) => {
    setPending(undefined)
    setPlanID('')
    setContext('installed')
    await refresh()
    const others = draftsOf(
      client.getQueryData<Plan[]>(['plans']) ?? [],
    ).filter((p) => p.id !== plan.id).length
    notify(
      already
        ? `“${plan.name}” was already recorded.`
        : recordedMessage(plan.name, changes, others),
    )
  }
  // A summary line or conflict link: open the object in Physical, on the
  // proposed topology of the open draft or (for a stale draft) on Installed.
  const goTo = (target: GoTarget, from: 'planned' | 'installed') => {
    const snapshot = from === 'installed' ? installed.data : topology.data
    if (!snapshot) return
    if (from === 'installed') setContext('installed')
    physicalSession.navigate(locationFor(indexSnapshot(snapshot), target))
    setView('physical')
  }
  // A stale draft's planned topology is never asked for; an old failure of it is not an error.
  const error =
    (context === 'planned' && stale ? undefined : topology.error) ??
    installed.error ??
    plans.error
  const networks = topology.data?.networks ?? installed.data?.networks ?? []
  // A network that does not exist in this context falls back to All networks.
  const networkId = networks.some((n) => n.id === networkChoice)
    ? networkChoice
    : undefined
  // The Inventory's Network pill may hold several networks: the header says how many.
  const inventory = useSyncExternalStore(
    inventorySession.subscribe,
    inventorySession.getSnapshot,
  )
  const pillNetworks =
    view === 'inventory'
      ? (inventory.lists[inventory.list].filters.net?.length ?? 0)
      : 0
  // On Conceptual the header shows the network the map shows (D39).
  const mapNetworks = useSyncExternalStore(
    mapSession.subscribe,
    mapSession.networks,
  )
  const mapNetworkId = shownNetworks(mapNetworks, networks)[0]
  useEffect(() => {
    dockSession.setPlanned(context === 'planned')
  }, [context])
  return (
    <DockProvider>
      <div className={`studio ${context === 'planned' ? 'in-plan' : ''}`}>
        <header className="studio-header">
          <div className="brand">
            <span className="brand-mark">
              <Network size={21} />
            </span>
            net<span>top</span>
          </div>
          <ViewSwitch view={view} onChange={setView} />
          <NetworkSelect
            networks={networks}
            value={view === 'conceptual' ? mapNetworkId : networkId}
            many={pillNetworks > 1 ? pillNetworks : undefined}
            onChange={(id) => {
              // A network chosen on Conceptual is also the map's; All networks only changes the choice.
              if (view === 'conceptual' && id) mapSession.showNetwork(id)
              setNetworkChoice(id)
              // Choosing the network already chosen must still replace "N networks".
              if (view === 'inventory') inventorySession.setHeaderNetwork(id)
            }}
            onManage={() => dockSession.open('networks')}
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
              Plan:{' '}
              {selectedPlan ? <Name text={selectedPlan.name} /> : 'New draft'}
            </button>
          </div>
          <button
            className="header-action"
            onClick={() => {
              if (view === 'trace') closeTracePage(false)
              dockSession.rail('changes')
            }}
            aria-expanded={
              view !== 'trace' && dock.open && dock.tab === 'changes'
            }
          >
            <Layers size={16} />
            Changes
            {context === 'planned' && (
              <span className="count-badge">{changeCount(selectedPlan)}</span>
            )}
          </button>
          <EnvironmentBadge />
        </header>
        <nav className="tool-rail" aria-label="Workspace tools">
          {(
            [
              ['add', 'Add equipment library', Plus],
              ['explore', 'Open explorer', Search],
              ['trace', 'Open trace tools', GitFork],
              ['inspector', 'Open inspector', Settings2],
            ] as const
          ).map(([tab, label, Icon]) => {
            const off = tab === 'add' && context !== 'planned'
            const on =
              view === 'trace' ? tab === 'trace' : dock.open && dock.tab === tab
            return (
              <button
                key={tab}
                aria-label={label}
                title={off ? 'Add: open a plan first' : undefined}
                disabled={off}
                aria-expanded={on}
                className={on ? 'active' : ''}
                onClick={() => {
                  // On the Trace page its own icon is on and does nothing; another icon leaves the page for that tab.
                  if (view === 'trace') {
                    if (tab === 'trace') return
                    closeTracePage(false)
                  }
                  dockSession.rail(tab)
                }}
              >
                <Icon />
              </button>
            )
          })}
        </nav>
        {error ? (
          <div className="workspace-message" role="alert">
            <h2>Cannot load the workspace</h2>
            <p>{error.message}</p>
            <button className="btn" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        ) : !installed.data ||
          !plans.data ||
          ((context === 'installed' || (selectedID && !stale)) &&
            !topology.data) ? (
          <div className="workspace-message">Loading infrastructure…</div>
        ) : context === 'planned' && !selectedPlan ? (
          <div className="workspace-message">
            Create or select a plan in Changes to begin.
          </div>
        ) : context === 'planned' && selectedPlan && stale ? (
          <StaleCard
            plan={selectedPlan}
            onSaved={saved}
            notify={notify}
            onOpenChanges={() => dockSession.open('changes')}
            onViewInstalled={() => setMode('installed')}
          />
        ) : (
          topology.data && (
            <Workspace
              onFixed={fixed}
              key={`${context}:${selectedID ?? 'installed'}`}
              snapshot={topology.data}
              installed={installed.data}
              plan={context === 'planned' ? selectedPlan : undefined}
              pending={pending}
              onCreateEquipment={requestEquipment}
              onCancelPending={() => setPending(undefined)}
              onEquipmentAdded={() => {
                setPending(undefined)
                dockSession.close()
              }}
              onSelectEquipment={openInspector}
              onManageNetworks={() => dockSession.open('networks')}
              onPlanSaved={saved}
              onRefresh={refresh}
              onOpenAdd={() => dockSession.open('add')}
              onNetworkChange={setNetworkChoice}
              view={view}
              pageBack={pageBack}
              onViewChange={setView}
              onOpenPage={openTracePage}
              onBack={() => closeTracePage()}
              networkId={networkId}
            />
          )
        )}
        {installed.data && plans.data && (
          <DockBody tab="changes">
            <ChangesDrawer
              context={context}
              plans={plans.data}
              installed={installed.data}
              selected={selectedPlan}
              onSelectPlan={(id) => {
                setPending(undefined)
                setPlanID(id)
              }}
              onOpenPlan={openPlan}
              onCreated={createdFromInstalled}
              onSaved={saved}
              onRecorded={recorded}
              onGo={goTo}
              notify={notify}
            />
          </DockBody>
        )}
        {topology.data && (
          <DockBody tab="networks">
            <NetworksDrawer
              snapshot={topology.data}
              onChanged={async (message) => {
                await refresh()
                notify(message)
              }}
            />
          </DockBody>
        )}
        <Dock planned={context === 'planned'} suppressed={view === 'trace'} />
        {status && (
          <div className="save-toast" role="status">
            ✓ {status}
          </div>
        )}
      </div>
    </DockProvider>
  )
}

interface WorkspaceProps {
  snapshot: Snapshot
  installed: Snapshot
  plan?: Plan
  pending?: PendingEquipment
  onCreateEquipment: (
    kind: 'switch' | 'panel' | 'rack_item',
    rackID?: string,
    unit?: number,
    role?: 'aggregation',
  ) => void
  onCancelPending: () => void
  /** Equipment was added through the library form: the drawer is done. */
  onEquipmentAdded: () => void
  onSelectEquipment: () => void
  /** Opens the Manage networks drawer. */
  onManageNetworks: () => void
  onPlanSaved: (plan: Plan) => Promise<void>
  onRefresh: () => Promise<void>
  /** The Inventory's Add in a plan: opens the Add drawer. */
  onOpenAdd: () => void
  /** The Inventory's Network pill chose one network (or none). */
  onNetworkChange: (networkId: string | undefined) => void
  /** After a direct fix: refetch and toast. */
  onFixed: (message: string) => Promise<void>
  view: MapView
  /** The view the Trace page returns to: it stays mounted under the page. */
  pageBack: Exclude<MapView, 'trace'>
  onViewChange: (view: MapView) => void
  /** Opens the Trace page (the dock's Open full page, a jack's path, a Way up chip); `dockBefore` is the dock ← Back returns to. */
  onOpenPage: (dockBefore?: DockState) => void
  /** ← Back on the Trace page. */
  onBack: () => void
  networkId?: string
}

function Workspace({
  snapshot,
  installed,
  plan,
  pending,
  onCreateEquipment,
  onCancelPending,
  onEquipmentAdded,
  onSelectEquipment,
  onManageNetworks,
  onPlanSaved,
  onRefresh,
  onOpenAdd,
  onNetworkChange,
  onFixed,
  view: viewState,
  pageBack,
  onViewChange,
  onOpenPage,
  onBack,
  networkId,
}: WorkspaceProps) {
  const dock = useDock()
  // On the Trace page the view underneath is the one it came from.
  const onTracePage = viewState === 'trace'
  const view = onTracePage ? pageBack : viewState
  const onTracePageRef = useRef(onTracePage)
  onTracePageRef.current = onTracePage
  const closeDrawer = dockSession.close
  const [selected, setSelected] = useState(snapshot.equipment[0]?.id ?? '')
  const [physicalError, setPhysicalError] = useState('')
  const [mode, setMode] = useState<'distribution' | 'point_to_point'>(
    'distribution',
  )
  // Lazy: these scans run once, not on every render.
  const [start, setStart] = useState(() => {
    const access = snapshot.equipment.find((e) => e.role === 'access')
    return access ? `device:${access.id}` : (snapshot.endpoints[0]?.id ?? '')
  })
  const [end, setEnd] = useState(() => {
    const aggregation = new Set(
      snapshot.equipment
        .filter((e) => e.role === 'aggregation')
        .map((e) => e.id),
    )
    return (
      snapshot.endpoints.find((p) => aggregation.has(p.equipmentId))?.id ?? ''
    )
  })
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
  // A failed trace shows its error in the Trace tab, so the dock opens there.
  useEffect(() => {
    // On the Trace page the error shows there (the effect must not run again on ← Back).
    if (traceMutation.isError && !onTracePageRef.current)
      dockSession.open('trace')
  }, [traceMutation.isError])
  // A trace the user starts is remembered outside this Workspace, so an
  // Installed/Plan switch (which remounts it) can run it again; clearing forgets it.
  const startTrace = useCallback(
    (request: TraceRequest) => {
      traceSession.start(request)
      setRouteFellBack(false)
      dockSession.open('trace')
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
  const mapNetworks = useSyncExternalStore(
    mapSession.subscribe,
    mapSession.networks,
  )
  // The map's own network (D39); the header's choice only marks it on Physical.
  const mapNetworkId = shownNetworks(mapNetworks, snapshot.networks)[0]
  // Snapshot-only work, shared by the map and the inspector.
  const index = useMemo(() => indexSnapshot(snapshot), [snapshot])
  const tree = useMemo(() => locationTree(snapshot), [snapshot])
  // The trace pickers' and Explore's search lists: built once per snapshot (and
  // mode) when the browser is idle, never when a drawer opens.
  const startItems = useIdleLazy(
    () => pickerItems(snapshot, { devices: mode === 'distribution' }),
    [snapshot, mode],
  )
  const endItems = useIdleLazy(
    () => pickerItems(snapshot, { devices: false }),
    [snapshot],
  )
  const searchItems = useIdleLazy(() => buildSearchItems(index), [index])
  const installedIDs = useMemo(
    () => new Set(installed.equipment.map((e) => e.id)),
    [installed.equipment],
  )
  const installedLinkIDs = useMemo(
    () => new Set(installed.links.map((l) => l.id)),
    [installed.links],
  )
  // In a plan: what is installed, so the page draws proposed plates and cables dashed.
  const planInstalled = useMemo(
    () =>
      plan ? { equipment: installedIDs, links: installedLinkIDs } : undefined,
    [plan, installedIDs, installedLinkIDs],
  )
  const traceResult =
    traceMutation.data?.revision === snapshot.revision
      ? traceMutation.data
      : undefined
  const route =
    traceMutation.data?.revision === snapshot.revision
      ? traceMutation.data.routes[routeIndex]
      : undefined
  // One walk sheet for the selected route: the results panel and the route view both read it.
  const routeSheet = useMemo(
    () =>
      route
        ? buildSheet(index, snapshot.networks, walkOfRoute(index, route))
        : undefined,
    [index, snapshot.networks, route],
  )
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
  // A step of the route view or a row's Server button: that endpoint, in Physical.
  const showStepInPhysical = useCallback(
    (endpointId: string) => {
      const owner = index.owner.get(endpointId)
      if (owner) showInPhysical(owner, endpointId)
    },
    [index, showInPhysical],
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
  // A rack, node or site in Physical (the Inventory's Racks and added containers).
  const showPlace = useCallback(
    (target: { siteId?: string; nodeId?: string; rackId?: string }) => {
      physicalSession.navigate(openLocation(index, target))
      onViewChange('physical')
    },
    [index, onViewChange],
  )
  const canEdit =
    !!plan &&
    snapshot.revision === `${plan.baseRevision}/${plan.id}@${plan.revision}` &&
    !placement.isPending
  // One command to the open draft, then the plan and the planned topology are
  // refreshed (the saved toast included); location and selection are kept. It
  // rejects with the server's own error for the form or confirm that asked.
  const edit = useMemo<PlanEdit | undefined>(
    () =>
      canEdit && plan
        ? async (command) => {
            let saved: Plan
            try {
              // A batch is the same edit: one revision, all or nothing.
              // remove_change (Undo) answers with the plan and the keys it removed.
              saved =
                command.type === 'batch'
                  ? (
                      await sendBatch(
                        plan.id,
                        plan.revision,
                        command.batch.commands,
                      )
                    ).plan
                  : command.type === 'remove_change'
                    ? (
                        await removeChange(
                          plan.id,
                          plan.revision,
                          command.change.key,
                        )
                      ).plan
                    : await sendPlanCommand(plan.id, {
                        ...command,
                        expectedRevision: plan.revision,
                      } as PlanCommand)
            } catch (e) {
              // Another window changed the draft: reload it, and say so in the
              // server's words; the user's edit is not retried.
              if (e instanceof APIError && e.status === 409) await onRefresh()
              throw e
            }
            await onPlanSaved(saved)
            return saved
          }
        : undefined,
    [canEdit, plan, onPlanSaved],
  )
  const installedContainerIds = useMemo(
    () => containerIds(installed),
    [installed],
  )
  // A new HDF is opened in Physical once the refreshed topology has it.
  const [openAfterCreate, setOpenAfterCreate] = useState<string>()
  useEffect(() => {
    if (openAfterCreate && index.equipment.has(openAfterCreate)) {
      showInPhysical(openAfterCreate)
      setOpenAfterCreate(undefined)
    }
  }, [openAfterCreate, index, showInPhysical])
  const current = resolveLocation(index, physicalSession.history().current)
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
  // The hierarchy drawer's Find AGG / BB: the same trace, from this switch.
  const findFromDevice = useCallback(
    (id: string) => {
      setSelected(id)
      setMode('distribution')
      setStart(`device:${id}`)
      startTrace({ mode: 'distribution', device: id })
    },
    [startTrace],
  )
  // The one entry point to the tree (D40): select the equipment and show it on the
  // hierarchy. The canvas opens its node, lights its way up and what depends on it.
  // No highlight.
  const showOnMap = useCallback(
    (id: string) => {
      setSelected(id)
      onViewChange('conceptual')
      mapSession.select({ kind: 'equipment', id })
    },
    [onViewChange],
  )
  // A passive chip in the drawer, or Full page on a jack's path: Find AGG / BB from that
  // jack, and the Trace page opens (it says "Tracing…" until the server answers).
  const showJackRoute = useCallback(
    (endpointId: string) => {
      // ← Back returns to the dock as it is now, not to the Trace tab the new trace opens.
      const before = dockSession.get()
      traceFromPort(endpointId)
      onOpenPage(before)
    },
    [traceFromPort, onOpenPage],
  )
  // A row of the Inventory: select its equipment and open the inspector, on the
  // port when the row has one (the same request Explore's port hits make).
  const openFromInventory = useCallback(
    (equipmentId: string, endpointId?: string) => {
      setSelected(equipmentId)
      if (endpointId)
        setPortSearch((previous) => ({
          equipmentId,
          query: inspectorQuery(index, endpointId),
          serial: (previous?.serial ?? 0) + 1,
        }))
      onSelectEquipment()
    },
    [index, onSelectEquipment],
  )
  // The Inventory's Delete… and Disconnect…: the inspector on that equipment with
  // the confirm already open (the Inspector takes the request once).
  const [openRequest, setOpenRequest] = useState<OpenRequest>()
  const askDelete = useCallback(
    (equipmentId: string) => {
      openFromInventory(equipmentId)
      setOpenRequest((previous) => ({
        kind: 'delete',
        equipmentId,
        serial: (previous?.serial ?? 0) + 1,
      }))
    },
    [openFromInventory],
  )
  const askDisconnect = useCallback(
    (equipmentId: string, endpointId: string | undefined, linkId: string) => {
      openFromInventory(equipmentId, endpointId)
      setOpenRequest((previous) => ({
        kind: 'disconnect',
        equipmentId,
        linkId,
        serial: (previous?.serial ?? 0) + 1,
      }))
    },
    [openFromInventory],
  )
  // Open in inventory (and View its ports): this equipment's ports, from any
  // network; the header's network is cleared so the pill and the header agree.
  const openInInventory = useCallback(
    (equipmentName: string) => {
      inventorySession.openPorts(equipmentName)
      onNetworkChange(undefined)
      onViewChange('inventory')
    },
    [onNetworkChange, onViewChange],
  )
  // A port or cable chosen in Explore's search. In Physical it opens that endpoint
  // on its equipment page; in Conceptual it selects the equipment on the tree
  // and opens the inspector's Ports/Positions tab filtered to that label.
  const [portSearch, setPortSearch] = useState<{
    equipmentId: string
    query: string
    serial: number
  }>()
  const chooseSearchHit = useCallback(
    (endpointId: string) => {
      const owner = index.owner.get(endpointId)
      if (!owner) return
      if (view === 'physical') return openEndpointPhysical(endpointId)
      if (view === 'inventory') return openFromInventory(owner, endpointId)
      setPortSearch((previous) => ({
        equipmentId: owner,
        query: inspectorQuery(index, endpointId),
        serial: (previous?.serial ?? 0) + 1,
      }))
      showOnMap(owner)
      onSelectEquipment()
    },
    [
      index,
      view,
      openEndpointPhysical,
      openFromInventory,
      showOnMap,
      onSelectEquipment,
    ],
  )
  // Equipment chosen in Explore (a click, or Enter in its search) also opens the inspector.
  const chooseEquipment = useCallback(
    (id: string) => {
      if (view === 'physical') return openEquipmentPhysical(id)
      if (view === 'inventory') return openFromInventory(id)
      showOnMap(id)
      onSelectEquipment()
    },
    [
      view,
      openEquipmentPhysical,
      openFromInventory,
      showOnMap,
      onSelectEquipment,
    ],
  )
  const drawerEquipment = equipment && (
    <Inspector
      planId={plan?.id}
      onFixed={onFixed}
      snapshot={snapshot}
      index={index}
      equipment={equipment}
      installedIDs={installedIDs}
      onFindFromDevice={traceSelectedDevice}
      onFindFromHere={traceFromPort}
      // Leaving the inspector for the map: its drawer closes, so the tree has the room.
      onShowOnMap={(id) => {
        showOnMap(id)
        closeDrawer()
      }}
      onShowInPhysical={showInPhysical}
      onOpenInInventory={openInInventory}
      openRequest={openRequest}
      onOpenRequestHandled={() => setOpenRequest(undefined)}
      onHighlight={highlightLocation}
      onOpenRack={openRack}
      searchRequest={portSearch}
      edit={edit}
      installedLinkIDs={installedLinkIDs}
    >
      {plan && (
        <PlacementEditor
          key={`${equipment.id}:${equipment.rackId}:${equipment.unit}`}
          equipment={equipment}
          tree={tree}
          racks={snapshot.racks}
          pending={!canEdit}
          onMove={(input) => placement.mutate(input)}
        />
      )}
    </Inspector>
  )
  const dockErrors = (
    <>
      {placement.error && (
        <p role="alert" className="inline-error">
          {placement.error.message}
          <button className="text-button" onClick={() => void onRefresh()}>
            Refresh draft
          </button>
        </p>
      )}
    </>
  )
  return (
    <main className={`workspace-canvas${onTracePage ? ' trace-open' : ''}`}>
      <PatchingHost
        snapshot={snapshot}
        index={index}
        edit={edit}
        planName={plan?.name}
      />
      {view === 'conceptual' ? (
        <ConceptualMap
          snapshot={snapshot}
          index={index}
          installedIDs={installedIDs}
          installedLinkIDs={installedLinkIDs}
          route={route}
          routeSheet={routeSheet}
          onRouteStep={showStepInPhysical}
          networkId={mapNetworkId}
          onSelect={select}
          onFindDevice={findFromDevice}
          onShowInPhysical={showInPhysical}
          onShowPlace={showPlace}
          onTraceJack={showJackRoute}
          installedContainerIds={installedContainerIds}
        />
      ) : view === 'inventory' ? (
        <InventoryPage
          snapshot={snapshot}
          index={index}
          installed={installed}
          installedIDs={installedIDs}
          installedLinkIDs={installedLinkIDs}
          planName={plan?.name}
          plan={plan}
          canEdit={canEdit}
          networkId={networkId}
          onNetworkChange={onNetworkChange}
          onOpenAdd={onOpenAdd}
          onRefresh={onRefresh}
          onOpenEquipment={openFromInventory}
          onShowOnMap={showOnMap}
          onShowInPhysical={showInPhysical}
          onAskDelete={askDelete}
          onAskDisconnect={askDisconnect}
          onViewPorts={openInInventory}
          onShowPlace={showPlace}
          edit={edit}
          onFixed={onFixed}
        />
      ) : (
        <PhysicalExplorer
          planId={plan?.id}
          onFixed={onFixed}
          snapshot={snapshot}
          index={index}
          route={route}
          networkId={networkId}
          installedLinkIDs={installedLinkIDs}
          selectedEquipmentId={selected}
          installedIds={installedIDs}
          planName={plan?.name}
          canEdit={canEdit}
          edit={edit}
          installedContainerIds={installedContainerIds}
          onMoveEquipment={move}
          onCreateEquipment={onCreateEquipment}
          onSelectEquipment={setSelected}
          onFindFromEndpoint={traceFromPort}
          onFullPage={showJackRoute}
          onShowOnMap={showOnMap}
          onOpenInInventory={openInInventory}
          onError={setPhysicalError}
        />
      )}
      <DockBody tab="add">
        <LibraryItems
          canEdit={canEdit}
          edit={edit}
          tree={tree}
          networks={snapshot.networks}
          defaultRackId={current.rackId}
          near={{ siteId: current.siteId, nodeId: current.nodeId }}
          pending={pending}
          onCancelPending={onCancelPending}
          onAdded={onEquipmentAdded}
          onManageNetworks={onManageNetworks}
          onHdfCreated={(saved, name) => {
            const created = saved.equipment.find(
              (e) => e.kind === 'hdf' && e.name === name,
            )
            if (created) setOpenAfterCreate(created.id)
            closeDrawer()
          }}
        />
      </DockBody>
      <DockBody tab="explore">
        <Explorer
          snapshot={snapshot}
          index={index}
          searchItems={searchItems}
          selected={selected}
          onChoose={chooseEquipment}
          onChooseHit={chooseSearchHit}
          onOpenRack={openRack}
          onHighlight={highlightLocation}
          physical={view === 'physical'}
          onOpenPlace={openPlace}
          canEdit={canEdit}
        />
      </DockBody>
      <DockBody tab="inspector">
        {drawerEquipment}
        {dockErrors}
      </DockBody>
      <DockBody tab="trace">
        <TraceTab
          snapshot={snapshot}
          mode={mode}
          start={start}
          end={end}
          startItems={startItems.get()}
          endItems={endItems.get()}
          pending={traceMutation.isPending}
          onMode={(next) => {
            setMode(next)
            if (next === 'point_to_point' && start.startsWith('device:'))
              setStart(
                snapshot.endpoints.find((p) => p.equipmentId === start.slice(7))
                  ?.id ?? '',
              )
            clearTrace()
          }}
          onStart={(value) => {
            setStart(value)
            clearTrace()
          }}
          onEnd={(value) => {
            setEnd(value)
            clearTrace()
          }}
          onRun={runTrace}
          error={traceMutation.error?.message}
          onRefresh={() => void onRefresh()}
          result={traceResult}
          routeIndex={routeIndex}
          onRoute={chooseRouteIndex}
          sheet={routeSheet}
          note={routeFellBack ? ROUTE_NOT_HERE : undefined}
          onHop={(endpointId) => {
            const port = snapshot.endpoints.find((p) => p.id === endpointId)
            if (!port) return
            if (view === 'physical') return openEndpointPhysical(endpointId)
            select(port.equipmentId)
          }}
          onShowInPhysical={showStepInPhysical}
          onClear={() => clearTrace()}
          onOpenPage={() => onOpenPage()}
        />
      </DockBody>
      {onTracePage && (
        <TracePage
          snapshot={snapshot}
          index={index}
          installed={planInstalled}
          result={traceResult}
          pending={traceMutation.isPending}
          error={traceMutation.error?.message}
          onRefresh={() => void onRefresh()}
          routeIndex={routeIndex}
          onRoute={chooseRouteIndex}
          onBack={onBack}
          onOpen={showInPhysical}
          onShowOnMap={() => onViewChange('conceptual')}
          planName={plan?.name}
        />
      )}
      {placement.error && !(dock.open && dock.tab === 'inspector') && (
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

/** Explore's search text while the details tab has the dock, session-only. */
const exploreSearch = { text: '' }

function Explorer({
  snapshot,
  index,
  searchItems,
  selected,
  onChoose,
  onChooseHit,
  onOpenRack,
  onHighlight,
  physical,
  onOpenPlace,
  canEdit,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  /** Ports and cables the search can find; built when the browser is idle. */
  searchItems: Lazy<SearchItems>
  selected: string
  /** Select the equipment on the tree and open the inspector. */
  onChoose: (id: string) => void
  /** A port or cable found by the search: open that endpoint (Physical), or select its equipment and filter the inspector (Conceptual). */
  onChooseHit: (endpointId: string) => void
  onOpenRack: (id: string) => void
  /** Highlight a site or node on the map. */
  onHighlight: (location: LocationRef) => void
  /** In Physical, a site or node opens its screen instead of highlighting on the map. */
  physical: boolean
  onOpenPlace: (target: { siteId?: string; nodeId?: string }) => void
  canEdit: boolean
}) {
  const [search, setSearch] = useState(exploreSearch.text)
  // When the details tab (Port, Node) takes the dock the text waits for its return;
  // any other way out of Explore forgets it.
  const typed = useRef(search)
  typed.current = search
  useEffect(
    () => () => {
      const now = dockSession.get()
      exploreSearch.text =
        now.open && now.tab === 'details' ? typed.current : ''
    },
    [],
  )
  // The lists follow the typing about 150 ms behind it.
  const settled = useDebounced(search)
  const hits = useMemo(
    () =>
      settled.trim()
        ? searchExplore(searchItems.get(), settled)
        : searchExplore(
            { ports: [], cables: [], firstEnd: new Map(), pieces: new Map() },
            '',
          ),
    [searchItems, settled],
  )
  const tree = useMemo(() => filterTree(snapshot, settled), [snapshot, settled])
  const handlers = useRef<TreeHandlers>({
    onChoose,
    onOpenRack,
    onHighlight,
    onOpenPlace,
  })
  handlers.current = { onChoose, onOpenRack, onHighlight, onOpenPlace }
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
      <ExplorerTree
        tree={tree}
        selected={selected}
        physical={physical}
        canEdit={canEdit}
        handlers={handlers}
      />
      {(
        [
          ['Ports', 'search-port', hits.ports],
          ['Cables', 'search-cable', hits.cables],
        ] as const
      ).map(
        ([title, testId, group]) =>
          group.rows.length > 0 && (
            <section key={title} className="explore-hits">
              <h3 className="explore-heading">{title}</h3>
              {group.rows.map((row) => (
                <button
                  key={row.id}
                  className="search-hit"
                  data-testid={testId}
                  data-id={row.id}
                  onClick={() => onChooseHit(row.openEndpointId)}
                >
                  <span className="dot" />
                  <span>
                    <Pieces pieces={row.pieces} />
                  </span>
                </button>
              ))}
              {group.more > 0 && (
                <p className="muted">{group.more} more · refine the search.</p>
              )}
            </section>
          ),
      )}
      {search.trim() &&
        tree.length === 0 &&
        hits.ports.rows.length === 0 &&
        hits.cables.rows.length === 0 && (
          <p className="muted">No equipment matches.</p>
        )}
    </>
  )
}

interface TreeHandlers {
  onChoose: (id: string) => void
  onOpenRack: (id: string) => void
  onHighlight: (location: LocationRef) => void
  onOpenPlace: (target: { siteId?: string; nodeId?: string }) => void
}

/**
 * Explorer's site → node → rack → equipment tree. Typing in the search box
 * re-renders the Explorer, not this: a campus has 1,500 rows. The handlers are
 * read when clicked, so they are never stale.
 */
const ExplorerTree = memo(
  function ExplorerTree({
    tree,
    selected,
    physical,
    canEdit,
    handlers,
  }: {
    tree: ReturnType<typeof filterTree>
    selected: string
    physical: boolean
    canEdit: boolean
    handlers: { current: TreeHandlers }
  }) {
    const { onChoose, onOpenRack, onHighlight, onOpenPlace } = {
      onChoose: (id: string) => handlers.current.onChoose(id),
      onOpenRack: (id: string) => handlers.current.onOpenRack(id),
      onHighlight: (l: LocationRef) => handlers.current.onHighlight(l),
      onOpenPlace: (t: { siteId?: string; nodeId?: string }) =>
        handlers.current.onOpenPlace(t),
    }
    return (
      <>
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
                <Name text={site.name} />
                {!physical && (
                  <Highlighter
                    size={13}
                    className="location-icon"
                    aria-hidden
                  />
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
                    title={
                      physical ? 'Open in Physical' : 'Highlight on the map'
                    }
                    onClick={() =>
                      physical
                        ? onOpenPlace({ nodeId: node.id })
                        : onHighlight({ kind: 'node', id: node.id })
                    }
                  >
                    <Name text={node.name} />
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
                      <Name text={rack.name} />
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
                        <Name text={e.name} />
                        <small>U{e.unit}</small>
                      </button>
                    ))}
                  </section>
                ))}
              </section>
            ))}
          </section>
        ))}
      </>
    )
  },
  (a, b) =>
    a.tree === b.tree &&
    a.selected === b.selected &&
    a.physical === b.physical &&
    a.canEdit === b.canEdit,
)
