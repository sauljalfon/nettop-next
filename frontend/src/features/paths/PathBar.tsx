import { X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import Name from '../../shared/ui/Name'
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
  onFullPage,
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
  /** Full page ⤢ (cabled jacks only): traces from this jack and opens the Trace page. */
  onFullPage?: (endpointId: string) => void
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
  const env: PathEnv = { index, steps, colors, numbering, onOpen }
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
        {cables > 0 && onFullPage && (
          <button
            type="button"
            className="btn quiet path-full"
            title="Trace this jack on its own page"
            onClick={() => onFullPage(endpointId)}
          >
            Full page ⤢
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
