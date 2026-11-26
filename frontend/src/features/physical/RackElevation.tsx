import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import type { Snapshot } from '../../shared/types'
import { colorOf } from '../map/networkColors'
import { blockDetail, compactUnitPx, labelEvery, unitLabel } from './cabinet'
import { DRAG_TYPE, dropInto, type DropHandlers } from './drops'
import { unitOpener } from '../planning/AddBox'
import type { NewItem } from '../planning/boxModel'
import { compactRack, type ElevationRow, type RackRow } from './elevation'
import { scrollerOf } from './useFaceFit'
import { OPENER } from '../planning/useInlineDialog'
import { elevationSubtitlePieces } from './explorerModel'
import { piecesText } from '../../shared/textPieces'
import Pieces from '../../shared/ui/Pieces'
import Name from '../../shared/ui/Name'
import Chip from '../../shared/ui/Chip'

const NO_NETWORK_EDGE = 'var(--steel-hover)'
/** The compact cabinet's padding above and below its units (`.rack-cabinet.compact`). */
const COMPACT_FRAME_PX = 12
/** The shortest the compact cabinet is ever drawn, whatever the window leaves. */
const COMPACT_MIN_BOX_PX = 160
/** The gap under the cabinet before the hint line. */
const HINT_GAP_PX = 6

interface Props extends DropHandlers {
  snapshot: Snapshot
  rackId: string
  rows: ElevationRow[]
  colors: ReadonlyMap<string, string>
  /** In a plan: free units are drop targets and equipment can be dragged. */
  canEdit: boolean
  /** The slim rack of the rack level (D50): fitted to the room, free runs folded in Installed. */
  compact?: boolean
  /** Compact: pixels kept free under the rack (the path card's height and gap). */
  keepBelow?: number
  /** A library entry picked by a click: the free units are its targets. */
  picked?: NewItem
  /** The units the open add box will take. */
  preview?: ReadonlySet<number>
  /** A click on a unit: shows it beside the rack. */
  onPick?: (equipmentId: string) => void
  /** A double-click on a unit: opens its page. */
  onOpen?: (equipmentId: string) => void
  /** A unit height for the full elevation (a printed sheet); the compact rack fits the room instead. */
  fixedUnitPx?: number
  /** For a printed sheet: no print button. */
  printing?: boolean
  /** The "Print sheet" button in the heading. */
  onPrint?: () => void
}

/**
 * One rack as a steel cabinet with rails, top unit first. Compact (the rack
 * level, D50): 190-250 px wide, the unit height (12-26 px) fitted to the room
 * above the path card, the free runs of three or more folded into one dashed
 * row in Installed, a click picks a unit and a double-click opens it. Not
 * compact (the print sheet): the full elevation at `fixedUnitPx`. Each
 * equipment is one faceplate spanning its units: a switch with port dots, an
 * HDF with a grid texture and its row count, a panel with a row of jacks. Route
 * equipment has a teal border, the selected one a paper ring, proposed equipment
 * is dashed and tagged, other networks' devices are muted. In a plan the same drops
 * as before apply, with the same `rack-slot-<rack>-<unit>` test IDs.
 */
