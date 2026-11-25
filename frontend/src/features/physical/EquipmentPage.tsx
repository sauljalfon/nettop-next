import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
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
import PathBar from '../paths/PathBar'
import { useUplinks } from '../paths/useUplinks'
import ConnectsTo from './ConnectsToCard'
import { connectsTo } from './connectsTo'
import { dockSession } from '../frame/dock'
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
import { useHdfNumbering } from './hdfNumbering'
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
  onFullPage,
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
  /** Full page ⤢ on the path bar. */
  onFullPage: (endpointId: string) => void
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
  // In a plan, what is installed: the path draws anything else dashed.
  const installed = useMemo(
    () =>
      snapshot.context === 'planned'
        ? { equipment: installedIds, links: installedLinkIds }
        : undefined,
    [snapshot.context, installedIds, installedLinkIds],
  )
  const numbering = useHdfNumbering()
  // Connects to: the far equipment whose jacks are lit; a view state of this
  // equipment only, so a choice made on another one is ignored.
  const [pick, setPick] = useState<{ from: string; far: string }>()
  const [editing, setEditing] = useState(false)
  useEffect(() => setEditing(false), [equipment?.id])
  if (pick && pick.from !== equipment?.id) setPick(undefined)
  const far = useMemo(
    () => (equipment ? connectsTo(index, equipment.id) : []),
    [index, equipment],
  )
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
  // A click on a jack in this page opens the Port tab, whichever tab the dock was on.
  const selectJack = (id: string) => {
    onSelectEndpoint(id)
    dockSession.showDetails('Port')
  }
  const goToJack = (id: string) => {
    onGoToPeer(id)
    dockSession.showDetails('Port')
  }
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
  const chosen =
    pick?.from === equipment.id
      ? far.find((f) => f.equipmentId === pick.far)
      : undefined
  const faceIds = new Set(faceCells.map((c) => c.endpointId))
  const lit = chosen
    ? new Set(chosen.endpointIds.filter((id) => faceIds.has(id)))
    : undefined
  const otherSide =
    chosen && lit && side && lit.size < chosen.endpointIds.length
      ? `${chosen.endpointIds.length - lit.size} on the ${side === 'front' ? 'rear' : 'front'}`
      : undefined
  const isSwitch = face.kind === 'switch'
  const links = (under: boolean) => (
    <ConnectsTo
      far={far}
      chosen={chosen?.equipmentId}
      onChoose={(id) =>
        setPick(id ? { from: equipment.id, far: id } : undefined)
      }
      colors={colors}
      networkNames={index.networkNames}
      hint={otherSide}
      under={under}
      fixedHeight={under && linksUnderTall}
    />
  )
  // A switch has it under the face; an HDF or a panel beside it, or under it
  // while the port panel takes the place beside.
  const linksBeside = !isSwitch && !detail
  // Under an HDF's or a panel's face (a port is selected): the face's scroll box
  // gives up this height so the page itself never scrolls.
  const linksUnderTall = !isSwitch && !!detail
  const linksHeight = 33 + 30 * Math.min(Math.max(far.length, 1), 4) + 2
  const free = faceCells.filter((c) => cellLook(c).fill === 'free').length
  return (
    <div
      className={`equipment-area${detail ? ' has-path' : ''}${linksUnderTall ? ' links-under' : ''}`}
      style={
        linksUnderTall
          ? ({ '--links-h': `${linksHeight}px` } as CSSProperties)
          : undefined
      }
    >
      <div className="equipment-page">
        <div
          className={`equipment-layout no-strip no-detail${linksBeside ? ' has-links' : ''}`}
        >
          <div className="equipment-main" data-kind={equipment.kind}>
            <p className="equipment-details" data-testid="equipment-details">
              {meta}
              {free > 0 && ` · ${free} free`}
              {(index.locationParts.get(equipment.id)?.length ?? 0) > 0 && (
                <>
                  {' · '}
                  <PlacePath parts={index.locationParts.get(equipment.id)!} />
                </>
              )}
              {' · '}
              <button
                type="button"
                className="link-button"
                data-opener={`details:${equipment.id}`}
                onClick={() => setEditing(true)}
              >
                Edit details
              </button>
            </p>
            {editing && (
              <EquipmentDetails
                key={equipment.id}
                equipment={equipment}
                mode={editMode(
                  snapshot.context === 'installed' ? 'installed' : 'planned',
                  snapshot.context === 'planned' &&
                    !installedIds.has(equipment.id),
                  !!edit,
                )}
                edit={edit}
                onFixed={onFixed}
                editorOnly
                onClosed={() => setEditing(false)}
              />
            )}
            <FaceView
              uplinkIds={uplinkIds}
              lit={lit}
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
                selectJack(id)
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
            {!linksBeside && links(true)}
          </div>
          {linksBeside && links(false)}
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
            routeName={routeName}
            networkColor={
              detail?.networkId ? colors.get(detail.networkId) : undefined
            }
            onGoToPeer={goToJack}
            onSwitch={selectJack}
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
      {detail && (
        <PathBar
          index={index}
          endpointId={detail.endpointId}
          installed={installed}
          colors={colors}
          numbering={numbering}
          onOpen={goToJack}
          onClose={closePort}
          onFullPage={onFullPage}
        />
      )}
    </div>
  )
}
