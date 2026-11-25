import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Snapshot } from '../../shared/types'
import Pieces from '../../shared/ui/Pieces'
import PlacePath from '../../shared/ui/PlacePath'
import { editMode } from '../details/model'
import EquipmentDetails from '../details/EquipmentDetails'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { PlanEdit } from '../planning/editing'
import PathBar from '../paths/PathBar'
import { useUplinks } from '../paths/useUplinks'
import {
  cellLook,
  connectionChain,
  detailModel,
  equipmentSubtitle,
  faceMeta,
  type Face,
} from './equipmentModel'
import EquipmentWork, { faceCellsOf } from './EquipmentWork'
import { useHdfNumbering } from './hdfNumbering'
import type { PhysicalLocation } from './location'
import type { RouteMarks } from './inventory'

/** The gap of `.equipment-main`'s grid: between the work area and the path card. */
const MAIN_GAP = 12

/**
 * The equipment page: the details line, then the work area (`EquipmentWork`: the
 * face and, beside it, Connects to and the selected jack's card), and the path
 * card under both (one line while no jack is selected).
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
  /** Open the Trace page on the path card. */
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
  // The path card's height : the room the face keeps free under itself.
  const slot = useRef<HTMLDivElement>(null)
  const [pathH, setPathH] = useState(0)
  useLayoutEffect(() => {
    const el = slot.current
    if (!el) return
    const read = () => setPathH(Math.ceil(el.getBoundingClientRect().height))
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [equipment?.id, face])
  const [editing, setEditing] = useState(false)
  useEffect(() => setEditing(false), [equipment?.id])
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
  const faceCells = faceCellsOf(face)
  const free = faceCells.filter((c) => cellLook(c).fill === 'free').length
  return (
    <div className="equipment-area">
      <div className="equipment-page">
        <div className="equipment-layout no-strip no-detail">
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
            <EquipmentWork
              snapshot={snapshot}
              index={index}
              equipment={equipment}
              face={face}
              side={side}
              meta={meta}
              colors={colors}
              uplinkIds={uplinkIds}
              detail={detail}
              chain={chain}
              routeName={routeName}
              edit={edit}
              onFixed={onFixed}
              installedIds={installedIds}
              installedLinkIds={installedLinkIds}
              onSelectEndpoint={onSelectEndpoint}
              onGoToPeer={onGoToPeer}
              onFind={onFind}
              onShowOnMap={onShowOnMap}
              onSide={onSide}
              onClose={closePort}
              keepBelow={pathH + MAIN_GAP}
            />
            <div className="path-slot" ref={slot}>
              <PathBar
                index={index}
                endpointId={detail?.endpointId}
                installed={installed}
                colors={colors}
                numbering={numbering}
                onOpen={onGoToPeer}
                onClose={closePort}
                onFullPage={onFullPage}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
