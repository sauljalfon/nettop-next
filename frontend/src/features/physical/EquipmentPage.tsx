import { useEffect, useMemo, useRef, useState } from 'react'
import ConnectPopover from '../patching/ConnectPopover'
import type { Snapshot } from '../../shared/types'
import Pieces from '../../shared/ui/Pieces'
import PlacePath from '../../shared/ui/PlacePath'
import { editMode } from '../details/model'
import EquipmentDetails from '../details/EquipmentDetails'
import type { SnapshotIndex } from '../map/snapshotIndex'
import EndpointEdit from '../planning/EndpointEdit'
import type { PlanEdit } from '../planning/editing'
import PortDetails from '../details/PortDetails'
import { followPort } from '../paths/follow'
import UplinksSummary from '../paths/UplinksSummary'
import { useUplinks } from '../paths/useUplinks'
import { buildSheet } from '../paths/sheet'
import EndpointDetail from './EndpointDetail'
import {
  cellLook,
  connectionChain,
  detailModel,
  endpointTooltip,
  equipmentSubtitle,
  faceMeta,
  type Face,
} from './equipmentModel'
import FaceView from './FaceView'
import type { PhysicalLocation } from './location'
import type { RouteMarks } from './inventory'

/**
 * The equipment page: its rack on the left (this equipment marked), the face in
 * the middle, and the selected endpoint's cable and peer on the right.
 */
export default function EquipmentPage({
  snapshot,
  index,
  location,
  face,
  colors,
  onSelectEndpoint,
  onClearEndpoint,
  onSide,
  onGoToPeer,
  onFind,
  onShowOnMap,
  marks,
  routeName,
  edit,
  onFixed,
  installedIds,
  installedLinkIds,
  planId,
}: {
  /** Set in a current plan: Delete…, Connect… and Disconnect…. */
  edit?: PlanEdit
  /** After a direct fix: refetch and toast. */
  onFixed: (message: string) => Promise<void>
  installedIds: ReadonlySet<string>
  installedLinkIds: ReadonlySet<string>
  /** The open plan's ID, for the uplinks request. */
  planId?: string
  snapshot: Snapshot
  index: SnapshotIndex
  location: PhysicalLocation
  /** Absent for a rack item: it has no ports, so no face. */
  face?: Face
  colors: ReadonlyMap<string, string>
  onSelectEndpoint: (endpointId: string) => void
  /** Clears the selected endpoint: the port panel closes. */
  onClearEndpoint: () => void
  onSide: (side: 'front' | 'rear') => void
  onGoToPeer: (endpointId: string) => void
  onFind: (endpointId: string) => void
  onShowOnMap: (equipmentId: string) => void
  /** The selected route's marks and its destination's name. */
  marks: RouteMarks
  routeName?: string
}) {
  const equipment = index.equipment.get(location.equipmentId ?? '')
  const uplinks = useUplinks(snapshot, index, equipment, planId)
  const uplinkIds = useMemo(
    () => new Set(uplinks.data?.lines.map((l) => l.startEndpointId)),
    [uplinks.data],
  )
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
  // A switch port shows the path it leads to; panel and HDF positions keep the chain.
  const walkSheet = useMemo(() => {
    const id = location.endpointId
    const owner = id
      ? index.equipment.get(index.owner.get(id) ?? '')
      : undefined
    return id && owner?.kind === 'switch'
      ? buildSheet(index, snapshot.networks, followPort(index, id))
      : undefined
  }, [index, snapshot.networks, location.endpointId])
  // Closing the panel puts focus back on the jack that was selected (or the face).
  const returnFocus = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (location.endpointId || returnFocus.current === undefined) return
    const id = returnFocus.current
    returnFocus.current = undefined
    const root = document.querySelector('.equipment-main')
    const target =
      (id &&
        root?.querySelector<HTMLElement>(
          `[data-endpoint-id="${CSS.escape(id)}"]`,
        )) ||
      root?.querySelector<HTMLElement>(
        '[data-testid="face-endpoint"][tabindex="0"]',
      )
    target?.focus()
  }, [location.endpointId])
  const closePort = () => {
    returnFocus.current = location.endpointId ?? ''
    setPopover(undefined)
    onClearEndpoint()
  }
  if (!equipment) return null
  if (!face) {
    const proposed =
      snapshot.context === 'planned' && !installedIds.has(equipment.id)
    return (
      <div className="equipment-page">
        <div className="equipment-layout no-strip no-detail">
          <div className="equipment-main">
            <p className="equipment-details" data-testid="equipment-details">
              <Pieces pieces={equipmentSubtitle(equipment)} />
              {(index.locationParts.get(equipment.id)?.length ?? 0) > 0 && (
                <>
                  {' · '}
                  <PlacePath parts={index.locationParts.get(equipment.id)!} />
                </>
              )}
            </p>
            <p className="muted" data-testid="no-ports">
              No ports
            </p>
            <EquipmentDetails
              key={equipment.id}
              equipment={equipment}
              mode={editMode(
                snapshot.context === 'installed' ? 'installed' : 'planned',
                proposed,
                !!edit,
              )}
              edit={edit}
              onFixed={onFixed}
            />
          </div>
        </div>
      </div>
    )
  }
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
    networks: snapshot.networks,
  })
  const faceCells =
    face.kind === 'switch'
      ? face.rows.flat()
      : face.kind === 'panel'
        ? face.face.positions
        : face.face.blocks.flatMap((b) => b.positions)
  const free = faceCells.filter((c) => cellLook(c).fill === 'free').length
  return (
    <div className="equipment-page">
      <div
        className={`equipment-layout no-strip ${detail ? 'has-detail' : 'no-detail'}`}
      >
        <div className="equipment-main">
          <p className="equipment-details" data-testid="equipment-details">
            {meta}
            {free > 0 && ` · ${free} free`}
            {(index.locationParts.get(equipment.id)?.length ?? 0) > 0 && (
              <>
                {' · '}
                <PlacePath parts={index.locationParts.get(equipment.id)!} />
              </>
            )}
          </p>
          <FaceView
            uplinkIds={uplinkIds}
            equipment={equipment}
            face={face}
            side={side}
            meta={meta}
            headless
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
          />
          {equipment.kind === 'switch' && (
            <UplinksSummary
              equipment={equipment}
              state={uplinks}
              selectedEndpointId={location.endpointId}
              onSelect={onSelectEndpoint}
            />
          )}
        </div>
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
          onClose={closePort}
          actions={
            detail &&
            snapshot.context !== 'installed' && (
              <EndpointEdit
                key={detail.endpointId}
                snapshot={snapshot}
                index={index}
                endpointId={detail.endpointId}
                installedLinkIds={installedLinkIds}
                edit={edit}
              />
            )
          }
          model={detail}
          chain={chain}
          walkSheet={walkSheet}
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
              {snapshot.context === 'installed' && (
                <EndpointEdit
                  key={detail.endpointId}
                  snapshot={snapshot}
                  index={index}
                  endpointId={detail.endpointId}
                  installedLinkIds={installedLinkIds}
                  edit={edit}
                />
              )}
            </>
          )}
        </EndpointDetail>
      </div>
    </div>
  )
}
