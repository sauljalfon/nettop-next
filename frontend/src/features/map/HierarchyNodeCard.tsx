import type { NodeProps } from '@xyflow/react'
import { memo, useContext } from 'react'
import Name from '../../shared/ui/Name'
import { OPENER } from '../planning/useInlineDialog'
import { HierarchyActions } from './hierarchyActions'
import type { HierarchyNodeNode } from './hierarchyFlow'

/**
 * A node under a group of AGGs: its site, its name, how many switches it holds
 * the "2↑ N" badge for switches with two uplinks, and only what is wrong ("2 chained"). Lines end on the frame, so
 * the card has no handles. The whole card is one button that opens the drawer.
 */
export default memo(function HierarchyNodeCard({
  data,
}: NodeProps<HierarchyNodeNode>) {
  const { onCard } = useContext(HierarchyActions)
  return (
    <button
      type="button"
      className={`hcard hcard-node${data.proposed ? ' proposed' : ''}${data.onRoute ? ' on-route' : ''}${data.highlighted ? ' highlighted' : ''}${data.hot ? ' hot' : ''}`}
      data-card-key={data.key}
      data-on-route={data.onRoute}
      data-proposed={data.proposed}
      data-highlighted={data.highlighted}
      data-hot={data.hot}
      {...{ [OPENER]: data.key }}
      onClick={() => onCard(data.key)}
    >
      <span className="hcard-place">
        {data.siteName ? <Name text={data.siteName} /> : null}
      </span>
      <strong className="hcard-name">
        {data.noNode ? 'Not in a node' : <Name text={data.name} />}
      </strong>
      <span className="hcard-count">
        <span>
          {data.switches} {data.switches === 1 ? 'switch' : 'switches'}
        </span>
        {data.twoUplinks > 0 && (
          <span
            className="hcard-badge"
            title={`${data.twoUplinks} ${data.twoUplinks === 1 ? 'switch' : 'switches'} with 2 uplinks`}
          >
            2↑ {data.twoUplinks}
          </span>
        )}
        {data.chained > 0 && (
          <span className="hcard-flag">{data.chained} chained</span>
        )}
      </span>
    </button>
  )
})
