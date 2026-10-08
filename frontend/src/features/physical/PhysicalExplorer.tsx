import { ArrowLeft } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import type { Route, Snapshot } from '../../shared/types'
import { networkColors } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import {
  filterRackPreviews,
  locationKey,
  openLocation,
  rackPreviews,
  scopeNote,
} from './explorerModel'
import { breadcrumbs } from './history'
import { buildInventory, routeMarks } from './inventory'
import NodeLevel from './NodeLevel'
import EquipmentPage from './EquipmentPage'
import RackElevation from './RackElevation'
import { faceFor, faceMarks } from './equipmentModel'
import RouteTrail from './RouteTrail'
import { currentStep, trailSteps } from './trail'
import { switchSide } from './detail'
import { rackElevation } from './elevation'
import { physicalSession, type PhysicalSession } from './physicalSession'
import { resolveLocation } from './location'
import SiteCanvas from './SiteCanvas'
import SitesGrid from './SitesGrid'
import './physical.css'

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  /** The selected route; its marks are the only trace information used here. */
  route?: Route
  networkId?: string
  installedLinkIDs: ReadonlySet<string>
  /** The workspace's selected equipment; ringed in its rack and written on the root. */
  selectedEquipmentId?: string
  /** Installed equipment IDs; any other equipment is proposed (marked in a plan). */
  installedIds: ReadonlySet<string>
  /** In a plan: drops and drags are on. */
  canEdit: boolean
  onMoveEquipment: (equipmentId: string, rackId: string, unit?: number) => void
  onCreateEquipment: (
    kind: 'switch' | 'panel',
    rackId: string,
    unit?: number,
    role?: 'aggregation',
  ) => void
  /** Selects equipment (a click on a rack block, or an endpoint opened), without the inspector. */
  onSelectEquipment: (equipmentId: string) => void
  /** Find AGG / BB from one endpoint; the results show in the overlay. */
  onFindFromEndpoint: (endpointId: string) => void
  /** Show an equipment on the conceptual map. */
  onShowOnMap: (equipmentId: string) => void
  onError: (message: string) => void
  session?: PhysicalSession
}

/**
 * Sites → site → node → rack. Shows the complete physical inventory; the
 * selected network and route only mark it. Navigation state is the session's,
 * so it survives view and Installed/Plan switches. The root carries the model
 * (level, location, route marks, positions) for tests and tools.
 */
