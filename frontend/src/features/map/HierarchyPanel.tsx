import { Panel } from '@xyflow/react'
import Name from '../../shared/ui/Name'
import type { NetworkHierarchy } from './hierarchy'

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** "1 BB · 3 AGG · 1 node · 1 switch"; the BB only when there is one. */
export function summaryText(counts: NetworkHierarchy['counts']): string {
  return [
    counts.bb > 0 ? `${counts.bb} BB` : undefined,
    `${counts.agg} AGG`,
    plural(counts.nodes, 'node'),
    plural(counts.switches, 'switch', 'switches'),
  ]
    .filter(Boolean)
    .join(' · ')
}

const LINE = { width: 34, height: 10 }

function Swatch({
  className,
  dash,
  width = 1.5,
}: {
  className: string
  dash?: string
  width?: number
}) {
  return (
    <svg {...LINE} aria-hidden="true">
      <path
        d={`M0 5H${LINE.width}`}
        className={className}
        strokeWidth={width}
        strokeDasharray={dash}
      />
    </svg>
  )
}

/**
 * The top-left panel of the hierarchy: the network's name and counts, Only
 * nodes with problems, and what the lines mean. It moves right of an open
 * left drawer (CSS).
 */
export default function HierarchyPanel({
  networkName,
  counts,
  onlyProblems,
  onOnlyProblems,
  nothing,
}: {
  networkName: string
  counts?: NetworkHierarchy['counts']
  onlyProblems: boolean
  onOnlyProblems: (on: boolean) => void
  /** Only problems is on and nothing is left to draw. */
  nothing?: boolean
}) {
  return (
    <Panel position="top-left" className="hierarchy-panel">
      <h2>
        <Name text={networkName} />
      </h2>
      {counts && <p className="hierarchy-meta">{summaryText(counts)}</p>}
      <label className="hierarchy-toggle">
        <input
          type="checkbox"
          checked={onlyProblems}
          onChange={(e) => onOnlyProblems(e.target.checked)}
        />
        Only nodes with problems
      </label>
      {nothing && <p className="hierarchy-meta">No problems here</p>}
      <div className="hierarchy-legend">
        <div className="hierarchy-legend-row">
          <Swatch className="legend-uplink" />a top to the AGGs of a frame, and
          a frame to its nodes, from real cables through any panels
        </div>
        <div className="hierarchy-legend-row">
          <Swatch className="legend-peer" width={3} />
          the two AGGs of a frame are peers
        </div>
        <div className="hierarchy-legend-row">
          <Swatch className="legend-proposed" dash="6 4" width={2} />
          proposed in this plan
        </div>
        <div className="hierarchy-legend-row">
          <span className="hcard-warn">no BB</span>
          an AGG with no cable to a BB
        </div>
        <div className="hierarchy-legend-row">
          <span className="hcard-badge">2↑ 1</span>
          switches with two uplinks
        </div>
      </div>
    </Panel>
  )
}
