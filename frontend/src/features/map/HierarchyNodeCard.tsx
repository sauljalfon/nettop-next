import type { NodeProps } from '@xyflow/react'
import { memo, useContext, type ReactNode } from 'react'
import Name from '../../shared/ui/Name'
import { OPENER } from '../planning/useInlineDialog'
import { HierarchyActions } from './hierarchyActions'
import {
  emphasisMarks,
  type HierarchyNodeData,
  type HierarchyNodeNode,
} from './hierarchyFlow'
import { HierarchyHandle } from './TierCard'

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** The end of a card's row: the fault count, the 2↑ badge and the switch count. */
function End({ data }: { data: HierarchyNodeData }) {
  return (
    <span className="hcard-end">
      {data.faults > 0 && (
        <span
          className="hcard-warn"
          title={`${plural(data.faults, 'switch', 'switches')} with a problem`}
        >
          {data.faults}
        </span>
      )}
      {data.twoUplinks > 0 && (
        <span
          className="hcard-badge"
          title={`${plural(data.twoUplinks, 'switch', 'switches')} with 2 uplinks`}
        >
          2↑ {data.twoUplinks}
        </span>
      )}
      <span className="hcard-n">{data.switches}</span>
    </span>
  )
}

/** "+ 2 on another AGG · 3 on <Network B>": the names stay apart. */
function Elsewhere({ parts }: { parts: HierarchyNodeData['elsewhere'] }) {
  const out: ReactNode[] = []
  parts.forEach((p, i) => {
    out.push(
      <span key={i}>
        {i > 0 ? ' · ' : '+ '}
        {p.count} on {p.own ? 'another AGG' : <Name text={p.networkName} />}
      </span>,
    )
  })
  return <div className="hcard-rest">{out}</div>
}

/**
 * A node under a frame. Closed it is one row: the name (the site is its title),
 * the fault count, "2↑ N" and the switch count; a click opens it in place and
 * opens the drawer. Open it lists its switches, one row each, and one quiet line
 * for the node's switches that are not on this card; its head closes it.
 */
export default memo(function HierarchyNodeCard({
  data,
}: NodeProps<HierarchyNodeNode>) {
  const { onCard, onEquipment, onClose } = useContext(HierarchyActions)
  const state = `${data.proposed ? ' proposed' : ''}${data.onRoute ? ' on-route' : ''}${data.highlighted ? ' highlighted' : ''}${data.hot ? ' hot' : ''}`
  const name = data.noNode ? 'Not in a node' : <Name text={data.name} />
  const marks = {
    'data-card-key': data.key,
    'data-open': data.open,
    'data-on-route': data.onRoute,
    'data-proposed': data.proposed,
    'data-highlighted': data.highlighted,
    'data-hot': data.hot,
    ...emphasisMarks(data.emphasis, data.selected),
  }
  return (
    <>
      <HierarchyHandle side="left" top={11} />
      {data.open ? (
        // The head closes the card; a click anywhere else on it opens the drawer.
        <div
          className={`hcard hcard-node open${state}`}
          {...marks}
          onClick={() => onCard(data.key)}
        >
          <div className="hcard-row">
            <button
              type="button"
              className="hcard-close"
              {...{ [OPENER]: data.key }}
              onClick={(e) => {
                e.stopPropagation()
                onClose(data.key)
              }}
            >
              <span className="hcard-name" title={data.siteName || undefined}>
                {name}
              </span>{' '}
              <span title="Close">▴</span>
            </button>
            <End data={data} />
          </div>
          <div className="hcard-list">
            {data.rows.map((r) => (
              <div
                key={r.id}
                className="hcard-switch"
                data-card-switch={r.id}
                {...emphasisMarks(r.emphasis, r.selected)}
              >
                <button
                  type="button"
                  className="hcard-switch-name"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEquipment(r.id)
                  }}
                >
                  <Name text={r.name} />
                </button>
                {r.cutOff ? (
                  <span className="hcard-warn" data-cut-off>
                    cut off
                  </span>
                ) : r.mark ? (
                  <span className="hcard-warn">{r.mark}</span>
                ) : r.twoUplinks ? (
                  <span className="hcard-badge">2 uplinks</span>
                ) : null}
              </div>
            ))}
            {data.elsewhere.length > 0 && <Elsewhere parts={data.elsewhere} />}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`hcard hcard-node${state}`}
          {...marks}
          title={data.siteName || undefined}
          {...{ [OPENER]: data.key }}
          onClick={() => onCard(data.key)}
        >
          <span className="hcard-name">{name}</span>
          <End data={data} />
        </button>
      )}
    </>
  )
})
