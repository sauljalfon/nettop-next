import { Fragment } from 'react'
import {
  routeDiagram,
  type DiagramCable,
  type DiagramNode,
  type DiagramSite,
  type DiagramStep,
} from './diagram'
import { notePieces, type Sheet, type TextPiece } from './sheet'
import './paths.css'
import './routeDiagram.css'

interface Props {
  sheet: Sheet
  /** A step was clicked: the endpoint it enters at. */
  onStep: (endpointId: string) => void
}

const isCable = (x: object): x is DiagramCable => 'item' in x

function Pieces({ pieces }: { pieces: TextPiece[] }) {
  return (
    <>
      {pieces.map((p, i) =>
        'name' in p ? (
          <bdi key={i}>{p.name}</bdi>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  )
}

function Cable({ cable }: { cable: DiagramCable }) {
  const { item, gap } = cable
  return (
    <div
      className={`rd-cable ${gap}`}
      data-testid="rd-cable"
      data-link={item.linkId}
      data-gap={gap}
    >
      <span className="wire" />
      <span className="arrow" />
      {item.label ? (
        <span className="clabel" title={item.fullId}>
          <bdi>{item.label}</bdi>
        </span>
      ) : (
        <span className="clabel id" title={item.fullId}>
          {item.shortId}
        </span>
      )}
      {item.note && (
        <span className="cleave">
          <Pieces pieces={notePieces(item.note)} />
        </span>
      )}
    </div>
  )
}

function Step({
  step,
  sheet,
  last,
  onStep,
}: {
  step: DiagramStep
  sheet: Sheet
  last: boolean
  onStep: Props['onStep']
}) {
  const { row } = step
  const end = last ? sheet.end.kind : undefined
  const cls = ['rd-card']
  if (step.n === 1) cls.push('first')
  if (end === 'destination') {
    cls.push('dest')
    if (sheet.end.role === 'backbone') cls.push('bbdest')
  }
  if (row.stop) cls.push('free')
  return (
    <button
      type="button"
      className={cls.join(' ')}
      data-testid="rd-step"
      data-endpoint={row.endpointId}
      data-n={step.n}
      onClick={() => onStep(row.endpointId)}
    >
      <span className="rd-top">
        <span className="rd-num">{step.n}</span>
        <span className={`walk-tag ${row.tag.toLowerCase()}`}>{row.tag}</span>
        <span className="u">U{row.unit}</span>
      </span>
      <span className="rd-name">
        <bdi>{row.name}</bdi>
      </span>
      <span className="rd-rack">
        <bdi>{step.rack}</bdi>
      </span>
      <span className="rd-pins">
        {row.inPort && (
          <span className="pin in">
            <bdi>{row.inPort}</bdi>
          </span>
        )}
        {row.stop ? (
          <span className="pin stop">
            {row.outPort && (
              <>
                <bdi>{row.outPort}</bdi>:{' '}
              </>
            )}
            nothing connected
          </span>
        ) : (
          row.outPort && (
            <span className="pin out">
              <bdi>{row.outPort}</bdi>
            </span>
          )
        )}
      </span>
    </button>
  )
}

function Node({
  node,
  sheet,
  lastN,
  onStep,
}: {
  node: DiagramNode
  sheet: Sheet
  lastN: number
  onStep: Props['onStep']
}) {
  return (
    <div className="rd-node" data-testid="rd-node" data-node={node.nodeId}>
      {node.name && (
        <div className="rd-node-head">
          <small>Node</small>
          <bdi>{node.name}</bdi>
        </div>
      )}
      <div className="rd-node-row">
        {node.parts.map((p) =>
          isCable(p) ? (
            <Cable key={`c:${p.item.linkId}`} cable={p} />
          ) : (
            <Step
              key={`s:${p.n}`}
              step={p}
              sheet={sheet}
              last={p.n === lastN}
              onStep={onStep}
            />
          ),
        )}
      </div>
    </div>
  )
}

function Site({
  site,
  sheet,
  lastN,
  onStep,
}: {
  site: DiagramSite
  sheet: Sheet
  lastN: number
  onStep: Props['onStep']
}) {
  return (
    <div className="rd-site" data-testid="rd-site" data-site={site.siteId}>
      {site.name && (
        <div className="rd-site-head">
          <small>Site</small>
          <bdi>{site.name}</bdi>
        </div>
      )}
      <div className="rd-site-row">
        {site.nodes.map((n, i) =>
          isCable(n) ? (
            <Cable key={`c:${n.item.linkId}`} cable={n} />
          ) : (
            <Node
              key={`n:${i}`}
              node={n}
              sheet={sheet}
              lastN={lastN}
              onStep={onStep}
            />
          ),
        )}
      </div>
    </div>
  )
}

/**
 * The route as a picture, left to right: sites as dashed frames, nodes as boxes,
 * steps as cards with their ports as pins, and one thick line between them. Built
 * from the same Sheet as the walk sheet. The inner `.rd` is the element an export
 * captures (it lays out at its full width); `.rd-scroll` only scrolls it.
 */
export default function RouteDiagram({ sheet, onStep }: Props) {
  const { sites } = routeDiagram(sheet)
  const lastN = sheet.items.filter((i) => i.type === 'row').length
  return (
    <div className="rd-scroll">
      <div className="rd" data-testid="route-diagram">
        {sites.map((s, i) =>
          isCable(s) ? (
            <Cable key={`c:${s.item.linkId}`} cable={s} />
          ) : (
            <Site
              key={`s:${i}`}
              site={s}
              sheet={sheet}
              lastN={lastN}
              onStep={onStep}
            />
          ),
        )}
      </div>
    </div>
  )
}
