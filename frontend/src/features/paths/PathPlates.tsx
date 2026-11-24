import { Fragment, type CSSProperties } from 'react'
import { kindLabel } from '../../shared/equipment'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import { colorOf } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { hdfJackName, panelJackName } from '../physical/faces'
import type { HdfNumbering } from '../physical/hdfNumbering'
import type { PathJack, PathPlate, PathStep } from './pathLine'
import './pathBar.css'

/** The jack's square: a position, or a switch port's number. */
function squareText(index: SnapshotIndex, jack: PathJack): string {
  const p = index.lookup.endpoints.get(jack.endpointId)
  if (p?.position !== undefined) return String(p.position)
  return /(\d+)\D*$/.exec(jack.label)?.[1] ?? jack.label
}

/**
 * The jack's name: an HDF position by its pairs or fibers (the naming patching
 * uses) and its side, a panel position and its side, a switch port as stored.
 */
export function jackName(
  index: SnapshotIndex,
  plate: Pick<PathPlate, 'equipmentKind'>,
  jack: PathJack,
  numbering: HdfNumbering,
): string {
  const p = index.lookup.endpoints.get(jack.endpointId)
  if (!p || !jack.side) return jack.label
  if (plate.equipmentKind === 'hdf' && p.position !== undefined) {
    const sub = index.lookup.subpanels.get(p.subpanelId ?? '')
    if (sub)
      return `${hdfJackName(`${sub.row}${sub.column}`, p.position, numbering)} ${jack.side}`
  }
  if (
    plate.equipmentKind === 'panel' &&
    p.position !== undefined &&
    numbering === 'pigtails'
  )
    return `${panelJackName(p.position, numbering)} ${jack.side}`
  return `${jack.label} ${jack.side}`
}

/** What one cell needs to be drawn: the whole line (neighbours colour a jack and band a rack). */
export interface PathEnv {
  index: SnapshotIndex
  /** The whole line the cell belongs to, in order. */
  steps: PathStep[]
  colors: ReadonlyMap<string, string>
  numbering: HdfNumbering
  /** Opens an equipment's page on that endpoint; absent: plates are not buttons. */
  onOpen?: (endpointId: string) => void
  /** Equipment ids every route passes (All routes): outlined in amber. */
  shared?: ReadonlySet<string>
  /** Inside a node's frame the label is the rack only: the frame names the place. */
  framed?: boolean
}

const rackKey = (p: PathPlate) => p.rackId ?? p.place.join('/')

function plateAt(
  steps: PathStep[],
  i: number,
  dir: -1 | 1,
): PathPlate | undefined {
  for (let k = i + dir; k >= 0 && k < steps.length; k += dir) {
    const s = steps[k]
    if (s.kind === 'plate') return s
  }
  return undefined
}

function cableColor(
  colors: ReadonlyMap<string, string>,
  s: PathStep | undefined,
): string | undefined {
  return s?.kind === 'cable' ? colorOf(colors, s.networkId ?? '') : undefined
}

/**
 * One step of a path as hardware: a steel plate (jacks, label strip, the rack
 * above it, plates of one rack on one band), a cable in its network's colour
 * with its ID, or the "nothing connected" stub. The path bar and the Trace page
 * draw every step through this one component (D45, D46).
 */
