import { Crosshair, GitFork, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ChainItem, DetailModel } from './equipmentModel'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import Chip from '../../shared/ui/Chip'

/**
 * The selected endpoint as one white card in the page's side column (D50): its label, the network and route
 * chips, three icon actions, and the two ways to move: Go to peer (this side's
 * far end) and Switch to the other side. The connection itself is the path
 * bar's, along the bottom of the page.
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
  actions,
  onClose,
  children,
}: {
  /** Plan editing for the selected endpoint (Connect / Disconnect), at the top of the panel. */
  actions?: ReactNode
  /** Clears the selection: the card's ×, Esc. */
  onClose: () => void
  /** The rest below the chain (details, the installed hint). */
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
      <p className="work-empty" data-testid="endpoint-empty">
        Select a jack on the face to see where it goes.
      </p>
    )
  const boxes = chain.filter(
    (i): i is Extract<ChainItem, { kind: 'box' }> => i.kind === 'box',
  )
  const self = boxes.find((i) => i.role === 'self')
  // The path bar draws the connection; the panel keeps the two ways to move.
  const far = boxes.find((i) => i.role === 'far' && i.action)
  const other = boxes.find((i) => i.role === 'other' && i.action)
  return (
    <div
      className="endpoint-detail endpoint"
      data-testid="endpoint-detail"
      role="group"
      aria-label="Port"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        onClose()
      }}
    >
      {actions}
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
          <button
            className="btn quiet detail-icon"
            aria-label="Close Port details"
            title="Close"
            onClick={onClose}
          >
            <X size={14} />
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

      {(far || other) && (
        <div className="peer-actions" data-testid="peer-actions">
          {far && (
            <ChainBox
              item={far}
              onOpen={() => far.endpointId && onGoToPeer(far.endpointId)}
            />
          )}
          {other && (
            <ChainBox
              item={other}
              onOpen={() => other.endpointId && onSwitch(other.endpointId)}
            />
          )}
        </div>
      )}
      {children}
    </div>
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
      data-testid="peer-action"
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
