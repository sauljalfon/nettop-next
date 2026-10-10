import { Crosshair, GitFork } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ChainItem, DetailModel } from './equipmentModel'

/**
 * The selected endpoint as one white card: its label, the network and route
 * chips, two icon actions, and the connection drawn top to bottom (this side's
 * far end, the cable, this endpoint, the bridge, the other side, its cable and
 * far end). A far end opens that place, the other side switches sides, and the
 * selected endpoint is the highlighted box.
 */
export default function EndpointDetail({
  model,
  chain,
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
      <aside className="endpoint-detail" data-testid="endpoint-detail">
        <p className="phys-label">ENDPOINT</p>
        <p className="phys-muted">
          Select a port or position to see its cable and its peer.
        </p>
      </aside>
    )
  const self = chain.find((i) => i.kind === 'box' && i.role === 'self')
  return (
    <aside className="endpoint-detail" data-testid="endpoint-detail">
      <header className="detail-head">
        <div>
          <h3 className="detail-label">{model.label}</h3>
          <p className="detail-sub">
            {model.equipmentName}
            {model.side && ` · ${model.side}`}
          </p>
        </div>
        <div className="detail-icons">
          <button
            className="row-action"
            aria-label="Find AGG / BB from here"
            title="Find AGG / BB from here"
            onClick={() => onFind(model.endpointId)}
          >
            <GitFork size={14} />
          </button>
          <button
            className="row-action"
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
          <span
            className="phys-badge"
            style={{ color: networkColor, borderColor: networkColor }}
          >
            {model.networkName}
          </span>
        )}
        {routeName && self?.onRoute && (
          <span className="route-pill">on route {routeName}</span>
        )}
      </div>
      {model.fiberPair && (
        <p className="phys-muted">Fiber pair {model.fiberPair}</p>
      )}

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
      <strong>{item.title}</strong>
      {item.sub && <small>{item.sub}</small>}
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
