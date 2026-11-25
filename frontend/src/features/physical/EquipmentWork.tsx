import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import ConnectPopover from '../patching/ConnectPopover'
import type { Equipment, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import EndpointEdit from '../planning/EndpointEdit'
import type { PlanEdit } from '../planning/editing'
import PortDetails from '../details/PortDetails'
import ConnectsTo from './ConnectsToCard'
import { connectsTo } from './connectsTo'
import EndpointDetail from './EndpointDetail'
import {
  endpointTooltip,
  type ChainItem,
  type DetailModel,
  type Face,
} from './equipmentModel'
import FaceView from './FaceView'
import { jackMax, useSideLimit } from './useFaceFit'

/** Every cell of a face, whatever its kind. */
export function faceCellsOf(face: Face) {
  return face.kind === 'switch'
    ? face.rows.flat()
    : face.kind === 'panel'
      ? face.face.positions
      : face.face.blocks.flatMap((b) => b.positions)
}

/**
 * The work area of one equipment (D50): its face, fitted to the room, and the
 * side column beside it (under it on a narrow page): Connects to, then the
 * selected jack's card, or one line asking for a jack. Used by the equipment
 * page; the rack level will use it too, so it holds no page state.
 */
export default function EquipmentWork({
  snapshot,
  index,
  equipment,
  face,
  side,
  meta,
  colors,
  uplinkIds,
  detail,
  chain,
  routeName,
  edit,
  onFixed,
  installedIds,
  installedLinkIds,
  onSelectEndpoint,
  onGoToPeer,
  onFind,
  onShowOnMap,
  onSide,
  onClose,
  keepBelow,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  equipment: Equipment
  face: Face
  /** Absent for a switch (it has one face). */
  side?: 'front' | 'rear'
  meta: string
  colors: ReadonlyMap<string, string>
  uplinkIds: ReadonlySet<string>
  /** The selected jack's card model, when a jack is selected. */
  detail?: DetailModel
  chain: ChainItem[]
  routeName?: string
  /** Set in a current plan: Connect…, Disconnect…. */
  edit?: PlanEdit
  onFixed: (message: string) => Promise<void>
  installedIds: ReadonlySet<string>
  installedLinkIds: ReadonlySet<string>
  onSelectEndpoint: (endpointId: string) => void
  onGoToPeer: (endpointId: string) => void
  onFind: (endpointId: string) => void
  onShowOnMap: (equipmentId: string) => void
  onSide: (side: 'front' | 'rear') => void
  /** Clears the selected jack (the card's ×, Esc). */
  onClose: () => void
  /** Pixels the face keeps free under itself (the path card's height). */
  keepBelow?: number
}) {
  // In a plan, a click on a free jack also asks where its cable goes.
  const [popover, setPopover] = useState<{
    endpointId: string
    anchor: DOMRect
  }>()
  // Connects to: the far equipment whose jacks are lit; a view state of this
  // equipment only, so a choice made on another one is ignored.
  const [pick, setPick] = useState<{ from: string; far: string }>()
  if (pick && pick.from !== equipment.id) setPick(undefined)
  const far = useMemo(() => connectsTo(index, equipment.id), [index, equipment])
  const selected = detail?.endpointId
  const row = useRef<HTMLDivElement>(null)
  const faceBox = useRef<HTMLDivElement>(null)
  const sideLimit = useSideLimit({
    row,
    face: faceBox,
    keepBelow: keepBelow ?? 0,
  })
  useEffect(() => {
    if (!selected) setPopover(undefined)
  }, [selected])

  const chosen =
    pick?.from === equipment.id
      ? far.find((f) => f.equipmentId === pick.far)
      : undefined
  const faceIds = new Set(faceCellsOf(face).map((c) => c.endpointId))
  const lit = chosen
    ? new Set(chosen.endpointIds.filter((id) => faceIds.has(id)))
    : undefined
  const otherSide =
    chosen && lit && side && lit.size < chosen.endpointIds.length
      ? `${chosen.endpointIds.length - lit.size} on the ${side === 'front' ? 'rear' : 'front'}`
      : undefined
  const proposed =
    snapshot.context === 'planned' && !installedIds.has(equipment.id)
  const close = () => {
    setPopover(undefined)
    onClose()
  }
  return (
    <div
      className="equipment-work"
      data-kind={equipment.kind}
      ref={row}
      style={
        sideLimit === undefined
          ? undefined
          : ({ '--side-limit': `${sideLimit}px` } as CSSProperties)
      }
    >
      <div className="work-face" ref={faceBox}>
        <FaceView
          uplinkIds={uplinkIds}
          lit={lit}
          equipment={equipment}
          face={face}
          side={side}
          meta={meta}
          headless
          fit={{ maxJack: jackMax(face.kind === 'hdf'), keepBelow }}
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
      </div>
      <div className="work-side" data-testid="work-side">
        <ConnectsTo
          far={far}
          chosen={chosen?.equipmentId}
          onChoose={(id) =>
            setPick(id ? { from: equipment.id, far: id } : undefined)
          }
          colors={colors}
          networkNames={index.networkNames}
          hint={otherSide}
        />
        <EndpointDetail
          onClose={close}
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
                proposed={proposed}
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
      {popover && edit && (
        <ConnectPopover
          key={popover.endpointId}
          index={index}
          endpointId={popover.endpointId}
          anchor={popover.anchor}
          onClose={() => setPopover(undefined)}
        />
      )}
    </div>
  )
}
