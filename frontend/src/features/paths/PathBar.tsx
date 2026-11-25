import { X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import Name from '../../shared/ui/Name'
import NetworkBadge from '../map/NetworkBadge'
import { colorOf } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { HdfNumbering } from '../physical/hdfNumbering'
import { pathLine, type PathPlate } from './pathLine'
import { PathStepCell, jackName, type PathEnv } from './PathPlates'
import './pathBar.css'

type Installed = {
  equipment: ReadonlySet<string>
  links: ReadonlySet<string>
}

/**
 * The path card (D50): under the face and the side column, the selected jack's
 * whole path as one line of hardware: a steel plate per equipment with the
 * jacks the path uses, a cable between plates in its network's colour with a
 * connector at each end, one band per rack, the end ringed when it is an AGG
 * or BB. Plates and jacks scale with the card's width. Every plate but the
 * selected one opens that equipment on the jack nearest the selected plate. A
 * path too long for the card scrolls sideways inside it. Without a selected
 * jack, or with a free one, it is one line asking for a cabled jack.
 */
export default function PathBar({
  index,
  endpointId,
  installed,
  colors,
  numbering,
  onOpen,
  onClose,
  onFullPage,
}: {
  index: SnapshotIndex
  /** The selected jack; absent: the card is one line asking for one. */
  endpointId?: string
  /** In a plan: what is installed, so proposed plates and cables are dashed. */
  installed?: Installed
  colors: ReadonlyMap<string, string>
  numbering: HdfNumbering
  /** Opens an equipment's page on that endpoint. */
  onOpen: (endpointId: string) => void
  /** Clears the selection, like Close port. */
  onClose: () => void
  /** Open the Trace page (cabled jacks only): traces from this jack and opens the page. */
  onFullPage?: (endpointId: string) => void
}) {
  const { steps, cables } = useMemo(
    () =>
      endpointId
        ? pathLine(index, endpointId, installed)
        : { steps: [], cables: 0 },
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
  const env: PathEnv = { index, steps, colors, numbering, onOpen, reach: true }
  const networkId = steps.find(
    (s): s is Extract<typeof s, { kind: 'cable' }> =>
      s.kind === 'cable' && !!s.networkId,
  )?.networkId
  if (!endpointId || cables === 0)
    return (
      <section
        className="pathbar empty"
        aria-label="Path"
        data-testid="path-bar"
      >
        <b>Path</b>
        <span className="sub">
          Select a cabled jack on the face to draw its path to the AGG or BB.
        </span>
      </section>
    )
  return (
    <section className="pathbar" aria-label="Path" data-testid="path-bar">
      <div className="pathbar-head">
        <h3>
          Path of <Name text={title} />
        </h3>
        {networkId && (
          <NetworkBadge
            name={index.networkNames.get(networkId) ?? networkId}
            color={colorOf(colors, networkId)}
          />
        )}
        <span className="sub" data-testid="path-summary">
          {cables} {cables === 1 ? 'cable' : 'cables'} · {plates.length}{' '}
          {plates.length === 1 ? 'place' : 'places'}
          {first && last && first !== last && (
            <>
              {' · '}
              <Name text={first.name} /> → <Name text={last.name} />
            </>
          )}
        </span>
        {onFullPage && (
          <button
            type="button"
            className="btn quiet path-full"
            title="Trace this jack on its own page"
            onClick={() => onFullPage(endpointId)}
          >
            Open the Trace page
          </button>
        )}
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
        {steps.map((_, i) => (
          <PathStepCell key={i} env={env} i={i} />
        ))}
      </div>
    </section>
  )
}
