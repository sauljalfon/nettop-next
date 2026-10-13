import { useMemo, useState } from 'react'
import ConnectPopover from '../patching/ConnectPopover'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import DeleteEquipment from '../planning/DeleteEquipment'
import DuplicateEquipment from '../planning/DuplicateEquipment'
import EndpointEdit from '../planning/EndpointEdit'
import type { PlanEdit } from '../planning/editing'
import PortDetails from '../details/PortDetails'
import EndpointDetail from './EndpointDetail'
import type { ElevationRow } from './elevation'
import {
  connectionChain,
  detailModel,
  endpointTooltip,
  faceMeta,
  type Face,
} from './equipmentModel'
import FaceView from './FaceView'
import type { Inventory } from './inventory'
import type { PhysicalLocation } from './location'
import type { RouteMarks } from './inventory'
import RackStrip from './RackStrip'

/**
 * The equipment page: its rack on the left (this equipment marked), the face in
 * the middle, and the selected endpoint's cable and peer on the right.
 */
export default function EquipmentPage({
  snapshot,
  index,
  inv,
  location,
  face,
  rackRows,
  colors,
  onOpenEquipment,
  onSelectEndpoint,
  onSide,
  onGoToPeer,
  onFind,
  onShowOnMap,
  onPrint,
  marks,
  routeName,
  edit,
  onFixed,
  installedIds,
  installedLinkIds,
}: {
  /** Set in a current plan: Delete…, Connect… and Disconnect…. */
  edit?: PlanEdit
  /** After a direct fix: refetch and toast. */
  onFixed: (message: string) => Promise<void>
  installedIds: ReadonlySet<string>
  installedLinkIds: ReadonlySet<string>
  snapshot: Snapshot
  index: SnapshotIndex
  inv: Inventory
  location: PhysicalLocation
  face: Face
  rackRows: ElevationRow[]
  colors: ReadonlyMap<string, string>
  onOpenEquipment: (equipmentId: string) => void
  onSelectEndpoint: (endpointId: string) => void
  onSide: (side: 'front' | 'rear') => void
  onGoToPeer: (endpointId: string) => void
  onFind: (endpointId: string) => void
  onShowOnMap: (equipmentId: string) => void
  onPrint: () => void
  /** The selected route's marks and its destination's name. */
  marks: RouteMarks
  routeName?: string
}) {
  const equipment = index.equipment.get(location.equipmentId ?? '')
  // In a plan, a click on a free jack also asks where its cable goes.
  const [popover, setPopover] = useState<{
    endpointId: string
    anchor: DOMRect
  }>()
  const detail = useMemo(
    () =>
      location.endpointId
        ? detailModel(index, snapshot.networks, location.endpointId)
        : undefined,
    [index, snapshot.networks, location.endpointId],
  )
  const chain = useMemo(
    () =>
      location.endpointId
        ? connectionChain(index, snapshot.networks, location.endpointId, marks)
        : [],
    [index, snapshot.networks, location.endpointId, marks],
  )
  if (!equipment) return null
  const side = face.kind === 'switch' ? undefined : (location.side ?? 'front')
  const meta = faceMeta(equipment, {
    rows: face.kind === 'hdf' ? face.face.rows : undefined,
    count:
      face.kind === 'switch'
        ? face.rows.reduce((n, r) => n + r.length, 0)
        : face.kind === 'panel'
          ? face.face.positions.length
          : undefined,
    side,
    location: index.locations.get(equipment.id) ?? '',
    networks: snapshot.networks,
  })
  return (
    <div className="equipment-page">
      <RackStrip
        inv={inv}
        rackId={location.rackId ?? ''}
        name={index.racks.get(location.rackId ?? '')?.name ?? ''}
        rows={rackRows}
        colors={colors}
        onOpen={onOpenEquipment}
      />
      <FaceView
        equipment={equipment}
        face={face}
        side={side}
        meta={meta}
        networks={snapshot.networks}
        colors={colors}
        tooltip={(cell, ordinal) =>
          endpointTooltip(index, equipment, cell, ordinal, side)
        }
        onSelect={(id, event) => {
          onSelectEndpoint(id)
          setPopover(
            edit && event && !index.cabled.has(id)
              ? {
                  endpointId: id,
                  anchor: event.currentTarget.getBoundingClientRect(),
                }
              : undefined,
          )
        }}
        onSide={onSide}
        onPrint={onPrint}
        proposed={
          snapshot.context === 'planned' && !installedIds.has(equipment.id)
        }
        editSlot={
          edit && (
            <>
              <DuplicateEquipment
                snapshot={snapshot}
                index={index}
                equipmentId={equipment.id}
                edit={edit}
                where="page"
              />
              <DeleteEquipment
                snapshot={snapshot}
                index={index}
                equipmentId={equipment.id}
                proposed={!installedIds.has(equipment.id)}
                edit={edit}
                where="page"
              />
            </>
          )
        }
      />
      {popover && edit && (
        <ConnectPopover
          key={popover.endpointId}
          index={index}
          endpointId={popover.endpointId}
          anchor={popover.anchor}
          onClose={() => setPopover(undefined)}
        />
      )}
      <EndpointDetail
        model={detail}
        chain={chain}
        routeName={routeName}
        networkColor={
          detail?.networkId ? colors.get(detail.networkId) : undefined
        }
        onGoToPeer={onGoToPeer}
        onSwitch={onSelectEndpoint}
        onFind={onFind}
        onShowOnMap={() => onShowOnMap(equipment.id)}
      >
        {detail && (
          <>
            <PortDetails
              key={`details:${detail.endpointId}`}
              snapshot={snapshot}
              index={index}
              endpointId={detail.endpointId}
              proposed={
                snapshot.context === 'planned' &&
                !installedIds.has(equipment.id)
              }
              edit={edit}
              onFixed={onFixed}
            />
            <EndpointEdit
              key={detail.endpointId}
              snapshot={snapshot}
              index={index}
              endpointId={detail.endpointId}
              installedLinkIds={installedLinkIds}
              edit={edit}
            />
          </>
        )}
      </EndpointDetail>
    </div>
  )
}
