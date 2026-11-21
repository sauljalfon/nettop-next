import { useMemo, type ReactNode } from 'react'
import PlacePath from '../../shared/ui/PlacePath'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { HdfNumbering } from '../physical/hdfNumbering'
import type { PathStep } from '../paths/pathLine'
import { PathStepCell, type PathEnv } from '../paths/PathPlates'
import { isFrame, nodeFrames } from './model'

/** One route as a line of plates; `head` (All routes) is the label above it. */
export interface DrawnLine {
  key: string
  steps: PathStep[]
  head?: ReactNode
  /** The route the page is on (All routes outlines it). */
  current?: boolean
}

/**
 * A route as hardware, like the jack's path (D45), with each node's plates in a
 * dashed frame named Site › Node, so it shows where the route leaves a
 * building; a cable between two nodes stands between the frames. The frames
 * are a drawing aid, made from the same stored steps. One line, or (with
 * `head`) one section per route for All routes.
 */
export default function TraceDrawing({
  index,
  lines,
  colors,
  numbering,
  shared,
  onOpen,
}: {
  index: SnapshotIndex
  lines: DrawnLine[]
  colors: ReadonlyMap<string, string>
  numbering: HdfNumbering
  /** Equipment every route passes: outlined in amber (All routes). */
  shared?: ReadonlySet<string>
  /** Opens an equipment on that endpoint. */
  onOpen?: (endpointId: string) => void
}) {
  return (
    <>
      {lines.map((line) =>
        line.head === undefined ? (
          <Line
            key={line.key}
            index={index}
            steps={line.steps}
            colors={colors}
            numbering={numbering}
            shared={shared}
            onOpen={onOpen}
          />
        ) : (
          <section
            key={line.key}
            className="tp-pic-route"
            data-testid="trace-route"
            aria-current={line.current ? 'true' : undefined}
          >
            <div className="lbl">{line.head}</div>
            <Line
              index={index}
              steps={line.steps}
              colors={colors}
              numbering={numbering}
              shared={shared}
              onOpen={onOpen}
            />
          </section>
        ),
      )}
    </>
  )
}

function Line({
  index,
  steps,
  colors,
  numbering,
  shared,
  onOpen,
}: {
  index: SnapshotIndex
  steps: PathStep[]
  colors: ReadonlyMap<string, string>
  numbering: HdfNumbering
  shared?: ReadonlySet<string>
  onOpen?: (endpointId: string) => void
}) {
  const env: PathEnv = {
    index,
    steps,
    colors,
    numbering,
    onOpen,
    shared,
    framed: true,
  }
  const parts = useMemo(() => nodeFrames(index, steps), [index, steps])
  const at = useMemo(() => new Map(steps.map((s, i) => [s, i])), [steps])
  return (
    <div className="pathline framed trace-line">
      {parts.map((part, k) =>
        isFrame(part) ? (
          <div className="nframe" data-testid="trace-frame" key={`f${k}`}>
            <span className="nlabel">
              <PlacePath parts={part.place} />
            </span>
            <div className="nrow">
              {part.steps.map((s) => (
                <PathStepCell key={at.get(s)} env={env} i={at.get(s)!} />
              ))}
            </div>
          </div>
        ) : (
          <PathStepCell key={at.get(part)} env={env} i={at.get(part)!} />
        ),
      )}
    </div>
  )
}
