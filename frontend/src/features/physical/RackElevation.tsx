import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Snapshot } from '../../shared/types'
import { colorOf } from '../map/networkColors'
import { visibleArea } from '../map/viewArea'
import { blockDetail, labelEvery, rackMetrics, unitLabel } from './cabinet'
import { DRAG_TYPE, dropInto, type DropHandlers } from './drops'
import type { ElevationRow } from './elevation'
import { elevationSubtitlePieces } from './explorerModel'
import { piecesText } from '../../shared/textPieces'
import Pieces from '../../shared/ui/Pieces'
import Name from '../../shared/ui/Name'
import Chip from '../../shared/ui/Chip'

const NO_NETWORK_EDGE = 'var(--steel-hover)'
/** The cabinet's own padding above and below its units. */
const CABINET_FRAME_PX = 28
/** Air between the cabinet and the panel below it. */
const BOTTOM_GAP_PX = 12

interface Props extends DropHandlers {
  snapshot: Snapshot
  rackId: string
  rows: ElevationRow[]
  colors: ReadonlyMap<string, string>
  /** In a plan: free units are drop targets and equipment can be dragged. */
  canEdit: boolean
  /** Opens the equipment's page. */
  onSelect: (equipmentId: string) => void
  /** A unit height to use instead of fitting the page (a printed sheet). */
  fixedUnitPx?: number
  /** For a printed sheet: no print button. */
  printing?: boolean
  /** The "Print sheet" button in the heading. */
  onPrint?: () => void
}

/**
 * One rack as a steel cabinet with rails, top unit first. The unit height is
 * what fits the page, never below 26 px (D33): a rack that does not fit scrolls
 * and every unit is labeled. Each
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
  onSelect,
  fixedUnitPx,
  printing,
  onPrint,
  onMoveEquipment,
  onCreateEquipment,
}: Props) {
  const level = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState({ space: 600, cover: 0 })
  // The room for the cabinet, measured in the viewport and never from the page's
  // own height (which grows with the cabinet): from the cabinet's top edge down
  // to the top of whatever covers the bottom of the canvas (the results panel,
  // collapsed or expanded), or the canvas's bottom when nothing does. The same
  // covers the map fits around. Measured again when the window, the panel, a
  // drawer or the page above the cabinet changes size or appears.
  useLayoutEffect(() => {
    const el = level.current
    if (!el || fixedUnitPx) return
    const canvas = el.closest<HTMLElement>('.workspace-canvas')
    const observed = new Set<Element>()
    const resize = new ResizeObserver(() => measure())
    function measure() {
      const cabinet = el!.querySelector('.rack-cabinet')
      const area = visibleArea(canvas)
      if (!cabinet || !area) return
      for (const watched of [
        ...document.querySelectorAll('.map-results, .studio-drawer'),
        ...(canvas?.querySelectorAll('.physical-top') ?? []),
      ])
        if (!observed.has(watched)) {
          resize.observe(watched)
          observed.add(watched)
        }
      const bottom = area.box.bottom - area.covers.bottom - BOTTOM_GAP_PX
      const top = cabinet.getBoundingClientRect().top + el!.scrollTop
      const space = Math.max(0, Math.round(bottom - top - CABINET_FRAME_PX))
      const cover = area.covers.bottom
      setRoom((r) =>
        r.space === space && r.cover === cover ? r : { space, cover },
      )
    }
    measure()
    if (canvas) resize.observe(canvas)
    window.addEventListener('resize', measure)
    const watch = new MutationObserver(measure)
    const studio = el.closest('.studio')
    if (studio) watch.observe(studio, { childList: true, subtree: true })
    return () => {
      resize.disconnect()
      watch.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [fixedUnitPx])
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
  const { unitPx, gap } = fixedUnitPx
    ? { unitPx: fixedUnitPx, gap: 2 }
    : rackMetrics(room.space, rack.units)
  const every = labelEvery(unitPx)
  return (
    <div
      className="rack-level"
      ref={level}
      // Only a rack that does not fit (the minimum unit) scrolls, and then it
      // scrolls clear of the panel; a rack that fits adds nothing to the page.
      style={{
        paddingBottom:
          unitPx * rack.units + gap * (rack.units - 1) > room.space
            ? room.cover + 25
            : 25,
      }}
    >
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
          className="rack-cabinet"
          data-unit-px={unitPx}
          style={{
            gridTemplateRows: `repeat(${rack.units}, ${unitPx}px)`,
            ['--unit' as string]: `${unitPx}px`,
            ['--gap' as string]: `${gap}px`,
          }}
        >
          <i className="rail left" aria-hidden />
          <i className="rail right" aria-hidden />
          {Array.from({ length: rack.units }, (_, i) => rack.units - i).map(
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
          {rows.map((row) => {
            if (row.kind === 'free')
              return (
                <div
                  key={`free-${row.unit}`}
                  className="rack-slot free"
                  data-testid={`rack-slot-${rackId}-${row.unit}`}
                  data-drop-target={canEdit}
                  style={{ gridColumn: 2, gridRow: rack.units - row.unit + 1 }}
                  onDragOver={(event) => {
                    if (!canEdit) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                  }}
                  onDrop={(event) => {
                    if (!canEdit) return
                    if (
                      dropInto(
                        event.dataTransfer.getData(DRAG_TYPE),
                        rackId,
                        row.unit,
                        handlers,
                      )
                    )
                      event.preventDefault()
                  }}
                >
                  {unitPx >= 18 && 'Available'}
                </div>
              )
            const e = equipment.get(row.equipmentId)!
            const blockPx = row.height * unitPx + (row.height - 1) * gap
            const detail = blockDetail(blockPx)
            const pieces = elevationSubtitlePieces(e, snapshot.networks)
            const subtitle = piecesText(pieces)
            const ports = facts.endpoints.get(e.id) ?? 0
            return (
              <div
                key={row.equipmentId}
                className="rack-slot occupied"
                data-testid={`rack-slot-${rackId}-${row.unit}`}
                style={{
                  gridColumn: 2,
                  gridRow: `${rack.units - row.topUnit + 1} / span ${row.height}`,
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
                  onClick={() => onSelect(e.id)}
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
                    count={e.kind === 'hdf' ? 0 : ports}
                    rows={facts.hdfRows.get(e.id) ?? 0}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </section>
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
  count,
  rows,
}: {
  kind: 'switch' | 'panel' | 'hdf'
  count: number
  rows: number
}) {
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
