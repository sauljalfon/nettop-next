import { useEffect, useRef } from 'react'
import type { TrailStep } from './trail'
import Name from '../../shared/ui/Name'

/**
 * A slim one-line bar under the breadcrumbs while a route is selected: one chip
 * per step, the current one in teal, "step N of M", and Prev / Next. A chip,
 * Prev or Next opens that step's endpoint; long routes scroll sideways.
 */
export default function RouteTrail({
  title,
  steps,
  current,
  onOpen,
}: {
  title: string
  steps: readonly TrailStep[]
  current: number | undefined
  onOpen: (step: TrailStep) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (current === undefined) return
    scroller.current
      ?.querySelector<HTMLElement>('[data-current="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [current])
  const prev = current === undefined ? undefined : steps[current - 1]
  const next = current === undefined ? steps[0] : steps[current + 1]
  return (
    <nav
      className="route-trail"
      aria-label="Route trail"
      data-testid="route-trail"
    >
      <span className="trail-title">{title}</span>
      <div className="trail-steps" ref={scroller}>
        {steps.map((step, i) => (
          <button
            key={`${i}:${step.openEndpointId}`}
            className="trail-step"
            data-testid="trail-step"
            data-current={current === i}
            aria-current={current === i ? 'step' : undefined}
            onClick={() => onOpen(step)}
          >
            <Name text={step.label} />
          </button>
        ))}
      </div>
      <span className="trail-count">
        {current === undefined
          ? `${steps.length} steps`
          : `step ${current + 1} of ${steps.length}`}
      </span>
      <button
        className="trail-nav"
        disabled={!prev}
        onClick={() => prev && onOpen(prev)}
      >
        ‹ Prev
      </button>
      <button
        className="trail-nav"
        disabled={!next}
        onClick={() => next && onOpen(next)}
      >
        Next ›
      </button>
    </nav>
  )
}
