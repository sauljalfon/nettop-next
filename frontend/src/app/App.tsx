import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Building2,
  GitBranch,
  GitFork,
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
import Whiteboard, {
  type PendingEquipment,
} from '../features/whiteboard/Whiteboard'
import RackView from '../features/rack-builder/RackView'
import PlanEditor from '../features/planning/PlanEditor'
import PlacementEditor from '../features/planning/PlacementEditor'
import TracePanel from '../features/pathfinding/TracePanel'
import { endpointLabel } from '../features/pathfinding/projection'
import { isPassiveEquipment } from '../shared/equipment'
import { locationPath } from '../features/whiteboard/hierarchy'
import './styles.css'

type Drawer = 'library' | 'explorer' | 'plans' | 'inspector' | 'trace' | null

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
  const layouts = useRef<Record<string, { x: number; y: number }>>({})
  const recordLayout = useCallback(
    (id: string, position: { x: number; y: number }) => {
      layouts.current[id] = position
    },
    [],
  )
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
  return (
    <div className="studio">
      <header className="studio-header">
        <div className="brand">
          <span className="brand-mark">
            <Network size={21} />
          </span>
          net<span>top</span>
        </div>
        <span className="header-divider" />
        <div className="workspace-title">
          <strong>{topology.data?.sites[0]?.name ?? 'Network Studio'}</strong>
          <small>Infrastructure workspace</small>
        </div>
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
            positions={layouts.current}
            recordLayout={recordLayout}
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
  positions: Record<string, { x: number; y: number }>
  recordLayout: (id: string, position: { x: number; y: number }) => void
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
  positions,
  recordLayout,
}: WorkspaceProps) {
  const [selected, setSelected] = useState(snapshot.equipment[0]?.id ?? '')
  const [view, setView] = useState<'board' | 'racks'>('board')
  const [focusedRack, setFocusedRack] = useState<string>()
  const [mode, setMode] = useState<'aggregation' | 'point_to_point'>(
    'aggregation',
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
  const [resultsOpen, setResultsOpen] = useState(true)
  const traceMutation = useMutation({
    mutationFn: (request: TraceRequest) =>
      trace(snapshot.context, request, plan?.id, snapshot.revision),
    onSuccess: () => {
      setRouteIndex(0)
      setResultsOpen(true)
    },
  })
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
  const ports = useMemo(
    () => snapshot.endpoints.filter((p) => p.equipmentId === equipment?.id),
    [snapshot.endpoints, equipment?.id],
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
  useEffect(() => {
    traceMutation.reset()
    placement.reset()
  }, [snapshot.revision])
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
      traceMutation.reset()
      onSelectEquipment()
    },
    [snapshot.endpoints, onSelectEquipment],
  )
  const openRack = useCallback((id: string) => {
    setFocusedRack(id)
    setView('racks')
  }, [])
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
  const rackSnapshot = useMemo(
    () =>
      focusedRack
        ? {
            ...snapshot,
            racks: snapshot.racks.filter((r) => r.id === focusedRack),
          }
        : snapshot,
    [snapshot, focusedRack],
  )
  function runTrace() {
    traceMutation.mutate(
      mode === 'point_to_point'
        ? { mode, start, end }
        : start.startsWith('device:')
          ? { mode, device: start.slice(7) }
          : { mode, start },
    )
  }
  function useSelected() {
    if (equipment) {
      setMode('aggregation')
      setStart(`device:${equipment.id}`)
      traceMutation.mutate({ mode: 'aggregation', device: equipment.id })
    }
  }
  const drawerEquipment = equipment && (
    <>
      <div className="inspector-hero">
        <span className="equipment-icon">
          {isPassiveEquipment(equipment) ? <PanelTop /> : <Network />}
        </span>
        <h2>{equipment.name}</h2>
        <span
          className={`badge ${installedIDs.has(equipment.id) ? '' : 'green'}`}
        >
          {installedIDs.has(equipment.id)
            ? 'Installed equipment'
            : 'Proposed equipment'}
        </span>
      </div>
      <p className="location-breadcrumb">
        {locationPath(snapshot, equipment.id)}
      </p>
      <div className="detail-row">
        <span>Role</span>
        <strong>{equipment.role}</strong>
      </div>
      <div className="detail-row">
        <span>Placement</span>
        <strong>
          {snapshot.racks.find((r) => r.id === equipment.rackId)?.name} · U
          {equipment.unit}
        </strong>
      </div>
      <button className="button primary" onClick={useSelected}>
        <GitFork size={16} />
        Find aggregation from {equipment.name}
      </button>
      {plan && (
        <PlacementEditor
          key={`${equipment.id}:${equipment.rackId}:${equipment.unit}`}
          equipment={equipment}
          racks={snapshot.racks}
          pending={!canEdit}
          onMove={(input) => placement.mutate(input)}
        />
      )}
      <p className="section-label">Exact endpoints</p>
      <div className="endpoint-list">
        {ports.map((p) => (
          <button
            className={start === p.id ? 'active' : ''}
            key={p.id}
            onClick={() => selectPort(p.id)}
          >
            <span>{p.label}</span>
            <small>
              {snapshot.links.some(
                (l) => l.kind === 'cable' && (l.a === p.id || l.b === p.id),
              )
                ? 'Cabled'
                : 'Free'}{' '}
              ↗
            </small>
          </button>
        ))}
      </div>
    </>
  )
  return (
    <main className="workspace-canvas">
      <div className="canvas-topline">
        <div>
          <span className="eyebrow">
            {view === 'board' ? 'HIERARCHY WHITEBOARD' : 'PHYSICAL ELEVATION'}
          </span>
          <h1>
            {view === 'board'
              ? 'Your network, in context.'
              : (snapshot.racks.find((r) => r.id === focusedRack)?.name ??
                'Rack workshop')}
          </h1>
        </div>
        <div className="view-switch">
          <button
            aria-pressed={view === 'board'}
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
          >
            Whiteboard
          </button>
          <button
            aria-pressed={view === 'racks'}
            className={view === 'racks' ? 'active' : ''}
            onClick={() => {
              setFocusedRack(undefined)
              setView('racks')
            }}
          >
            Racks
          </button>
        </div>
      </div>
      {view === 'board' ? (
        <Whiteboard
          snapshot={snapshot}
          installedIDs={installedIDs}
          installedLinkIDs={installedLinkIDs}
          selected={selected}
          route={route}
          onSelect={select}
          onPort={selectPort}
          canEdit={canEdit}
          positions={positions}
          onLayoutPosition={recordLayout}
          onCreateEquipment={onCreateEquipment}
          onMoveEquipment={move}
          onOpenRack={openRack}
          preview={pending}
          onConfigurePreview={onConfigurePreview}
        />
      ) : (
        <div className="elevation-surface">
          <button
            className="elevation-back button"
            onClick={() => setView('board')}
          >
            <ArrowLeft size={15} />
            Back to whiteboard
          </button>
          <RackView
            snapshot={rackSnapshot}
            installedIDs={installedIDs}
            selected={selected}
            route={route}
            onSelect={select}
            onPort={selectPort}
            canEdit={canEdit}
            onCreateEquipment={(kind, rackID, unit, role) =>
              onCreateEquipment(
                kind,
                rackID,
                unit,
                undefined,
                role === 'aggregation' ? 'aggregation' : undefined,
              )
            }
            onMoveEquipment={move}
          />
        </div>
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
            onSelect={select}
            onOpenRack={openRack}
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
              : 'Select equipment on the board to inspect it'
          }
          onClose={closeDrawer}
          side="right"
        >
          {drawer === 'inspector' && drawerEquipment}
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
                  if (next === 'point_to_point' && start.startsWith('device:'))
                    setStart(
                      snapshot.endpoints.find(
                        (p) => p.equipmentId === start.slice(7),
                      )?.id ?? '',
                    )
                  traceMutation.reset()
                }}
              >
                <option value="aggregation">Find aggregation</option>
                <option value="point_to_point">Exact port → port</option>
              </select>
            </label>
            <label>
              Start
              <select
                value={start}
                disabled={traceMutation.isPending}
                onChange={(e) => {
                  setStart(e.target.value)
                  traceMutation.reset()
                }}
              >
                {mode === 'aggregation' && (
                  <optgroup label="Equipment">
                    {snapshot.equipment
                      .filter((e) => e.kind === 'switch')
                      .map((e) => (
                        <option key={e.id} value={`device:${e.id}`}>
                          {e.name} · all ports
                        </option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="Exact endpoints">
                  {snapshot.endpoints.map((p) => (
                    <option key={p.id} value={p.id}>
                      {endpointLabel(snapshot, p.id)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {mode === 'point_to_point' && (
              <label>
                Destination
                <select
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value)
                    traceMutation.reset()
                  }}
                >
                  {snapshot.endpoints.map((p) => (
                    <option key={p.id} value={p.id}>
                      {endpointLabel(snapshot, p.id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="button primary"
              disabled={traceMutation.isPending || !start}
              onClick={runTrace}
            >
              {traceMutation.isPending ? 'Tracing…' : 'Trace physical path'}
            </button>
            <p className="muted">
              Cables and panel bridges only. No inferred transit through switch
              ports.
            </p>
          </section>
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
      {traceMutation.data?.revision === snapshot.revision && (
        <div
          className={`results-drawer ${resultsOpen ? 'expanded' : 'collapsed'}`}
        >
          <button
            className="results-toggle"
            onClick={() => setResultsOpen((v) => !v)}
            aria-expanded={resultsOpen}
          >
            {resultsOpen ? 'Collapse' : 'Expand'} trace results
          </button>
          {resultsOpen ? (
            <TracePanel
              snapshot={snapshot}
              result={traceMutation.data}
              routeIndex={routeIndex}
              onRoute={setRouteIndex}
              onHop={(id) => {
                const port = snapshot.endpoints.find((p) => p.id === id)
                if (port) select(port.equipmentId)
              }}
              onClear={() => traceMutation.reset()}
            />
          ) : (
            <span>
              {traceMutation.data.status === 'reached'
                ? 'Physical path found'
                : 'No route'}{' '}
              · {traceMutation.data.routes[routeIndex]?.hops.length ?? 0} hops
            </span>
          )}
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
            description: 'A destination for aggregation traces',
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
  onSelect,
  onOpenRack,
  canEdit,
}: {
  snapshot: Snapshot
  selected: string
  onSelect: (id: string) => void
  onOpenRack: (id: string) => void
  canEdit: boolean
}) {
  const [search, setSearch] = useState('')
  return (
    <>
      <label className="search">
        <Search size={17} />
        <input
          aria-label="Find equipment"
          placeholder="Find equipment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {snapshot.sites.map((site) => (
        <section key={site.id} className="explorer-site">
          <h3>
            <MapPin size={16} />
            {site.name}
          </h3>
          {snapshot.nodes
            .filter((n) => n.siteId === site.id)
            .map((node) => (
              <section key={node.id} className="explorer-node">
                <h4>
                  <Building2 size={15} />
                  {node.name}
                </h4>
                {snapshot.racks
                  .filter((r) => r.nodeId === node.id)
                  .map((rack) => (
                    <section className="tree-rack" key={rack.id}>
                      <button
                        className="rack-link"
                        onClick={() => onOpenRack(rack.id)}
                      >
                        <Server size={15} />
                        {rack.name}
                        <small>{rack.units}U ↗</small>
                      </button>
                      {snapshot.equipment
                        .filter(
                          (e) =>
                            e.rackId === rack.id &&
                            `${e.name} ${e.role}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                        )
                        .map((e) => (
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
                            onClick={() => onSelect(e.id)}
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
}
