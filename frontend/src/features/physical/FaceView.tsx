import { layoutPlate } from './faces'
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import type { Equipment, Network } from '../../shared/types'
import { colorOf } from '../map/networkColors'
import {
  blockOnRoute,
  cellLook,
  endpointAria,
  legendNetworks,
  type Face,
} from './equipmentModel'
import { moveFocus, navCells } from './faceNav'
import type { FaceEndpoint } from './faces'

const PER_ROW = 12

/** The port states drawn on a face, in a fixed order, for the legend. */
function faceStates(face: Props['face']) {
  const cells =
    face.kind === 'switch'
      ? face.rows.flat()
      : face.kind === 'panel'
        ? face.face.positions
        : face.face.blocks.flatMap((b) => b.positions)
  const present = new Set(cells.map((c) => c.portState))
  return (['reserved', 'disabled', 'faulty'] as const).filter((s) =>
    present.has(s),
  )
}

/**
 * Extra marks on one jack, for the patching screen: a pair number, a tone
 * (preview, blocked, the next far jack, made in this session) that replaces the
 * fill, and disabled for a jack that cannot be chosen.
 */
export interface JackMark {
  tone?: 'preview' | 'blocked' | 'next' | 'made'
  badge?: number
  disabled?: boolean
  /** Said after the jack's own name, and shown in its tooltip. */
  note?: string
}
const KEYS = new Set([
  'ArrowRight',
  'ArrowLeft',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
])

interface Props {
  equipment: Equipment
  face: Face
  side?: 'front' | 'rear'
  meta: string
  networks: readonly Network[]
  colors: ReadonlyMap<string, string>
  /** The tooltip of one endpoint ("port 3 · cable-a09 → PANEL-A 3 front"). */
  tooltip: (
    cell: FaceEndpoint & { fiberPair?: string },
    ordinal: number | undefined,
  ) => string
  /** A click or Enter on a jack; the event carries Shift for a range. */
  onSelect: (endpointId: string, event?: MouseEvent<HTMLElement>) => void
  onSide: (side: 'front' | 'rear') => void
  /** The "Print sheet" button next to the title. */
  onPrint?: () => void
  /** For a printed sheet: no controls, no tab stop. */
  printing?: boolean
  /** Proposed equipment (only in this plan): the title carries the PROPOSED tag. */
  proposed?: boolean
  /** Plan editing under the title (Delete… and its confirm); absent when not editing. */
  editSlot?: ReactNode
  /** Patching marks per endpoint; absent everywhere else. */
  decorate?: (endpointId: string) => JackMark | undefined
  /** Jacks whose port reaches an AGG or BB (the uplinks summary); marked purple. */
  uplinkIds?: ReadonlySet<string>
  /** False hides the legend (the patching screen has its own). */
  legend?: boolean
}

/**
 * The face of one equipment: a switch's dark faceplate (ports 1,3,5… above
 * 2,4,6…), a panel's strip of jacks, or the HDF grid. Each endpoint is a real
 * button named by its state. Fill follows the state (white free, the circuit
 * network's color when cabled, teal on the route); the ring is the selected one.
 * Other networks' positions are always drawn. The face is one tab stop with a
 * roving focus: arrows move in the visual layout (across HDF blocks), Home and
 * End jump, Enter or Space selects.
 */
