import {
  Box,
  Crosshair,
  GitFork,
  Network,
  PanelTop,
  Server,
  Table2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { hasPorts, isPassiveEquipment } from '../../shared/equipment'
import { rackItemPieces } from '../../shared/rackItems'
import Pieces from '../../shared/ui/Pieces'
import type { Equipment, Snapshot } from '../../shared/types'
import DeleteEquipment from '../planning/DeleteEquipment'
import { DisconnectConfirm } from '../planning/EditConfirms'
import type { PlanEdit } from '../planning/editing'
import NetworkBadge from '../map/NetworkBadge'
import { cardRoleLabel } from '../map/cardRole'
import { buildHierarchies } from '../map/hierarchy'
import { colorOf, networkColors } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import {
  canFindFromDevice,
  inspectorHeader,
  inspectorLocation,
  modelLine,
  wayUpLine,
} from './model'
import './inspector.css'
import Name from '../../shared/ui/Name'
import { PlaceSep } from '../../shared/ui/PlacePath'
import Chip from '../../shared/ui/Chip'

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  equipment: Equipment
  installedIDs: ReadonlySet<string>
  /** Find AGG / BB from every port of this device. */
  onFindFromDevice: () => void
  /** Select the card and center on it. */
  onShowOnMap: (equipmentId: string) => void
  /** Open the equipment page in Physical. */
  onShowInPhysical: (equipmentId: string) => void
  /** Open the Inventory's Ports list with only this equipment. */
  onOpenInInventory: (equipmentName: string) => void
  /** Open a site or node in Physical. */
  onOpenPlace: (target: { siteId?: string; nodeId?: string }) => void
  onOpenRack: (rackId: string) => void
  /** The Inventory's Delete… or Disconnect…: opens that confirm at once, then `onOpenRequestHandled`. */
  openRequest?: OpenRequest
  onOpenRequestHandled?: () => void
  /** Set in a current plan: the confirms of a request can save. */
  edit?: PlanEdit
  installedLinkIDs?: ReadonlySet<string>
}

export type OpenRequest = { equipmentId: string; serial: number } & (
  { kind: 'delete' } | { kind: 'disconnect'; linkId: string }
)

/**
 * The equipment inspector, a short card (D49): identity, where, how much is
 * cabled, its way up and model, and four actions. Ports, details, history and
 * moves are on the equipment page; the Inventory's Delete… and Disconnect…
 * open their confirm here.
 */
