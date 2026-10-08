import type { DetailModel } from './equipmentModel'

/**
 * What one endpoint is connected to: its external cable and far end, and, for
 * panel and HDF positions, the same position's other side. Small outlined
 * buttons only.
 */
export default function EndpointDetail({
  model,
  onGoToPeer,
  onSwitch,
  onFind,
  onShowOnMap,
}: {
  model?: DetailModel
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
  return (
    <aside className="endpoint-detail" data-testid="endpoint-detail">
      <p className="phys-label">ENDPOINT</p>
      <h3 className="detail-label">{model.label}</h3>
      <p className="detail-sub">
        {model.equipmentName}
        {model.side && ` · ${model.side}`}
        {model.networkName && ` · ${model.networkName}`}
      </p>
      {model.fiberPair && (
        <p className="phys-muted">Fiber pair {model.fiberPair}</p>
      )}

      <p className="phys-label detail-section">EXTERNAL CABLE</p>
      {model.external ? (
        <div data-testid="external-cable" className="detail-block">
          <code>{model.external.linkId}</code>
          <p>{model.external.farTitle}</p>
          <p className="phys-muted">{model.external.farLocation}</p>
          <button
            className="outline-button"
            onClick={() => onGoToPeer(model.external!.farEndpointId)}
          >
            Go to peer
          </button>
        </div>
      ) : (
        <p className="phys-muted">No cable on this {model.side ?? 'port'}.</p>
      )}

      {model.internal && (
        <>
          <p className="phys-label detail-section">
            INTERNAL PEER (SAME POSITION)
          </p>
          <div data-testid="internal-peer" className="detail-block">
            <p>
              <strong>{model.internal.side}</strong> side of this position
            </p>
            {model.internal.linkId ? (
              <>
                <code>{model.internal.linkId}</code>
                <p className="phys-muted">{model.internal.farTitle}</p>
              </>
            ) : (
              <p className="phys-muted">No cable on that side.</p>
            )}
            <button
              className="outline-button"
              onClick={() => onSwitch(model.internal!.endpointId)}
            >
              {model.internal.action}
            </button>
          </div>
        </>
      )}

      <div className="detail-actions">
        <button
          className="outline-button"
          onClick={() => onFind(model.endpointId)}
        >
          Find AGG / BB from here
        </button>
        <button className="outline-button" onClick={onShowOnMap}>
          Show on map
        </button>
      </div>
    </aside>
  )
}
