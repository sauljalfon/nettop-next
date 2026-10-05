import { GitFork, Network, PanelTop } from 'lucide-react'
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { isPassiveEquipment } from '../../shared/equipment'
import type { Equipment, Snapshot } from '../../shared/types'
import type { Focus } from '../map/focus'
import type { MapSession } from '../map/mapSession'
import type { SnapshotIndex } from '../map/snapshotIndex'
import EndpointList from './EndpointList'
import { inspectorGroups, inspectorHeader, inspectorLocation } from './model'
import './inspector.css'

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  equipment: Equipment
  installedIDs: ReadonlySet<string>
  /** Pins are the map's manual facets, so both lists stay in sync. */
  session: MapSession
  /** Find AGG / BB from every port of this device. */
  onFindFromDevice: () => void
  /** Find AGG / BB from one exact endpoint. */
  onFindFromHere: (endpointId: string) => void
  /** Select the card, center on it and highlight it (like choosing it in Explore). */
  onShowOnMap: (equipmentId: string) => void
  onFocus: (focus: Focus) => void
  onOpenRack: (rackId: string) => void
  /** The plan placement form, when a plan is open. */
  children?: ReactNode
}

/** The equipment inspector: header, location, actions and the exact endpoints. */
export default function Inspector({
  snapshot,
  index,
  equipment,
  installedIDs,
  session,
  onFindFromDevice,
  onFindFromHere,
  onShowOnMap,
  onFocus,
  onOpenRack,
  children,
}: Props) {
  const header = inspectorHeader(snapshot, index, equipment, installedIDs)
  const location = inspectorLocation(index, equipment.id)
  const groups = useMemo(
    () => inspectorGroups(snapshot, index, equipment.id),
    [snapshot, index, equipment.id],
  )
  const manual = useSyncExternalStore(session.subscribe, session.manualFacets)
  const pinned = useMemo(
    () => new Set(manual.get(equipment.id)),
    [manual, equipment.id],
  )
  const Icon = isPassiveEquipment(equipment) ? PanelTop : Network
  return (
    <>
      <div className="inspector-hero">
        <span className="equipment-icon">
          <Icon />
        </span>
        <h2>{header.name}</h2>
        <span className={`badge ${header.proposed ? 'green' : ''}`}>
          {header.proposed ? 'Proposed equipment' : 'Installed equipment'}
        </span>
      </div>
      <p className="location-breadcrumb">
        {location.site && (
          <>
            <button
              className="location-link"
              aria-label={`Focus site ${location.site.name}`}
              onClick={() => onFocus({ kind: 'site', id: location.site!.id })}
            >
              {location.site.name}
            </button>{' '}
            /{' '}
          </>
        )}
        {location.node && (
          <>
            <button
              className="location-link"
              aria-label={`Focus node ${location.node.name}`}
              onClick={() => onFocus({ kind: 'node', id: location.node!.id })}
            >
              {location.node.name}
            </button>{' '}
            /{' '}
          </>
        )}
        {location.rack && (
          <>
            <button
              className="location-link"
              aria-label={`Open ${location.rack.name} in Physical`}
              onClick={() => onOpenRack(location.rack!.id)}
            >
              {location.rack.name}
            </button>{' '}
            /{' '}
          </>
        )}
        {header.name}
      </p>
      <div className="detail-row">
        <span>Role</span>
        <strong>{header.role}</strong>
      </div>
      {header.network && (
        <div className="detail-row">
          <span>Network</span>
          <strong>{header.network}</strong>
        </div>
      )}
      <div className="detail-row">
        <span>Cabling</span>
        <strong>{header.summary}</strong>
      </div>
      <div className="detail-row">
        <span>Placement</span>
        <strong>
          {location.rack?.name} · U{equipment.unit}
        </strong>
      </div>
      <button className="button primary" onClick={onFindFromDevice}>
        <GitFork size={16} />
        Find AGG / BB from {equipment.name}
      </button>
      {children}
      <p className="section-label">Exact endpoints</p>
      <EndpointList
        key={equipment.id}
        equipmentName={equipment.name}
        groups={groups}
        networkName={(id) =>
          snapshot.networks.find((n) => n.id === id)?.name ?? id
        }
        pinned={pinned}
        onFindFromHere={onFindFromHere}
        onPin={(key) => session.toggleManual(equipment.id, key)}
        onShowOnMap={() => onShowOnMap(equipment.id)}
      />
    </>
  )
}