export function PathStepCell({ env, i }: { env: PathEnv; i: number }) {
  const { index, steps, colors, numbering } = env
  const s = steps[i]
  if (s.kind === 'gap')
    return (
      <div className="pcell stub" data-testid="path-gap">
        <span />
        <span>{i === 0 ? 'nothing connected ┄' : '┄ nothing connected'}</span>
      </div>
    )
  if (s.kind === 'cable') {
    const a = plateAt(steps, i, -1)
    const b = plateAt(steps, i, 1)
    const band = a && b && rackKey(a) === rackKey(b)
    return (
      <div
        className={`pcell link${band ? ' band' : ''}`}
        data-testid="path-cable"
        data-link={s.linkId}
        data-proposed={s.proposed}
        style={{ '--net': cableColor(colors, s) } as CSSProperties}
      >
        <span className="cable-line" />
        <span className="cable-id">
          <Name text={s.linkId} />
        </span>
      </div>
    )
  }

  const p = s
  const hereAt = steps.findIndex((x) => x.kind === 'plate' && x.here)
  const prev = plateAt(steps, i, -1)
  const next = plateAt(steps, i, 1)
  const isFirst = !prev || rackKey(prev) !== rackKey(p)
  const isLast = !next || rackKey(next) !== rackKey(p)
  const before = cableColor(colors, steps[i - 1])
  const after = cableColor(colors, steps[i + 1])
  const one = p.jacks.length === 1
  const atStart = i === 0 || steps[i - 1]?.kind === 'gap'
  // A jack takes the colour of the cable on its side; with none it stays white.
  const colorOfJack = (k: number) =>
    one ? (atStart ? after : before) : k === 0 ? before : after
  const jack = (j: PathJack, k: number) => {
    const color = colorOfJack(k)
    return (
      <span
        key={j.endpointId}
        className={`pj${color ? ' lit' : ''}${j.selected ? ' sel' : ''}`}
        style={color ? ({ '--net': color } as CSSProperties) : undefined}
      >
        {squareText(index, j)}
      </span>
    )
  }
  const caps = p.jacks.map((j, k) => {
    const text =
      k === 0 &&
      (p.equipmentKind === 'hdf' ||
        (p.equipmentKind === 'panel' && numbering === 'pigtails'))
        ? jackName(index, p, j, numbering)
        : (j.side ?? j.label)
    return (
      <span key={j.endpointId}>
        <Name text={text} />
      </span>
    )
  })
  // The jack nearest the selected plate: the first when this plate is to its right.
  const open = i > hereAt ? p.jacks[0] : (p.jacks.at(-1) ?? p.jacks[0])
  const isShared = !!env.shared?.has(p.equipmentId)
  const content = (
    <>
      <span className="pn-top">
        <span className="tape">
          <Name text={p.name} />
        </span>
        {p.destination ? (
          <span className="kind top">
            {p.destination === 'aggregation' ? 'AGG' : 'BB'}
          </span>
        ) : (
          <span className="kind">{kindLabel({ kind: p.equipmentKind })}</span>
        )}
      </span>
      <span className="pn-jacks">
        {one && atStart && <span className="gap" />}
        {p.jacks.map((j, k) => (
          <Fragment key={j.endpointId}>
            {k > 0 && <span className="bridge" />}
            {jack(j, k)}
          </Fragment>
        ))}
        {one && !atStart && <span className="gap" />}
      </span>
      <span className={`pn-caps${one ? ' one' : ''}`}>
        {one && !atStart && caps}
        {one && atStart && (
          <>
            <span />
            {caps}
          </>
        )}
        {!one && caps}
        {one && !atStart && <span />}
      </span>
    </>
  )
  const common = {
    className: `pn${p.proposed ? ' proposed' : ''}${p.here ? ' here' : ''}${isShared ? ' shared' : ''}`,
    'data-testid': 'path-plate',
    'data-equipment-id': p.equipmentId,
    title: p.place.length
      ? `${p.place.join(' › ')}${isShared ? ' · every route passes here' : ''}`
      : isShared
        ? 'every route passes here'
        : undefined,
    'data-here': p.here,
    'data-proposed': p.proposed,
    ...(isShared ? { 'data-shared': true } : {}),
    ...(p.destination ? { 'data-destination': p.destination } : {}),
  }
  return (
    <div
      className={`pcell node band${isFirst ? ' first' : ''}${isLast ? ' last' : ''}`}
    >
      <span className="rack">
        {isFirst && (
          <PlacePath
            parts={env.framed ? p.place.slice(-1) : p.place.slice(-2)}
          />
        )}
      </span>
      {p.here || !env.onOpen ? (
        <div {...common}>{content}</div>
      ) : (
        <button
          type="button"
          {...common}
          aria-label={`Open ${p.name} at ${jackName(index, p, open, numbering)}`}
          onClick={() => env.onOpen?.(open.endpointId)}
        >
          {content}
        </button>
      )}
    </div>
  )
}
