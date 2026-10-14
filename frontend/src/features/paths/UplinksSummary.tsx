import type { Equipment } from '../../shared/types'
import type { UplinksState } from './useUplinks'
import './paths.css'

interface Props {
  equipment: Equipment
  state: UplinksState
  /** The port whose line is marked (the selected endpoint in Physical). */
  selectedEndpointId?: string
  /** A line was clicked: the switch port it starts at. */
  onSelect: (endpointId: string) => void
}

/** One line per port of an access switch that reaches an AGG or BB. */
export default function UplinksSummary({
  equipment,
  state,
  selectedEndpointId,
  onSelect,
}: Props) {
  const name = <bdi>{equipment.name}</bdi>
  const { data } = state
  let body
  if (equipment.role === 'aggregation' || equipment.role === 'backbone') {
    body = (
      <p className="uplinks-empty">
        {name} is {equipment.role === 'backbone' ? 'a BB' : 'an AGG'}: paths
        from access switches end here.
      </p>
    )
  } else if (state.error) {
    body = (
      <p className="uplinks-empty" role="alert">
        {state.error.message}{' '}
        <button type="button" className="outline-button" onClick={state.retry}>
          Retry
        </button>
      </p>
    )
  } else if (!data) {
    body = <p className="uplinks-empty">Finding uplinks…</p>
  } else {
    body = (
      <>
        {data.lines.length === 0 && (
          <p className="uplinks-empty" data-testid="uplinks-empty">
            No port of {name} reaches an AGG or BB.
          </p>
        )}
        {data.lines.map((line) => {
          const via = line.via.join(' › ')
          return (
            <button
              key={line.startEndpointId}
              type="button"
              className="uplink"
              data-testid="uplink-line"
              data-endpoint={line.startEndpointId}
              aria-pressed={line.startEndpointId === selectedEndpointId}
              onClick={() => onSelect(line.startEndpointId)}
            >
              <span className="uplink-port">
                <bdi>{line.port}</bdi>
              </span>
              <span className="uplink-dest">
                → <bdi>{line.destinationName}</bdi> ·{' '}
                <bdi>{line.destinationPort}</bdi>
                <span className={`uplink-tag ${line.role.toLowerCase()}`}>
                  {line.role}
                </span>
              </span>
              <span className="uplink-count">
                {line.cables} {line.cables === 1 ? 'cable' : 'cables'}
              </span>
              {line.via.length > 0 && (
                <span className="uplink-via" title={`via ${via}`}>
                  via <bdi>{via}</bdi>
                </span>
              )}
            </button>
          )
        })}
        {data.mismatches > 0 && (
          <p className="uplinks-note" data-testid="uplinks-mismatch">
            {data.mismatches}{' '}
            {data.mismatches === 1 ? 'port reaches' : 'ports reach'} an AGG or
            BB on another network.
          </p>
        )}
        {data.notice && <p className="uplinks-note">{data.notice}</p>}
      </>
    )
  }
  return (
    <section className="uplinks" data-testid="uplinks" aria-label="Uplinks">
      <header className="uplinks-head">
        <h3>Uplinks</h3>
        {data && (
          <small>
            {data.lines.length} of {data.total} ports reach an AGG or BB
          </small>
        )}
      </header>
      {body}
    </section>
  )
}
