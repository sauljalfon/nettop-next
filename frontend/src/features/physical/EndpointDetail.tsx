import { Crosshair, GitFork } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { Sheet } from '../paths/sheet'
import WalkSheet from '../paths/WalkSheet'
import type { ChainItem, DetailModel } from './equipmentModel'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import Chip from '../../shared/ui/Chip'

/**
 * The selected endpoint as one white card: its label, the network and route
 * chips, two icon actions, and the connection drawn top to bottom (this side's
 * far end, the cable, this endpoint, the bridge, the other side, its cable and
 * far end). A far end opens that place, the other side switches sides, and the
 * selected endpoint is the highlighted box. A switch port shows its walk sheet
 * instead.
 */
export default function EndpointDetail({
  model,
  chain,
  walkSheet,
  routeName,
  networkColor,
  onGoToPeer,
  onSwitch,
  onFind,
  onShowOnMap,
  children,
}: {
  /** Plan editing for the selected endpoint (Connect / Disconnect), below the chain. */
  children?: ReactNode
  model?: DetailModel
  chain: ChainItem[]
  /** A switch port's path, shown in place of the chain. */
  walkSheet?: Sheet
  /** The selected route's destination, when this endpoint is on the route. */
  routeName?: string
  networkColor?: string
  onGoToPeer: (endpointId: string) => void
  onSwitch: (endpointId: string) => void
  onFind: (endpointId: string) => void
  onShowOnMap: () => void
}) {
  if (!model)
    return (
      <aside className="endpoint-detail endpoint" data-testid="endpoint-detail">
        <p className="phys-label">Endpoint</p>
        <p className="phys-muted">
          Select a port or position to see its cable and its peer.
        </p>
      </aside>
    )
  const self = chain.find((i) => i.kind === 'box' && i.role === 'self')
  return (
    <aside className="endpoint-detail endpoint" data-testid="endpoint-detail">
      <header className="detail-head">
        <div>
          <h3 className="detail-label">
            <Name text={model.label} />
          </h3>
          <p className="detail-sub">
            <Name text={model.equipmentName} />
            {model.side && ` · ${model.side}`}
          </p>
        </div>
        <div className="detail-icons">
          <button
            className="btn quiet detail-icon"
            aria-label="Find AGG / BB from here"
            title="Find AGG / BB from here"
            onClick={() => onFind(model.endpointId)}
          >
            <GitFork size={14} />
          </button>
          <button
            className="btn quiet detail-icon"
            aria-label="Show on map"
            title="Show on map"
            onClick={onShowOnMap}
          >
            <Crosshair size={14} />
          </button>
        </div>
      </header>
      <div className="detail-chips">
        {model.networkName && (
          <Chip kind="network" color={networkColor}>
            <Name text={model.networkName} />
          </Chip>
        )}
        {routeName && self?.onRoute && (
          <Chip kind="route" className="route-pill">
            on route <Name text={routeName} />
          </Chip>
        )}
      </div>
      {model.fiberPair && (
        <p className="phys-muted">Fiber pair {model.fiberPair}</p>
      )}

      {walkSheet ? (
        <>
          <p className="phys-label detail-path">Path</p>
          <WalkSheet sheet={walkSheet} onRow={onGoToPeer} />
        </>
      ) : (
        <div className="chain" data-testid="chain">
          {(() => {
            const at = chain.findIndex(
              (i) => i.kind === 'box' && i.role === 'self',
            )
            const before = chain.slice(0, at)
            const after = chain.slice(at + 1)
            const render = (item: ChainItem, i: number) =>
              item.kind === 'link' ? (
                <div
                  key={i}
                  className="chain-link"
                  data-testid="chain-link"
                  data-link={item.link}
                  data-on-route={item.onRoute}
                  style={
                    item.link !== 'bridge' && networkColor
                      ? ({ '--net': networkColor } as CSSProperties)
                      : undefined
                  }
                >
                  <span className="chain-line" />
                  <small>{item.label}</small>
                </div>
              ) : (
                <ChainBox
                  key={i}
                  item={item}
                  onOpen={() =>
                    item.endpointId &&
                    (item.action === 'switch'
                      ? onSwitch(item.endpointId)
                      : onGoToPeer(item.endpointId))
                  }
                />
              )
            return (
              <>
                {/* This side's cable and far end; absent when this side has no cable. */}
                {before[0]?.kind === 'box' && before[0].role === 'far' ? (
                  <div className="chain-group" data-testid="external-cable">
                    {before.map(render)}
                  </div>
                ) : (
                  before.map(render)
                )}
                {chain[at] && render(chain[at], at)}
                {/* The same position's other side, with its cable and far end. */}
                {after.length > 0 && (
                  <div className="chain-group" data-testid="internal-peer">
                    {after.map((item, i) => render(item, at + 1 + i))}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
      {children}
    </aside>
  )
}

function ChainBox({
  item,
  onOpen,
}: {
  item: Extract<ChainItem, { kind: 'box' }>
  onOpen: () => void
}) {
  const label =
    item.action === 'switch'
      ? `Switch to ${item.side}: ${item.title}`
      : item.role === 'far'
        ? `Go to peer: ${item.title}`
        : `Go to ${item.title}`
  const inner = (
    <>
      <strong>
        <Name text={item.title} />
      </strong>
      {item.place && item.place.length > 0 ? (
        <small>
          <PlacePath parts={item.place} />
        </small>
      ) : (
        item.sub && <small>{item.sub}</small>
      )}
    </>
  )
  return (
    <div
      className="chain-box"
      data-testid="chain-box"
      data-role={item.role}
      data-self={item.role === 'self'}
      data-on-route={item.onRoute}
    >
      {item.action ? (
        <button type="button" aria-label={label} onClick={onOpen}>
          {inner}
        </button>
      ) : (
        inner
      )}
    </div>
  )
}
