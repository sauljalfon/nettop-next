import type { Equipment, Network } from '../../shared/types'
import { colorOf } from '../map/networkColors'
import {
  blockOnRoute,
  cellLook,
  endpointAria,
  type Face,
} from './equipmentModel'
import type { FaceEndpoint } from './faces'

const PER_ROW = 12

interface Props {
  equipment: Equipment
  face: Face
  side?: 'front' | 'rear'
  meta: string
  networks: readonly Network[]
  colors: ReadonlyMap<string, string>
  onSelect: (endpointId: string) => void
  onSide: (side: 'front' | 'rear') => void
}

/**
 * The face of one equipment: a port bank, a panel side, or the HDF grid. Each
 * endpoint is a real button named by its state. Fill follows the state (white
 * free, the circuit network's color when cabled, teal on the route); the dark
 * ring is the selected one. Other networks' positions are always drawn.
 */
export default function FaceView({
  equipment,
  face,
  side,
  meta,
  networks,
  colors,
  onSelect,
  onSide,
}: Props) {
  const networkName = (id?: string) => networks.find((n) => n.id === id)?.name

  const button = (
    cell: FaceEndpoint,
    text: string,
    extra: Record<string, unknown> = {},
    size = '',
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
        key={cell.endpointId ?? `${text}-${size}-${JSON.stringify(extra)}`}
        type="button"
        className={`face-cell ${size} fill-${look.fill} ${look.selected ? 'is-selected' : ''}`}
        style={style}
        disabled={!cell.endpointId}
        data-testid="face-endpoint"
        data-endpoint-id={cell.endpointId}
        data-state={look.fill}
        data-selected={look.selected}
        data-network={cell.networkId ?? ''}
        aria-label={endpointAria(
          { name: equipment.name, kind: equipment.kind, side },
          cell,
          networkName(cell.networkId),
          ordinal,
        )}
        onClick={() => cell.endpointId && onSelect(cell.endpointId)}
        {...extra}
      >
        {text}
      </button>
    )
  }

  const chunks = <T,>(cells: T[]) => {
    const rows: T[][] = []
    for (let i = 0; i < cells.length; i += PER_ROW)
      rows.push(cells.slice(i, i + PER_ROW))
    return rows
  }

  return (
    <section className="face-card" aria-label={`${equipment.name} face`}>
      <header className="face-head">
        <div>
          <h2>{equipment.name}</h2>
          <p>{meta}</p>
        </div>
        {face.kind !== 'switch' && (
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

      {face.kind === 'switch' && (
        <div className="face-bank">
          {face.rows.map((row, r) => (
            <div className="bank-row" key={r}>
              {row.map((cell, i) =>
                button(
                  cell,
                  String(r * PER_ROW + i + 1),
                  { 'data-row': r, 'data-position': r * PER_ROW + i + 1 },
                  'sq',
                  r * PER_ROW + i + 1,
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {face.kind === 'panel' && (
        <div className="face-bank">
          {chunks(face.face.positions).map((row, r) => (
            <div className="bank-row" key={r}>
              {row.map((cell) =>
                button(
                  cell,
                  String(cell.position),
                  { 'data-row': r, 'data-position': cell.position },
                  'sq',
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {face.kind === 'hdf' && (
        <div className="hdf-grid">
          <span />
          {['A', 'B', 'C', 'D'].map((c) => (
            <span key={c} className="hdf-col">
              {c}
            </span>
          ))}
          {Array.from({ length: face.face.rows }, (_, i) => i + 1).flatMap(
            (row) => [
              <span key={`row-${row}`} className="hdf-row">
                {row}
              </span>,
              ...face.face.blocks
                .filter((b) => b.row === row)
                .map((b) => (
                  <div
                    key={b.label}
                    className="hdf-block"
                    data-testid="face-block"
                    data-block={b.label}
                    data-on-route={blockOnRoute(b)}
                  >
                    <code>{b.label}</code>
                    <div className="hdf-positions">
                      {b.positions.map((p) =>
                        button(
                          p,
                          String(p.position),
                          {
                            'data-block': b.label,
                            'data-position': p.position,
                            title: `Fiber pair ${p.fiberPair}`,
                          },
                          'sm',
                        ),
                      )}
                    </div>
                  </div>
                )),
            ],
          )}
        </div>
      )}

      <footer className="face-legend" aria-label="Legend">
        <span>
          <i className="fill-free" /> free
        </span>
        <span>
          <i className="fill-cabled" /> cabled (circuit network’s color)
        </span>
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