export default function FaceView({
  equipment,
  face,
  side,
  meta,
  networks,
  colors,
  tooltip,
  onSelect,
  onSide,
  onPrint,
  printing,
  proposed,
  editSlot,
  decorate,
  uplinkIds,
  legend: showLegend = true,
}: Props) {
  const networkName = (id?: string) => networks.find((n) => n.id === id)?.name
  const cells = navCells(face)
  const container = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<string>()
  const selected = [
    ...(face.kind === 'switch'
      ? face.rows.flat()
      : face.kind === 'panel'
        ? face.face.positions
        : face.face.blocks.flatMap((b) => b.positions)),
  ].find((c) => c.selected)?.endpointId
  // The one tab stop travels with the focus; before any focus, the selected
  // endpoint, else the first.
  const activeId = cells.some((c) => c.id === focusId)
    ? focusId
    : (selected ?? cells[0]?.id)

  const onKeyDown = (event: KeyboardEvent) => {
    if (!KEYS.has(event.key)) return
    const current = (event.target as HTMLElement).getAttribute(
      'data-endpoint-id',
    )
    if (!current) return
    event.preventDefault()
    const next = moveFocus(cells, current, event.key)
    if (!next) return
    setFocusId(next)
    container.current
      ?.querySelector<HTMLElement>(`[data-endpoint-id="${CSS.escape(next)}"]`)
      ?.focus()
  }

  const button = (
    cell: FaceEndpoint & { fiberPair?: string },
    text: string,
    kind: string,
    extra: Record<string, unknown> = {},
    ordinal?: number,
  ) => {
    const look = cellLook(cell)
    const mark = cell.endpointId ? decorate?.(cell.endpointId) : undefined
    const uplink = !!cell.endpointId && !!uplinkIds?.has(cell.endpointId)
    const style =
      look.fill === 'cabled' && !mark?.tone
        ? {
            backgroundColor: colorOf(colors, cell.networkId ?? ''),
            borderColor: 'transparent',
          }
        : undefined
    return (
      <button
        key={cell.endpointId ?? `${text}-${JSON.stringify(extra)}`}
        type="button"
        className={`face-cell ${kind} fill-${look.fill} ${look.selected ? 'is-selected' : ''} ${mark?.tone ? `tone-${mark.tone}` : ''} ${cell.portState ? `port-state-${cell.portState}` : ''}`}
        style={style}
        disabled={!cell.endpointId || !!mark?.disabled}
        tabIndex={cell.endpointId === activeId ? 0 : -1}
        data-testid="face-endpoint"
        data-endpoint-id={cell.endpointId}
        data-state={look.fill}
        data-selected={look.selected}
        data-network={cell.networkId ?? ''}
        data-tone={mark?.tone}
        data-uplink={uplink ? 'true' : undefined}
        aria-description={uplink ? 'reaches an AGG or BB' : undefined}
        data-port-state={cell.portState}
        data-pair={mark?.badge}
        title={[tooltip(cell, ordinal), mark?.note].filter(Boolean).join(' · ')}
        aria-label={[
          endpointAria(
            { name: equipment.name, kind: equipment.kind, side },
            cell,
            networkName(cell.networkId),
            ordinal,
          ),
          cell.portState,
          mark?.note,
        ]
          .filter(Boolean)
          .join(', ')}
        onFocus={() => cell.endpointId && setFocusId(cell.endpointId)}
        onClick={(event) => cell.endpointId && onSelect(cell.endpointId, event)}
        {...extra}
      >
        {cell.portState ? <span className="jack-number">{text}</span> : text}
        {cell.cabled && !mark?.tone && <i className="link-dot" />}
        {mark?.badge !== undefined && (
          <span className="pair-badge" aria-hidden="true">
            {mark.badge}
          </span>
        )}
      </button>
    )
  }

  const chunks = <T,>(list: T[]) => {
    const rows: T[][] = []
    for (let i = 0; i < list.length; i += PER_ROW)
      rows.push(list.slice(i, i + PER_ROW))
    return rows
  }
  const legend = legendNetworks(face, networks)

  return (
    <section className="face-card" aria-label={`${equipment.name} face`}>
      <header className="face-head">
        <div>
          <h2>
            {equipment.name}
            {proposed && (
              <em className="proposed-tag" data-testid="proposed-tag">
                PROPOSED
              </em>
            )}
            {onPrint && !printing && (
              <button className="outline-button print-button" onClick={onPrint}>
                Print sheet
              </button>
            )}
          </h2>
          <p>{meta}</p>
        </div>
        {face.kind !== 'switch' && !printing && (
          <div className="side-switch" role="group" aria-label="Side">
            {(['front', 'rear'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                className={side === s ? 'active' : ''}
                onClick={() => onSide(s)}
              >
                {s === 'front' ? 'Front' : 'Rear'}
              </button>
            ))}
          </div>
        )}
      </header>
      {editSlot}

      <div ref={container} onKeyDown={onKeyDown}>
        {face.kind === 'switch' && (
          <div
            className="faceplate"
            data-kind="switch"
            data-banks={face.banks.length}
          >
            {layoutPlate(face.banks).map((row, r) => (
              <div key={r} className="plate-bank-row" data-testid="bank-row">
                {row.map((unit, u) => (
                  <div
                    key={`${unit.group}-${u}`}
                    className="plate-bank"
                    data-testid="port-bank"
                    data-group={unit.group}
                  >
                    {unit.caption ? (
                      <p className="bank-caption" data-testid="bank-caption">
                        {unit.caption}
                      </p>
                    ) : (
                      face.banks.length > 1 && (
                        <p className="bank-caption" aria-hidden="true">
                          &nbsp;
                        </p>
                      )
                    )}
                    <div className="plate-ports">
                      {unit.cells.map((cell, n) =>
                        button(
                          cell,
                          // Its number in the bank: a 48-port bank's second block shows 25…48.
                          String(unit.start + n + 1),
                          'jack',
                          {
                            'data-row': n % 2,
                            'data-position': unit.start + n + 1,
                          },
                          // A grouped port is named by its label, an old one by its number.
                          unit.group > 0 ? undefined : unit.start + n + 1,
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {face.kind === 'panel' && (
          <div className="faceplate" data-kind="panel">
            <div className="plate-strip">
              {chunks(face.face.positions).map((row) =>
                row.map((cell) =>
                  button(cell, String(cell.position), 'jack', {
                    'data-row': Math.floor((cell.position - 1) / PER_ROW),
                    'data-position': cell.position,
                  }),
                ),
              )}
            </div>
          </div>
        )}

        {face.kind === 'hdf' && (
          <div className="faceplate" data-kind="hdf">
            <div className="hdf-scroll">
              <div className="hdf-grid">
                <span />
                {['A', 'B', 'C', 'D'].map((c) => (
                  <span key={c} className="hdf-col">
                    {c}
                  </span>
                ))}
                {Array.from(
                  { length: face.face.rows },
                  (_, i) => i + 1,
                ).flatMap((row) => [
                  <span key={`row-${row}`} className="hdf-row">
                    {row}
                  </span>,
                  ...face.face.blocks
                    .filter((b) => b.row === row)
                    .map((b) => (
                      <div
                        key={b.label}
                        className="hdf-module"
                        data-testid="face-block"
                        data-block={b.label}
                        data-on-route={blockOnRoute(b)}
                      >
                        <code>{b.label}</code>
                        <div className="hdf-positions">
                          {b.positions.map((p) =>
                            button(p, String(p.position), 'jack hdf-jack', {
                              'data-block': b.label,
                              'data-position': p.position,
                            }),
                          )}
                        </div>
                      </div>
                    )),
                ])}
              </div>
            </div>
          </div>
        )}
      </div>

      {showLegend && (
        <footer className="face-legend" aria-label="Legend">
          <span>
            <i className="fill-free" /> free
          </span>
          {legend.map((id) => (
            <span key={id} data-testid="legend-network" data-network={id}>
              <i
                className="fill-cabled"
                style={{ background: colorOf(colors, id) }}
              />{' '}
              {networkName(id)}
            </span>
          ))}
          {faceStates(face).map((s) => (
            <span key={s} data-testid="legend-state">
              <i className={`port-state-${s}`} /> {s}
            </span>
          ))}
          <span>
            <i className="fill-route" /> on the selected route
          </span>
          {uplinkIds && uplinkIds.size > 0 && (
            <span data-testid="legend-uplink">
              <i className="uplink-mark" /> reaches an AGG or BB
            </span>
          )}
          <span>
            <i className="is-selected" /> selected
          </span>
        </footer>
      )}
    </section>
  )
}
