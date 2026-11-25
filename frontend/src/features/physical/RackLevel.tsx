import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { hasPorts } from '../../shared/equipment'
import type { Snapshot } from '../../shared/types'
import Name from '../../shared/ui/Name'
import type { SnapshotIndex } from '../map/snapshotIndex'
import PathBar from '../paths/PathBar'
import { useUplinks } from '../paths/useUplinks'
import type { PlanEdit } from '../planning/editing'
import type { DropHandlers } from './drops'
import type { ElevationRow } from './elevation'
import {
  connectionChain,
  detailModel,
  faceMeta,
  pageFace,
} from './equipmentModel'
import EquipmentWork from './EquipmentWork'
import { useHdfNumbering } from './hdfNumbering'
import type { RouteMarks } from './inventory'
import { chosenUnit, type PhysicalSession } from './physicalSession'
import { switchSide } from './detail'
import RackElevation from './RackElevation'

/** The gap of `.rack-work`'s grid: between the work area and the path card. */
const WORK_GAP = 14

/**
 * The rack level (D50): the slim rack, the chosen unit beside it (its head and
 * `EquipmentWork`: the face and the side column), and the path card across
 * both. A click on a unit chooses it, a double-click or Open page opens its
 * page. The chosen unit and its jack are the session's, per rack.
 */
