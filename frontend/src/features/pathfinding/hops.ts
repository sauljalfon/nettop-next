import type { Route, Snapshot } from '../../shared/types'
import { endpointLabel } from './projection'

export interface HopRow {
  /** Stable within a route: the link ID, or "start". */
  key: string
  kind: 'start' | 'cable' | 'internal'
  /** "START", "1 · CABLE", "2 · PANEL BRIDGE". */
  title: string
  /** The endpoint this row arrives at, as "EQUIPMENT · label". */
  label: string
  endpointId: string
  /** Absent on the start row. */
  linkId?: string
}

/**
 * The ordered rows of a route: START, then each hop as a CABLE or PANEL BRIDGE
 * with the endpoint it reaches and its link ID. Shared by TracePanel and the
 * map overlay so both list the same rows.
 */
export function hopRows(snapshot: Snapshot, route: Route): HopRow[] {
  return [
    {
      key: 'start',
      kind: 'start',
      title: 'START',
      label: endpointLabel(snapshot, route.start),
      endpointId: route.start,
    },
    ...route.hops.map((hop, i) => ({
      key: hop.linkId,
      kind: hop.kind,
      title: `${i + 1} · ${hop.kind === 'internal' ? 'PANEL BRIDGE' : 'CABLE'}`,
      label: endpointLabel(snapshot, hop.to),
      endpointId: hop.to,
      linkId: hop.linkId,
    })),
  ]
}
