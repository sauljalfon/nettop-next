import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, useContext } from 'react'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import { OPENER } from '../planning/useInlineDialog'
import { HierarchyActions } from './hierarchyActions'
import type { HierarchyTierNode } from './hierarchyFlow'

/** Handles are points on the card's edges, hidden: lines end on them, and only the canvas connects. */
const SIDES = [
  ['top', Position.Top],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
  ['right', Position.Right],
] as const

export const HierarchyHandles = ({ only }: { only?: 'top' }) => (
  <>
    {SIDES.filter(([id]) => !only || id === only).flatMap(([id, position]) =>
      (['source', 'target'] as const).map((type) => (
        <Handle
          key={`${type}-${id}`}
          id={id}
          type={type}
          position={position}
          className="hierarchy-handle"
          isConnectable={false}
        />
      )),
    )}
  </>
)

const ROLE = { backbone: 'BB', aggregation: 'AGG' } as Record<string, string>

/**
 * A top (BB or Top AGG), a mid AGG, or the "No AGG" card: its name, role and
 * place, and "N uplink to the top" when it reaches fewer tops than there are.
 * The whole card is one button that opens the drawer.
 */
export default memo(function TierCard({ data }: NodeProps<HierarchyTierNode>) {
  const { onCard } = useContext(HierarchyActions)
  const none = data.kind === 'none'
  return (
    <>
      <HierarchyHandles />
      <button
        type="button"
        className={`hcard hcard-tier${none ? ' none' : ''}${data.kind === 'top' ? ' top' : ''}${data.proposed ? ' proposed' : ''}${data.onRoute ? ' on-route' : ''}${data.highlighted ? ' highlighted' : ''}${data.hot ? ' hot' : ''}`}
        data-card-key={data.id}
        data-on-route={data.onRoute}
        data-proposed={data.proposed}
        data-highlighted={data.highlighted}
        data-hot={data.hot}
        {...{ [OPENER]: data.id }}
        onClick={() => onCard(data.id)}
      >
        <span className="hcard-top">
          <strong className="hcard-name">
            {none ? 'No AGG' : <Name text={data.name} />}
          </strong>
          {!none && ROLE[data.role] && (
            <Chip kind="role">{ROLE[data.role]}</Chip>
          )}
        </span>
        {!none && (
          <span className="hcard-place">
            <PlacePath parts={[data.siteName, data.nodeName]} />
          </span>
        )}
        {data.uplinkText && (
          <span className="hcard-warn">{data.uplinkText}</span>
        )}
      </button>
    </>
  )
})
