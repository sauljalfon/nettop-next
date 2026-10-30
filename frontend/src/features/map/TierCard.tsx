import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, useContext } from 'react'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import { OPENER } from '../planning/useInlineDialog'
import { HierarchyActions } from './hierarchyActions'
import { emphasisMarks, type HierarchyTierNode } from './hierarchyFlow'

/**
 * A point on a card's left or right edge, hidden: lines end on it, and only the
 * canvas connects. `top` puts it on the first row of a card that may grow.
 */
export const HierarchyHandle = ({
  side,
  top,
}: {
  side: 'left' | 'right'
  top?: number
}) => (
  <Handle
    id={side}
    type={side === 'left' ? 'target' : 'source'}
    position={side === 'left' ? Position.Left : Position.Right}
    className="hierarchy-handle"
    style={top === undefined ? undefined : { top }}
    isConnectable={false}
  />
)

const ROLE = { backbone: 'BB', aggregation: 'AGG' } as Record<string, string>

/**
 * A top (a BB, or the Top AGG): its name and role on one row, the place as its
 * title. The whole card is one button that opens the drawer.
 */
export default memo(function TierCard({ data }: NodeProps<HierarchyTierNode>) {
  const { onEquipment } = useContext(HierarchyActions)
  const place = [data.siteName, data.nodeName].filter(Boolean).join(' / ')
  return (
    <>
      <HierarchyHandle side="right" />
      <button
        type="button"
        className={`hcard hcard-tier top${data.proposed ? ' proposed' : ''}${data.onRoute ? ' on-route' : ''}${data.highlighted ? ' highlighted' : ''}${data.hot ? ' hot' : ''}`}
        data-card-key={data.id}
        data-on-route={data.onRoute}
        data-proposed={data.proposed}
        data-highlighted={data.highlighted}
        data-hot={data.hot}
        {...emphasisMarks(data.emphasis, data.selected)}
        title={place || undefined}
        {...{ [OPENER]: data.id }}
        onClick={() => onEquipment(data.id)}
      >
        <strong className="hcard-name">
          <Name text={data.name} />
        </strong>
        {ROLE[data.role] && <Chip kind="role">{ROLE[data.role]}</Chip>}
      </button>
    </>
  )
})
