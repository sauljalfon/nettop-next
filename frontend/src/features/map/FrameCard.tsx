import type { NodeProps } from '@xyflow/react'
import { memo, useContext } from 'react'
import Name from '../../shared/ui/Name'
import { OPENER } from '../planning/useInlineDialog'
import { HierarchyActions } from './hierarchyActions'
import { emphasisMarks, type HierarchyFrameNode } from './hierarchyFlow'
import { HierarchyHandle } from './TierCard'

/**
 * A group's frame, one row: one or two AGGs as buttons (a pair has the peer
 * mark between them), or "Direct to BB" / "No AGG". An AGG with no cable to a
 * top says "no BB". Clicking an AGG opens its drawer.
 */
export default memo(function FrameCard({
  data,
}: NodeProps<HierarchyFrameNode>) {
  const { onEquipment } = useContext(HierarchyActions)
  const plain = data.kind !== 'aggs'
  return (
    <>
      <HierarchyHandle side="left" />
      <HierarchyHandle side="right" />
      <div
        className={`hframe${plain ? ' plain' : ''}`}
        data-frame-key={data.groupKey}
        data-frame-kind={data.kind}
        {...emphasisMarks(data.emphasis)}
      >
        {data.kind === 'top' && (
          <span>
            {data.topKind === 'backbone' ? 'Direct to BB' : 'Direct to Top AGG'}
          </span>
        )}
        {data.kind === 'none' && <span>No AGG</span>}
        {data.aggs.map((a, i) => (
          <span key={a.id} className="hframe-item">
            {i > 0 && <span className="hframe-peer" title="Peer link" />}
            <button
              type="button"
              className={`hframe-agg${a.proposed ? ' proposed' : ''}${a.onRoute ? ' on-route' : ''}${a.highlighted ? ' highlighted' : ''}${a.hot ? ' hot' : ''}`}
              data-card-key={a.id}
              data-on-route={a.onRoute}
              data-proposed={a.proposed}
              data-highlighted={a.highlighted}
              data-hot={a.hot}
              {...emphasisMarks(a.emphasis, a.selected)}
              title={
                a.title ??
                ([a.siteName, a.nodeName].filter(Boolean).join(' / ') ||
                  undefined)
              }
              {...{ [OPENER]: a.id }}
              onClick={() => onEquipment(a.id)}
            >
              <span className="hframe-name">
                <Name text={a.name} />
              </span>
              {a.noTop && <span className="hcard-warn">no BB</span>}
            </button>
          </span>
        ))}
      </div>
    </>
  )
})