export default function Inspector({
  snapshot,
  index,
  equipment,
  installedIDs,
  onFindFromDevice,
  onShowOnMap,
  onShowInPhysical,
  onOpenInInventory,
  onOpenPlace,
  onOpenRack,
  openRequest,
  onOpenRequestHandled,
  edit,
  installedLinkIDs,
}: Props) {
  // A request is taken once: held here for the confirms, and the owner forgets it.
  const [asked, setAsked] = useState<OpenRequest>()
  useEffect(() => {
    if (!openRequest) return
    setAsked(openRequest)
    onOpenRequestHandled?.()
    // Only a new request is taken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.serial])
  // A confirm asked on one equipment is not kept for another.
  useEffect(() => {
    setAsked((a) => (a && a.equipmentId === equipment.id ? a : undefined))
  }, [equipment.id])
  const askedHere = asked?.equipmentId === equipment.id ? asked : undefined
  const header = inspectorHeader(snapshot, index, equipment, installedIDs)
  const location = inspectorLocation(index, equipment.id)
  const colors = useMemo(() => networkColors(snapshot.networks), [snapshot])
  const summary = index.summaries.get(equipment.id) ?? { cabled: 0, total: 0 }
  const passive = isPassiveEquipment(equipment)
  const ported = hasPorts(equipment)
  const Icon = !ported ? Box : passive ? PanelTop : Network
  const hierarchies = useMemo(() => buildHierarchies(index), [index])
  const wayUp = ported ? wayUpLine(hierarchies, index, equipment.id) : undefined
  const model = modelLine(equipment)
  return (
    <div className="inspector" data-testid="inspector-card">
      <header className="inspector-header">
        <div className="inspector-title">
          <span className="equipment-icon">
            <Icon />
          </span>
          <h2>
            <Name text={header.name} />
          </h2>
        </div>
        <div className="inspector-badges">
          <Chip kind="role">{cardRoleLabel(equipment)}</Chip>
          {header.network && equipment.networkId && (
            <NetworkBadge
              name={header.network}
              color={colorOf(colors, equipment.networkId)}
            />
          )}
          <Chip kind={header.proposed ? 'proposed' : 'state'}>
            {header.proposed ? 'Proposed' : 'Installed'}
          </Chip>
        </div>
      </header>
      <dl className="detail-list inspector-facts">
        <div>
          <dt>Where</dt>
          <dd>
            <p className="location-breadcrumb">
              {location.site && (
                <>
                  <button
                    className="location-link"
                    aria-label={`Open site ${location.site.name} in Physical`}
                    onClick={() => onOpenPlace({ siteId: location.site!.id })}
                  >
                    <Name text={location.site.name} />
                  </button>
                  <PlaceSep />
                </>
              )}
              {location.node && (
                <>
                  <button
                    className="location-link"
                    aria-label={`Open node ${location.node.name} in Physical`}
                    onClick={() => onOpenPlace({ nodeId: location.node!.id })}
                  >
                    <Name text={location.node.name} />
                  </button>
                  <PlaceSep />
                </>
              )}
              {location.rack && (
                <span className="nowrap">
                  <button
                    className="location-link"
                    aria-label={`Open ${location.rack.name} in Physical`}
                    onClick={() => onOpenRack(location.rack!.id)}
                  >
                    <Name text={location.rack.name} />
                  </button>
                  <span aria-hidden> · </span>U{equipment.unit}
                </span>
              )}
            </p>
          </dd>
        </div>
        {!ported && (
          <div>
            <dt>Type</dt>
            <dd>
              <Pieces pieces={rackItemPieces(equipment)} />
            </dd>
          </div>
        )}
        {ported ? (
          <div>
            <dt>Ports</dt>
            <dd>
              <div className="cabling-meter">
                <span>{header.summary}</span>
                <div className="meter-bar" aria-hidden>
                  <span
                    style={{
                      width: `${summary.total ? (100 * summary.cabled) / summary.total : 0}%`,
                    }}
                  />
                </div>
              </div>
            </dd>
          </div>
        ) : (
          <div>
            <dt>Ports</dt>
            <dd data-testid="no-ports">No ports</dd>
          </div>
        )}
        {wayUp && (
          <div>
            <dt>Way up</dt>
            <dd data-testid="inspector-way-up">
              <Pieces pieces={wayUp} />
            </dd>
          </div>
        )}
        {model && (
          <div>
            <dt>Model</dt>
            <dd data-testid="inspector-model">
              <Pieces pieces={model} />
            </dd>
          </div>
        )}
      </dl>
      <div className="inspector-actions">
        {canFindFromDevice(equipment) && (
          <button
            className="btn primary"
            aria-label={`Find AGG / BB from ${equipment.name}`}
            onClick={onFindFromDevice}
          >
            <GitFork size={14} />
            Find AGG / BB
          </button>
        )}
        <button
          className="btn"
          aria-label={`Open in Physical: ${equipment.name}`}
          onClick={() => onShowInPhysical(equipment.id)}
        >
          <Server size={14} />
          Open in Physical
        </button>
        {ported && (
          <button
            className="btn"
            aria-label={`Show on map: ${equipment.name}`}
            onClick={() => onShowOnMap(equipment.id)}
          >
            <Crosshair size={14} />
            Show on map
          </button>
        )}
        <button
          className="btn"
          aria-label={`Open in inventory: ${equipment.name}`}
          onClick={() => onOpenInInventory(equipment.name)}
        >
          <Table2 size={14} />
          Open in inventory
        </button>
      </div>
      {edit && askedHere?.kind === 'delete' && (
        <DeleteEquipment
          snapshot={snapshot}
          index={index}
          equipmentId={equipment.id}
          proposed={header.proposed}
          edit={edit}
          where="inspector"
          opener={`inspector:${equipment.id}`}
          startOpen={askedHere.serial}
          onClosed={() => setAsked(undefined)}
        />
      )}
      {edit && askedHere?.kind === 'disconnect' && (
        <DisconnectConfirm
          snapshot={snapshot}
          index={index}
          linkId={askedHere.linkId}
          proposed={!installedLinkIDs?.has(askedHere.linkId)}
          edit={edit}
          openerKey={`inspector:${equipment.id}`}
          onClose={() => setAsked(undefined)}
        />
      )}
    </div>
  )
}
