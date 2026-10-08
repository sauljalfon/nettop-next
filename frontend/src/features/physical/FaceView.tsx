import { useRef, useState, type KeyboardEvent } from 'react'
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
  onSelect: (endpointId: string) => void
  onSide: (side: 'front' | 'rear') => void
  /** The "Print sheet" button next to the title. */
  onPrint?: () => void
  /** For a printed sheet: no controls, no tab stop. */
  printing?: boolean
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
    const style =
      look.fill === 'cabled'
        ? {
            background: colorOf(colors, cell.networkId ?? ''),
            borderColor: 'transparent',
          }
        : undefined
    return (
      <button
        key={cell.endpointId ?? `${text}-${JSON.stringify(extra)}`}
        type="button"
        className={`face-cell ${kind} fill-${look.fill} ${look.selected ? 'is-selected' : ''}`}
        style={style}
        disabled={!cell.endpointId}
        tabIndex={cell.endpointId === activeId ? 0 : -1}
        data-testid="face-endpoint"
        data-endpoint-id={cell.endpointId}
        data-state={look.fill}
        data-selected={look.selected}
        data-network={cell.networkId ?? ''}
        title={tooltip(cell, ordinal)}
        aria-label={endpointAria(
          { name: equipment.name, kind: equipment.kind, side },
          cell,
          networkName(cell.networkId),
          ordinal,
        )}
        onFocus={() => cell.endpointId && setFocusId(cell.endpointId)}
        onClick={() => cell.endpointId && onSelect(cell.endpointId)}
        {...extra}
      >
        {text}
        {cell.cabled && <i className="link-dot" />}
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

      <div ref={container} onKeyDown={onKeyDown}>
        {face.kind === 'switch' && (
          <div className="faceplate" data-kind="switch">
            <div className="plate-ports">
              {face.rows
                .flat()
                .map((cell, n) =>
                  button(
                    cell,
                    String(n + 1),
                    'jack',
                    { 'data-row': n % 2, 'data-position': n + 1 },
                    n + 1,
                  ),
                )}
            </div>
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
        <span>
          <i className="fill-route" /> on the selected route
        </span>
        <span>
          <i className="is-selected" /> selected
        </span>
      </footer>
    </section>
  )
}