export default function RackLevel({
  snapshot,
  index,
  session,
  rackId,
  rows,
  marks,
  colors,
  canEdit,
  edit,
  planId,
  installedIds,
  installedLinkIds,
  routeName,
  onOpenEquipment,
  onGoToPeer,
  onFind,
  onFullPage,
  onShowOnMap,
  onFixed,
  onPrint,
  onMoveEquipment,
  onCreateEquipment,
}: DropHandlers & {
  snapshot: Snapshot
  index: SnapshotIndex
  session: PhysicalSession
  rackId: string
  /** The rack's rows; the chosen unit is marked selected here. */
  rows: ElevationRow[]
  marks: RouteMarks
  colors: ReadonlyMap<string, string>
  canEdit: boolean
  edit?: PlanEdit
  planId?: string
  installedIds: ReadonlySet<string>
  installedLinkIds: ReadonlySet<string>
  routeName?: string
  onOpenEquipment: (equipmentId: string) => void
  onGoToPeer: (endpointId: string) => void
  onFind: (endpointId: string) => void
  onFullPage: (endpointId: string) => void
  onShowOnMap: (equipmentId: string) => void
  onFixed: (message: string) => Promise<void>
  onPrint: () => void
}) {
  const view = useSyncExternalStore(session.subscribe, () =>
    session.rackView(rackId),
  )
  const chosenId = chosenUnit(view, rows, (id) => {
    const e = index.equipment.get(id)
    return !!e && hasPorts(e)
  })
  const marked = useMemo(
    () =>
      rows.map((r) =>
        r.kind === 'equipment'
          ? { ...r, selected: r.equipmentId === chosenId }
          : r,
      ),
    [rows, chosenId],
  )
  const equipment = chosenId ? index.equipment.get(chosenId) : undefined
  // The jack belongs to the unit it was chosen on.
  const endpointId =
    view.equipmentId === chosenId &&
    view.endpointId &&
    index.owner.get(view.endpointId) === chosenId
      ? view.endpointId
      : undefined
  const [sideChoice, setSideChoice] = useState<{
    id: string
    side: 'front' | 'rear'
  }>()
  const jackSide = endpointId
    ? index.lookup.endpoints.get(endpointId)?.side
    : undefined
  const wanted =
    jackSide ?? (sideChoice?.id === chosenId ? sideChoice?.side : undefined)
  const face = useMemo(
    () =>
      equipment
        ? pageFace(index, equipment, wanted, {
            marks,
            selectedEndpointId: endpointId,
          })
        : undefined,
    [index, equipment, wanted, marks, endpointId],
  )
  const side = face && face.kind !== 'switch' ? (wanted ?? 'front') : undefined
  const uplinks = useUplinks(snapshot, index, equipment, planId)
  const uplinkIds = useMemo(
    () => new Set(uplinks.data?.lines.map((l) => l.startEndpointId)),
    [uplinks.data],
  )
  const detail = useMemo(
    () =>
      endpointId
        ? detailModel(index, snapshot.networks, endpointId)
        : undefined,
    [index, snapshot.networks, endpointId],
  )
  const chain = useMemo(
    () =>
      endpointId
        ? connectionChain(index, snapshot.networks, endpointId, marks)
        : [],
    [index, snapshot.networks, endpointId, marks],
  )
  const installed = useMemo(
    () =>
      snapshot.context === 'planned'
        ? { equipment: installedIds, links: installedLinkIds }
        : undefined,
    [snapshot.context, installedIds, installedLinkIds],
  )
  const numbering = useHdfNumbering()
  // The path card's height: the room the rack and the face keep free under themselves.
  const slot = useRef<HTMLDivElement>(null)
  const [pathH, setPathH] = useState(0)
  useLayoutEffect(() => {
    const el = slot.current
    if (!el) {
      setPathH(0)
      return
    }
    const read = () => setPathH(Math.ceil(el.getBoundingClientRect().height))
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [chosenId, !!face])

  const pick = (id: string) => session.chooseUnit(rackId, id)
  const selectJack = (id: string) => {
    if (!chosenId) return
    session.chooseUnit(rackId, chosenId)
    session.selectJack(rackId, id)
  }
  const clearJack = () => session.selectJack(rackId, undefined)
  const setSide = (next: 'front' | 'rear') => {
    if (!chosenId || next === side) return
    const other = endpointId ? switchSide(index, endpointId) : undefined
    setSideChoice({ id: chosenId, side: next })
    if (other) selectJack(other.endpointId)
    else clearJack()
  }
  const meta =
    equipment && face
      ? faceMeta(equipment, {
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
      : undefined
  const keepBelow = face ? pathH + WORK_GAP : 0

  return (
    <div className="rack-screen">
      <div className="rack-work">
        <RackElevation
          compact
          snapshot={snapshot}
          rackId={rackId}
          rows={marked}
          colors={colors}
          canEdit={canEdit}
          keepBelow={keepBelow}
          onPick={pick}
          onOpen={onOpenEquipment}
          onPrint={onPrint}
          onMoveEquipment={onMoveEquipment}
          onCreateEquipment={onCreateEquipment}
        />
        <div
          className="rack-pick"
          data-testid="rack-chosen"
          data-equipment-id={chosenId ?? ''}
        >
          {equipment ? (
            <>
              <header className="rack-pick-head">
                <h2>
                  <Name text={equipment.name} />
                </h2>
                <span className="meta">
                  {meta ?? 'No ports'} · U{equipment.unit}
                </span>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onOpenEquipment(equipment.id)}
                >
                  Open page
                </button>
              </header>
              {face && meta ? (
                <EquipmentWork
                  key={equipment.id}
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
                  onSelectEndpoint={selectJack}
                  onGoToPeer={onGoToPeer}
                  onFind={onFind}
                  onShowOnMap={onShowOnMap}
                  onSide={setSide}
                  onClose={clearJack}
                  keepBelow={keepBelow}
                />
              ) : (
                <p className="muted" data-testid="no-ports">
                  No ports
                </p>
              )}
            </>
          ) : (
            <p className="muted" data-testid="rack-empty">
              No equipment with ports in this rack.
            </p>
          )}
        </div>
        {face && (
          <div className="path-slot" ref={slot}>
            <PathBar
              index={index}
              endpointId={detail?.endpointId}
              installed={installed}
              colors={colors}
              numbering={numbering}
              onOpen={onGoToPeer}
              onClose={clearJack}
              onFullPage={onFullPage}
            />
          </div>
        )}
      </div>
    </div>
  )
}
