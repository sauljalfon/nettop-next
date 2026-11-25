import { X } from 'lucide-react'
import type { Snapshot, TraceRequest, TraceResult } from '../../shared/types'
import type { TextPiece } from '../../shared/textPieces'
import Pieces from '../../shared/ui/Pieces'
import { endpointPieces } from '../pathfinding/projection'

/** What the chip says: the chosen route's two ends, else what was searched. */
export function chipPieces(
  snapshot: Snapshot,
  request: TraceRequest,
  result: TraceResult | undefined,
  routeIndex: number,
): TextPiece[] {
  const route = result?.routes[routeIndex] ?? result?.routes[0]
  if (route)
    return [
      { text: 'Route: ' },
      ...endpointPieces(snapshot, route.start),
      { text: ' → ' },
      ...endpointPieces(snapshot, route.end),
    ]
  if ('device' in request) {
    const device = snapshot.equipment.find((e) => e.id === request.device)
    return [
      { text: 'Trace: ' },
      { name: device?.name ?? request.device },
      { text: ' · all ports' },
    ]
  }
  if (request.mode === 'distribution')
    return [{ text: 'Trace: ' }, ...endpointPieces(snapshot, request.start)]
  return [
    { text: 'Trace: ' },
    ...endpointPieces(snapshot, request.start),
    { text: ' → ' },
    ...endpointPieces(snapshot, request.end),
  ]
}

interface Props {
  snapshot: Snapshot
  request: TraceRequest
  result?: TraceResult
  routeIndex: number
  /** In Physical the chip sits under the page's bar, which has controls at the top. */
  belowBar?: boolean
  /** Reopens the Trace page. */
  onOpen: () => void
  /** Clears the trace: the teal marks and the chip go. */
  onClear: () => void
}

/** The trace, while its page is closed (D49): click reopens the page, × clears it. */
export default function RouteChip(props: Props) {
  const { snapshot, request, result, routeIndex, belowBar, onOpen, onClear } =
    props
  return (
    <div
      className={`route-chip${belowBar ? ' below-bar' : ''}`}
      data-testid="route-chip"
    >
      <button
        type="button"
        className="route-chip-open"
        onClick={onOpen}
        title="Open the Trace page"
      >
        <Pieces pieces={chipPieces(snapshot, request, result, routeIndex)} />
      </button>
      <button
        type="button"
        className="route-chip-clear"
        aria-label="Clear trace"
        title="Clear trace"
        onClick={onClear}
      >
        <X size={14} />
      </button>
    </div>
  )
}
