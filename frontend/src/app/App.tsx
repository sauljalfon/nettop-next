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
import ConceptualMap, {
  type PendingEquipment,
} from '../features/map/ConceptualMap'
import { drawerSides } from '../features/map/drawers'
import {
  buildSearchItems,
  inspectorQuery,
  searchExplore,
  type SearchItems,
} from '../features/explore/portSearch'
import { useDebounced, useIdleLazy, type Lazy } from '../shared/lazy'
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
import LibraryItems from '../features/planning/LibraryItems'
import PlacementEditor from '../features/planning/PlacementEditor'
import TracePicker from '../features/pathfinding/TracePicker'
import { pickerItems } from '../features/pathfinding/picker'
import { filterTree } from '../features/explore/tree'
import { canFindFromDevice } from '../features/inspector/model'
import { endpointLabel } from '../features/pathfinding/projection'
import Inspector from '../features/inspector/Inspector'
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
      setDrawer('library')
    },
    [topology.data, context, selectedPlan],
  )
  const configurePreview = useCallback(() => setDrawer('library'), [])
  const openInspector = useCallback(() => setDrawer('inspector'), [])
  const toggleDrawer = (value: Drawer) =>
    setDrawer((previous) => (previous === value ? null : value))
  const setMode = (next: Context) => {
    setPending(undefined)
    setContext(next)
    setDrawer(next === 'planned' ? 'plans' : null)
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
            <span className="count-badge">{changeCount(selectedPlan)}</span>
          )}
        </button>
        <EnvironmentBadge />
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
          onOpenChanges={() => setDrawer('plans')}
          onViewInstalled={() => setMode('installed')}
        />
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
            onCancelPreview={() => setPending(undefined)}
            onEquipmentAdded={() => {
              setPending(undefined)
              setDrawer(null)
            }}
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
  onCancelPreview: () => void
  /** Equipment was added through the library form: the drawer is done. */
  onEquipmentAdded: () => void
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
  onCancelPreview,
  onEquipmentAdded,
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
  // Snapshot-only work, shared by the map and the inspector.
  const index = useMemo(() => indexSnapshot(snapshot), [snapshot])
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
  const currentRackId = resolveLocation(
    index,
    physicalSession.history().current,
  ).rackId
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
  // A port or cable chosen in Explore's search. In Physical it opens that endpoint
  // on its equipment page; in Conceptual it selects the equipment, centers its
  // card and opens the inspector's Ports/Positions tab filtered to that label.
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
      setPortSearch((previous) => ({
        equipmentId: owner,
        query: inspectorQuery(index, endpointId),
        serial: (previous?.serial ?? 0) + 1,
      }))
      showOnMap(owner)
      onSelectEquipment()
    },
    [index, view, openEndpointPhysical, showOnMap, onSelectEquipment],
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
      searchRequest={portSearch}
      edit={edit}
      installedLinkIDs={installedLinkIDs}
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
      <PatchingHost snapshot={snapshot} index={index} edit={edit} />
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
          planName={plan?.name}
          canEdit={canEdit}
          edit={edit}
          installedContainerIds={installedContainerIds}
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
          subtitle="Drag onto a rack, or add an HDF with its form"
          onClose={closeDrawer}
        >
          <LibraryItems
            canEdit={canEdit}
            edit={edit}
            racks={snapshot.racks}
            networks={snapshot.networks}
            defaultRackId={currentRackId}
            pending={pending}
            onCancelPending={onCancelPreview}
            onAdded={onEquipmentAdded}
            onHdfCreated={(saved, name) => {
              const created = saved.equipment.find(
                (e) => e.kind === 'hdf' && e.name === name,
              )
              if (created) setOpenAfterCreate(created.id)
              closeDrawer()
            }}
          />
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
                items={startItems.get()}
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
                  items={endItems.get()}
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
  /** Select the equipment, open the inspector and center on its card. */
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
  const [search, setSearch] = useState('')
  // The lists follow the typing about 150 ms behind it.
  const settled = useDebounced(search)
  const hits = useMemo(
    () =>
      settled.trim()
        ? searchExplore(searchItems.get(), settled)
        : searchExplore({ ports: [], cables: [], firstEnd: new Map() }, ''),
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
                  {row.label}
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
                {site.name}
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
      </>
    )
  },
  (a, b) =>
    a.tree === b.tree &&
    a.selected === b.selected &&
    a.physical === b.physical &&
    a.canEdit === b.canEdit,
)
