import { X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { kindLabel } from '../../shared/equipment'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import { colorOf } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { hdfJackName } from '../physical/faces'
import type { HdfNumbering } from '../physical/hdfNumbering'
import {
  pathLine,
  type PathCable,
  type PathJack,
  type PathPlate,
  type PathStep,
} from './pathLine'
import './pathBar.css'

type Installed = {
  equipment: ReadonlySet<string>
  links: ReadonlySet<string>
}

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
function jackName(
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
  return `${jack.label} ${jack.side}`
}

/**
 * The selected jack's whole path as one line of hardware along the bottom of
 * the equipment page: a steel plate per equipment with the jacks the path
 * uses, a cable between plates in its network's colour, one band per rack.
 * Every plate but the selected one opens that equipment on the jack nearest
 * the selected plate. A path too long for the width scrolls inside the line.
 */
export default function PathBar({
  index,
  endpointId,
  installed,
  colors,
  numbering,
  onOpen,
  onClose,
}: {
  index: SnapshotIndex
  endpointId: string
  /** In a plan: what is installed, so proposed plates and cables are dashed. */
  installed?: Installed
  colors: ReadonlyMap<string, string>
  numbering: HdfNumbering
  /** Opens an equipment's page on that endpoint. */
  onOpen: (endpointId: string) => void
  /** Clears the selection, like Close port. */
  onClose: () => void
}) {
  const { steps, cables } = useMemo(
    () => pathLine(index, endpointId, installed),
    [index, endpointId, installed],
  )
  const line = useRef<HTMLDivElement>(null)
  // The selected plate is always in view when the line scrolls.
  useEffect(() => {
    const el = line.current
    const here = el?.querySelector<HTMLElement>('[data-here="true"]')
    if (!el || !here) return
    const box = el.getBoundingClientRect()
    const at = here.getBoundingClientRect()
    el.scrollLeft += at.left - box.left - (box.width - at.width) / 2
  }, [steps])

  const plates = steps.filter((s): s is PathPlate => s.kind === 'plate')
  const first = plates[0]
  const last = plates.at(-1)
  const hereAt = steps.findIndex((s) => s.kind === 'plate' && s.here)
  const here = steps[hereAt] as PathPlate | undefined
  const hereJack = here?.jacks.find((j) => j.selected)
  const title =
    here && hereJack ? jackName(index, here, hereJack, numbering) : ''
  const rackKey = (p: PathPlate) => p.rackId ?? p.place.join('/')
  const plateAt = (i: number, dir: -1 | 1): PathPlate | undefined => {
    for (let k = i + dir; k >= 0 && k < steps.length; k += dir) {
      const s = steps[k]
      if (s.kind === 'plate') return s
    }
    return undefined
  }
  const cableColor = (s: PathStep | undefined): string | undefined =>
    s?.kind === 'cable'
      ? s.networkId
        ? colorOf(colors, s.networkId)
        : colorOf(colors, '')
      : undefined

  const renderCable = (c: PathCable, i: number) => {
    const a = plateAt(i, -1)
    const b = plateAt(i, 1)
    const band = a && b && rackKey(a) === rackKey(b)
    return (
      <div
        key={`c${i}`}
        className={`pcell link${band ? ' band' : ''}`}
        data-testid="path-cable"
        data-link={c.linkId}
        data-proposed={c.proposed}
        style={{ '--net': cableColor(c) } as CSSProperties}
      >
        <span className="cable-line" />
        <span className="cable-id">
          <Name text={c.linkId} />
        </span>
      </div>
    )
  }

  const renderPlate = (p: PathPlate, i: number) => {
    const prev = plateAt(i, -1)
    const next = plateAt(i, 1)
    const isFirst = !prev || rackKey(prev) !== rackKey(p)
    const isLast = !next || rackKey(next) !== rackKey(p)
    const before = cableColor(steps[i - 1])
    const after = cableColor(steps[i + 1])
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
        p.equipmentKind === 'hdf' && k === 0
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
    const target = open.endpointId
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
      className: `pn${p.proposed ? ' proposed' : ''}${p.here ? ' here' : ''}`,
      'data-testid': 'path-plate',
      'data-equipment-id': p.equipmentId,
      title: p.place.length ? p.place.join(' › ') : undefined,
      'data-here': p.here,
      'data-proposed': p.proposed,
      ...(p.destination ? { 'data-destination': p.destination } : {}),
    }
    return (
      <div
        key={`p${i}`}
        className={`pcell node band${isFirst ? ' first' : ''}${isLast ? ' last' : ''}`}
      >
        <span className="rack">
          {isFirst && <PlacePath parts={p.place.slice(-2)} />}
        </span>
        {p.here ? (
          <div {...common}>{content}</div>
        ) : (
          <button
            type="button"
            {...common}
            aria-label={`Open ${p.name} at ${jackName(index, p, open, numbering)}`}
            onClick={() => onOpen(target)}
          >
            {content}
          </button>
        )}
      </div>
    )
  }

  return (
    <section className="pathbar" aria-label="Path" data-testid="path-bar">
      <div className="pathbar-head">
        <h3>
          Path of <Name text={title} />
        </h3>
        <span className="sub" data-testid="path-summary">
          {cables === 0 ? (
            'No cable on this jack'
          ) : (
            <>
              {cables} {cables === 1 ? 'cable' : 'cables'}
              {first && last && first !== last && (
                <>
                  {' · '}
                  <Name text={first.name} /> → <Name text={last.name} />
                </>
              )}
            </>
          )}
        </span>
        <button
          type="button"
          className="btn quiet path-close"
          aria-label="Close path"
          title="Close path"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="pathline" data-testid="path-line" ref={line}>
        {steps.map((s, i) =>
          s.kind === 'plate' ? (
            renderPlate(s, i)
          ) : s.kind === 'cable' ? (
            renderCable(s, i)
          ) : (
            <div key={`g${i}`} className="pcell stub" data-testid="path-gap">
              <span />
              <span>
                {i === 0 ? 'nothing connected ┄' : '┄ nothing connected'}
              </span>
            </div>
          ),
        )}
      </div>
    </section>
  )
}