export default function PhysicalExplorer({
  snapshot,
  index,
  route,
  networkId,
  installedLinkIDs,
  selectedEquipmentId,
  installedIds,
  canEdit,
  onMoveEquipment,
  onCreateEquipment,
  onSelectEquipment,
  onFindFromEndpoint,
  onShowOnMap,
  onError,
  session = physicalSession,
}: Props) {
  const history = useSyncExternalStore(session.subscribe, session.history)
  const location = useMemo(
    () => resolveLocation(index, history.current),
    [index, history.current],
  )
  const inv = useMemo(() => buildInventory(snapshot, index), [snapshot, index])
  const marks = useMemo(() => routeMarks(index, route), [index, route])
  const colors = useMemo(
    () => networkColors(snapshot.networks),
    [snapshot.networks],
  )
  const crumbs = useMemo(() => breadcrumbs(index, location), [index, location])
  // The chosen network is a marker only; one that does not exist is ignored.
  const selectedNetwork = snapshot.networks.some((n) => n.id === networkId)
    ? networkId
    : undefined
  const [search, setSearch] = useState({ node: '', text: '' })
  const [positions, setPositions] = useState('')
  const [fittedSite, setFittedSite] = useState<string>()

  const go = (target: Parameters<typeof openLocation>[1]) =>
    session.navigate(openLocation(index, target))
  const openEndpoint = (endpointId: string) => {
    go({ endpointId })
    const equipmentId = index.owner.get(endpointId)
    if (equipmentId) onSelectEquipment(equipmentId)
  }

  const nodeId = location.nodeId ?? ''
  const previews = useMemo(
    () =>
      location.level === 'node'
        ? rackPreviews(snapshot, inv, nodeId, {
            marks,
            networkId: selectedNetwork,
            installedIds,
          })
        : [],
    [
      location.level,
      snapshot,
      inv,
      nodeId,
      marks,
      selectedNetwork,
      installedIds,
    ],
  )
  const rackId = location.rackId ?? ''
  const rackRows = useMemo(
    () =>
      location.level === 'rack' || location.level === 'equipment'
        ? rackElevation(inv, rackId, {
            marks,
            selectedEquipmentId,
            networkId: selectedNetwork,
            installedIds,
          })
        : [],
    [
      location.level,
      inv,
      rackId,
      marks,
      selectedEquipmentId,
      selectedNetwork,
      installedIds,
    ],
  )
  const equipment = location.equipmentId
    ? index.equipment.get(location.equipmentId)
    : undefined
  const onPage = location.level === 'equipment' && !!equipment
  const face = useMemo(
    () =>
      onPage
        ? faceFor(index, equipment!, location.side, {
            marks,
            selectedEndpointId: location.endpointId,
          })
        : undefined,
    [onPage, index, equipment, location.side, location.endpointId, marks],
  )
  const faceMark = face ? faceMarks(face) : undefined
  // The workspace's selected equipment follows the page (also after Back).
  useEffect(() => {
    if (onPage && location.equipmentId !== selectedEquipmentId)
      onSelectEquipment(location.equipmentId!)
  }, [onPage, location.equipmentId, selectedEquipmentId, onSelectEquipment])

  const openEquipment = (equipmentId: string) => {
    go({ equipmentId })
    onSelectEquipment(equipmentId)
  }
  // Selecting an endpoint, or its other side, replaces the location: no history entry.
  const selectEndpoint = (endpointId: string) =>
    session.replace(openLocation(index, { endpointId }))
  const setSide = (side: 'front' | 'rear') => {
    if (location.side === side) return
    const other = location.endpointId
      ? switchSide(index, location.endpointId)
      : undefined
    session.replace(
      other
        ? openLocation(index, { endpointId: other.endpointId })
        : { ...location, side, endpointId: undefined },
    )
  }
  const trail = useMemo(() => trailSteps(index, route), [index, route])
  const trailAt = currentStep(trail, location)
  const trailTitle = (() => {
    const end =
      route?.destinationEquipmentId ?? index.owner.get(route?.end ?? '')
    const name = end ? index.equipment.get(end)?.name : undefined
    return name ? `Route ${name}:` : 'Route:'
  })()
  const text = search.node === nodeId ? search.text : ''
  const shown = filterRackPreviews(previews, text)

  return (
    <div
      className="physical-explorer"
      data-physical-level={location.level}
      data-location={locationKey(location)}
      data-history-depth={history.back.length}
      data-route-equipment={[...marks.equipment].sort().join(' ')}
      data-node-positions={location.level === 'site' ? positions : ''}
      data-shown-racks={shown.map((r) => r.rackId).join(' ')}
      data-rack-equipment={rackRows
        .flatMap((r) => (r.kind === 'equipment' ? [r.equipmentId] : []))
        .join(' ')}
      data-rack-free-units={rackRows
        .flatMap((r) => (r.kind === 'free' ? [r.unit] : []))
        .join(' ')}
      data-selected-equipment={selectedEquipmentId ?? ''}
      data-route-steps={trail.length || ''}
      data-route-step={trailAt === undefined ? '' : trailAt + 1}
      data-selected-endpoint={onPage ? (location.endpointId ?? '') : ''}
      data-side={onPage ? (location.side ?? '') : ''}
      data-face-kind={faceMark?.kind ?? ''}
      data-face-blocks={faceMark?.blocks ?? ''}
      data-face-positions={faceMark?.positions ?? ''}
      data-site-fitted={
        location.level === 'site' && fittedSite === location.siteId
      }
    >
      <div className="physical-top">
        <div className="physical-nav">
          <button
            className="phys-back"
            disabled={history.back.length === 0}
            onClick={session.back}
          >
            <ArrowLeft size={13} aria-hidden />
            Back
          </button>
          <nav aria-label="Breadcrumbs" className="crumbs">
            {crumbs.map((c, i) => (
              <Fragment key={`${c.location.level}:${c.label}`}>
                {i > 0 && (
                  <span className="crumb-sep" aria-hidden>
                    ›
                  </span>
                )}
                {i === crumbs.length - 1 ? (
                  <strong aria-current="page">{c.label}</strong>
                ) : (
                  <button
                    className="crumb-link"
                    onClick={() => session.navigate(c.location)}
                  >
                    {c.label}
                  </button>
                )}
              </Fragment>
            ))}
          </nav>
        </div>
        <p className="scope-note" data-testid="scope-note">
          {scopeNote(snapshot.networks, selectedNetwork)}
        </p>
        {trail.length > 0 && (
          <RouteTrail
            title={trailTitle}
            steps={trail}
            current={trailAt}
            onOpen={(step) => {
              go({ endpointId: step.openEndpointId })
              onSelectEquipment(step.equipmentId)
            }}
          />
        )}
      </div>
      <div className="physical-body">
        {location.level === 'sites' && (
          <SitesGrid
            snapshot={snapshot}
            inv={inv}
            marks={marks}
            networkId={selectedNetwork}
            onOpen={(siteId) => go({ siteId })}
          />
        )}
        {location.level === 'site' && (
          <SiteCanvas
            key={location.siteId}
            siteId={location.siteId!}
            snapshot={snapshot}
            index={index}
            inv={inv}
            marks={marks}
            networkId={selectedNetwork}
            installedLinkIDs={installedLinkIDs}
            session={session}
            onOpenRacks={(id) => go({ nodeId: id })}
            onOpenEndpoint={openEndpoint}
            onError={onError}
            onPositions={setPositions}
            onFitted={setFittedSite}
          />
        )}
        {location.level === 'node' && (
          <NodeLevel
            canEdit={canEdit}
            onMoveEquipment={onMoveEquipment}
            onCreateEquipment={onCreateEquipment}
            nodeName={index.nodes.get(nodeId)?.name ?? ''}
            total={previews.length}
            previews={shown}
            colors={colors}
            search={text}
            onSearch={(t) => setSearch({ node: nodeId, text: t })}
            onOpen={(rackId) => go({ rackId })}
            onOpenEquipment={openEquipment}
          />
        )}
        {location.level === 'rack' && (
          <RackElevation
            snapshot={snapshot}
            rackId={rackId}
            rows={rackRows}
            colors={colors}
            canEdit={canEdit}
            onSelect={openEquipment}
            onMoveEquipment={onMoveEquipment}
            onCreateEquipment={onCreateEquipment}
          />
        )}
        {onPage && face && (
          <EquipmentPage
            snapshot={snapshot}
            index={index}
            inv={inv}
            location={location}
            face={face}
            rackRows={rackRows}
            colors={colors}
            onOpenEquipment={openEquipment}
            onSelectEndpoint={selectEndpoint}
            onSide={setSide}
            onGoToPeer={(endpointId) => {
              go({ endpointId })
              const owner = index.owner.get(endpointId)
              if (owner) onSelectEquipment(owner)
            }}
            onFind={onFindFromEndpoint}
            onShowOnMap={onShowOnMap}
          />
        )}
      </div>
    </div>
  )
}