export default function RackElevation({
  snapshot,
  rackId,
  rows,
  colors,
  canEdit,
  compact,
  keepBelow = 0,
  onPick,
  onOpen,
  fixedUnitPx,
  printing,
  onPrint,
  onMoveEquipment,
  onCreateEquipment,
  picked,
  preview,
}: Props) {
  const cabinetBox = useRef<HTMLDivElement>(null)
  const hintBox = useRef<HTMLParagraphElement>(null)
  const [room, setRoom] = useState(600)
  const shown: RackRow[] = useMemo(
    () => (compact ? compactRack(rows, !canEdit) : rows),
    [compact, rows, canEdit],
  )
  // Rows drawn, in units of the grid: a free unit and a run are one, equipment its height.
  const span = (row: RackRow) => (row.kind === 'equipment' ? row.height : 1)
  const total = shown.reduce((n, r) => n + span(r), 0)
  // The room for the cabinet, from its top edge to the bottom of the scrolling
  // page, less what is kept free under it (the path card) and the hint line.
  // Measured in the viewport, never from the page's own height (which grows with the cabinet).
  useLayoutEffect(() => {
    const el = cabinetBox.current
    if (!compact || !el) return
    const scroller = scrollerOf(el)
    function measure() {
      const top =
        el!.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      const hint = hintBox.current
        ? hintBox.current.offsetHeight + HINT_GAP_PX
        : 0
      const bottom = parseFloat(getComputedStyle(scroller).paddingBottom) || 0
      const next = Math.max(
        0,
        Math.floor(
          scroller.clientHeight -
            top -
            bottom -
            keepBelow -
            hint -
            COMPACT_FRAME_PX,
        ),
      )
      setRoom((r) => (r === next ? r : next))
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(scroller)
    window.addEventListener('resize', measure)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [compact, keepBelow, total])
  // The chosen unit stays in view inside a cabinet that scrolls (never the page).
  const selected = rows.find((r) => r.kind === 'equipment' && r.selected)
  const selectedId =
    selected?.kind === 'equipment' ? selected.equipmentId : undefined
  const boxMax = Math.max(COMPACT_MIN_BOX_PX, room + COMPACT_FRAME_PX)
  useLayoutEffect(() => {
    const cab = cabinetBox.current
    if (!compact || !cab || !selectedId) return
    if (cab.scrollHeight <= cab.clientHeight) {
      cab.scrollTop = 0
      return
    }
    const el = cab.querySelector<HTMLElement>(
      `.rack-block[data-equipment-id="${CSS.escape(selectedId)}"]`,
    )
    if (!el) return
    const c = cab.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    if (b.top < c.top) cab.scrollTop += b.top - c.top - COMPACT_FRAME_PX
    else if (b.bottom > c.bottom)
      cab.scrollTop += b.bottom - c.bottom + COMPACT_FRAME_PX
  }, [compact, selectedId, boxMax, total])
  // Per-equipment facts for the faceplates, one pass over the snapshot.
  const facts = useMemo(() => {
    const endpoints = new Map<string, number>()
    for (const p of snapshot.endpoints)
      endpoints.set(p.equipmentId, (endpoints.get(p.equipmentId) ?? 0) + 1)
    const hdfRows = new Map<string, number>()
    for (const s of snapshot.subpanels)
      hdfRows.set(
        s.equipmentId,
        Math.max(hdfRows.get(s.equipmentId) ?? 0, s.row),
      )
    return { endpoints, hdfRows }
  }, [snapshot.endpoints, snapshot.subpanels])

  const rack = snapshot.racks.find((r) => r.id === rackId)
  if (!rack) return null
  const equipment = new Map(snapshot.equipment.map((e) => [e.id, e]))
  const handlers = { onMoveEquipment, onCreateEquipment }
  const gap = 2
  const unitPx = compact ? compactUnitPx(room, total) : (fixedUnitPx ?? 26)
  const every = compact ? 1 : labelEvery(unitPx)
  const slotDrop = (unit: number) => ({
    onDragOver: (event: DragEvent) => {
      if (!canEdit) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDrop: (event: DragEvent) => {
      if (!canEdit) return
      if (
        dropInto(event.dataTransfer.getData(DRAG_TYPE), rackId, unit, handlers)
      )
        event.preventDefault()
    },
  })
  // Where each row starts in the grid (compact: top down by what is drawn; full: by unit).
  let cursor = 1
  const cabinetRows = shown.map((row) => {
    const start = compact
      ? cursor
      : row.kind === 'equipment'
        ? rack.units - row.topUnit + 1
        : row.kind === 'free'
          ? rack.units - row.unit + 1
          : cursor
    cursor += span(row)
    return { row, start }
  })
  const gridRows = compact ? total : rack.units
  const figure = (
    <section className="rack-figure">
      <header className="rack-heading title-row">
        <h2>
          <Name text={rack.name} />
        </h2>
        <span className="meta">{rack.units}U · front elevation</span>
        {!printing && onPrint && (
          <button className="btn print-button" onClick={onPrint}>
            Print sheet
          </button>
        )}
      </header>
      <div
        className={`rack-cabinet ${compact ? 'compact' : ''}`}
        ref={cabinetBox}
        data-unit-px={unitPx}
        style={{
          gridTemplateRows: `repeat(${gridRows}, ${unitPx}px)`,
          ['--unit' as string]: `${unitPx}px`,
          ['--gap' as string]: `${gap}px`,
          ...(compact
            ? {
                ['--rack-max' as string]: `${boxMax}px`,
                ['--rail-h' as string]: `${total * unitPx + (total - 1) * gap}px`,
              }
            : {}),
        }}
      >
        <i className="rail left" aria-hidden />
        <i className="rail right" aria-hidden />
        {!compact &&
          Array.from({ length: rack.units }, (_, i) => rack.units - i).map(
            (unit) => {
              const label = unitLabel(unit, every)
              return label.show ? (
                <span
                  key={unit}
                  className={`unit-label ${label.strong ? 'strong' : ''}`}
                  style={{ gridColumn: 1, gridRow: rack.units - unit + 1 }}
                >
                  U{unit}
                </span>
              ) : null
            },
          )}
        {cabinetRows.map(({ row, start }) => {
          if (row.kind === 'run')
            return (
              <Fragment key={`run-${row.top}`}>
                <div
                  className="rack-slot free run"
                  data-testid={`rack-run-${rackId}-${row.top}-${row.bottom}`}
                  style={{ gridColumn: '1 / span 2', gridRow: start }}
                >
                  {row.top}–{row.bottom} · {row.top - row.bottom + 1}U free
                </div>
              </Fragment>
            )
          if (row.kind === 'free')
            return (
              <Fragment key={`free-${row.unit}`}>
                {compact && (
                  <span
                    className={`unit-label ${row.unit % 5 === 0 ? 'strong' : ''}`}
                    style={{ gridColumn: 1, gridRow: start }}
                  >
                    {row.unit}
                  </span>
                )}
                <div
                  className="rack-slot free"
                  data-testid={`rack-slot-${rackId}-${row.unit}`}
                  data-drop-target={canEdit}
                  data-pick-target={canEdit && !!picked}
                  data-preview={preview?.has(row.unit) ? 'true' : undefined}
                  tabIndex={canEdit ? 0 : undefined}
                  {...(canEdit && { [OPENER]: unitOpener(rackId, row.unit) })}
                  style={{ gridColumn: 2, gridRow: start }}
                  onClick={() => {
                    if (canEdit && picked)
                      onCreateEquipment?.(picked, rackId, row.unit)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canEdit && picked) {
                      event.preventDefault()
                      onCreateEquipment?.(picked, rackId, row.unit)
                    }
                  }}
                  {...slotDrop(row.unit)}
                >
                  {!compact && unitPx >= 18 && 'Available'}
                </div>
              </Fragment>
            )
          const e = equipment.get(row.equipmentId)!
          const blockPx = row.height * unitPx + (row.height - 1) * gap
          const detail = compact
            ? blockPx >= 12
              ? 'name'
              : 'none'
            : blockDetail(blockPx)
          const pieces = elevationSubtitlePieces(e, snapshot.networks)
          const subtitle = piecesText(pieces)
          const ports = facts.endpoints.get(e.id) ?? 0
          return (
            <Fragment key={row.equipmentId}>
              {compact && (
                <span
                  className="unit-label"
                  style={{
                    gridColumn: 1,
                    gridRow: `${start} / span ${row.height}`,
                  }}
                >
                  {row.height > 1 ? `${row.topUnit}–${row.unit}` : row.unit}
                </span>
              )}
              <div
                className="rack-slot occupied"
                data-testid={`rack-slot-${rackId}-${row.unit}`}
                style={{
                  gridColumn: 2,
                  gridRow: `${start} / span ${row.height}`,
                }}
              >
                <button
                  type="button"
                  className="rack-block"
                  data-equipment-id={e.id}
                  data-kind={e.kind}
                  data-unit={row.unit}
                  data-height={row.height}
                  data-selected={row.selected}
                  data-on-route={row.onRoute}
                  data-muted={row.muted}
                  data-proposed={row.proposed}
                  draggable={canEdit}
                  title={`${e.name} · ${subtitle}${row.proposed ? ' · Proposed' : ''}`}
                  style={{
                    ['--stripe' as string]:
                      e.role !== 'passive' && e.networkId
                        ? colorOf(colors, e.networkId)
                        : NO_NETWORK_EDGE,
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, `equipment:${e.id}`)
                    event.dataTransfer.effectAllowed = 'copyMove'
                  }}
                  onClick={() => onPick?.(e.id)}
                  onDoubleClick={() => onOpen?.(e.id)}
                >
                  {detail !== 'none' && (
                    <span className="block-text">
                      <span className="rack-block-name">
                        <span className="tape" title={e.name}>
                          <Name text={e.name} />
                        </span>
                        {row.proposed && detail === 'full' && (
                          <Chip kind="proposed" className="proposed-tag">
                            Proposed
                          </Chip>
                        )}
                      </span>
                      {detail === 'full' && (
                        <small>
                          <Pieces pieces={pieces} />
                        </small>
                      )}
                    </span>
                  )}
                  <Plate
                    kind={e.kind}
                    itemType={e.itemType}
                    count={e.kind === 'hdf' ? 0 : ports}
                    rows={facts.hdfRows.get(e.id) ?? 0}
                  />
                </button>
              </div>
            </Fragment>
          )
        })}
      </div>
    </section>
  )
  if (compact)
    return (
      <div className="rack-column" data-testid="rack-column">
        {figure}
        <p className="rack-hint" data-testid="rack-hint" ref={hintBox}>
          Double-click a unit to open its page.
        </p>
      </div>
    )
  return (
    <div className="rack-level" style={{ paddingBottom: 25 }}>
      {figure}
      <aside className="rack-notes side-note">
        <div className="panel">
          <p>A 3U HDF is one object spanning its three units.</p>
          <p>Teal = equipment on the selected route.</p>
          {canEdit && (
            <p>
              Free units accept drops from the library or another rack of this
              node.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

/** The face of the equipment: port dots, an HDF grid with its rows, or a row of jacks. */
function Plate({
  kind,
  itemType,
  count,
  rows,
}: {
  kind: 'switch' | 'panel' | 'hdf' | 'rack_item'
  itemType?: string
  count: number
  rows: number
}) {
  if (kind === 'rack_item')
    return (
      <span
        className="plate"
        data-plate="rack-item"
        data-item-type={itemType}
        aria-hidden
      />
    )
  if (kind === 'hdf')
    return (
      <span className="plate" data-plate="hdf">
        {rows} rows
      </span>
    )
  return (
    <span
      className="plate"
      data-plate={kind}
      style={{ width: Math.min(count, 24) * 5 }}
      aria-hidden
    />
  )
}
