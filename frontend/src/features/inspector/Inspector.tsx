import { Crosshair, GitFork, Network, PanelTop } from 'lucide-react'
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isPassiveEquipment } from '../../shared/equipment'
import type { Equipment, Snapshot } from '../../shared/types'
import type { LocationRef } from '../map/highlight'
import type { MapSession } from '../map/mapSession'
import type { SnapshotIndex } from '../map/snapshotIndex'
import {
  canFindFromDevice,
  inspectorGroups,
  inspectorHeader,
  inspectorLocation,
} from './model'
import Overview from './Overview'
import PortTable from './PortTable'
import './inspector.css'

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  equipment: Equipment
  installedIDs: ReadonlySet<string>
  /** Pins are the map's manual facets. */
  session: MapSession
  /** Find AGG / BB from every port of this device. */
  onFindFromDevice: () => void
  /** Find AGG / BB from one exact endpoint. */
  onFindFromHere: (endpointId: string) => void
  /** Select the card and center on it (no highlight). */
  onShowOnMap: (equipmentId: string) => void
  /** Highlight the site or node on the map. */
  onHighlight: (location: LocationRef) => void
  onOpenRack: (rackId: string) => void
  /** The plan placement form, shown on the Overview tab when a plan is open. */
  children?: ReactNode
}

type Tab = 'overview' | 'ports'

/**
 * The equipment inspector: a sticky header (identity, cabling meter, location,
 * actions and tabs) over an Overview tab and a compact Ports / Positions table.
 */
export default function Inspector({
  snapshot,
  index,
  equipment,
  installedIDs,
  session,
  onFindFromDevice,
  onFindFromHere,
  onShowOnMap,
  onHighlight,
  onOpenRack,
  children,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')
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
  const networkName = (id: string) =>
    snapshot.networks.find((n) => n.id === id)?.name ?? id
  const summary = index.summaries.get(equipment.id) ?? { cabled: 0, total: 0 }
  const passive = isPassiveEquipment(equipment)
  const Icon = passive ? PanelTop : Network
  const portsLabel = passive ? 'Positions' : 'Ports'
  return (
    <div className="inspector">
      <header className="inspector-header">
        <div className="inspector-title">
          <span className="equipment-icon">
            <Icon />
          </span>
          <h2>{header.name}</h2>
        </div>
        <div className="inspector-badges">
          <span className="badge">{header.role}</span>
          {header.network && <span className="badge">{header.network}</span>}
          <span className={`badge ${header.proposed ? 'green' : ''}`}>
            {header.proposed ? 'Proposed' : 'Installed'}
          </span>
        </div>
        <div className="cabling-meter">
          <div className="meter-bar" aria-hidden>
            <span
              style={{
                width: `${summary.total ? (100 * summary.cabled) / summary.total : 0}%`,
              }}
            />
          </div>
          <span>{header.summary}</span>
        </div>
        <p className="location-breadcrumb">
          {location.site && (
            <>
              <button
                className="location-link"
                aria-label={`Highlight site ${location.site.name} on the map`}
                onClick={() =>
                  onHighlight({ kind: 'site', id: location.site!.id })
                }
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
                aria-label={`Highlight node ${location.node.name} on the map`}
                onClick={() =>
                  onHighlight({ kind: 'node', id: location.node!.id })
                }
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
        <div className="inspector-actions">
          <button
            className="button"
            aria-label={`Show on map: ${equipment.name}`}
            onClick={() => onShowOnMap(equipment.id)}
          >
            <Crosshair size={14} />
            Show on map
          </button>
          {canFindFromDevice(equipment) && (
            <button
              className="button primary"
              aria-label={`Find AGG / BB from ${equipment.name}`}
              onClick={onFindFromDevice}
            >
              <GitFork size={14} />
              Find AGG / BB
            </button>
          )}
        </div>
        <div className="inspector-tabs" role="tablist">
          {(
            [
              ['overview', 'Overview'],
              ['ports', portsLabel],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={`inspector-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="inspector-panel"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div
        id="inspector-panel"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        className="inspector-panel"
      >
        {tab === 'overview' ? (
          <Overview
            role={header.role}
            placement={
              location.rack
                ? `${location.rack.name} · U${equipment.unit}`
                : undefined
            }
            groups={groups}
            networkName={networkName}
          >
            {children}
          </Overview>
        ) : (
          <PortTable
            key={equipment.id}
            equipmentName={equipment.name}
            groups={groups}
            networkName={networkName}
            pinned={pinned}
            onFindFromHere={onFindFromHere}
            onPin={(key) => session.toggleManual(equipment.id, key)}
          />
        )}
      </div>
    </div>
  )
}
