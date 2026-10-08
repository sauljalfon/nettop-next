import type { Route } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'

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
  /** What the row shows: the cable ID, or "bridge" for an internal link. Absent on the start row. */
  linkLabel?: string
}

/**
 * "HDF-01 · 3C/5 front", "PANEL-A · 1 rear", "EDGE-17 · Port 1": equipment, then
 * a position's row/column, number and side built from the structure (never from
 * the stored label), or a port's own label.
 */
export function readableEndpoint(index: SnapshotIndex, endpointId: string) {
  const p = index.lookup.endpoints.get(endpointId)
  if (!p) return endpointId
  const name = index.equipment.get(p.equipmentId)?.name ?? p.equipmentId
  if (p.position === undefined || !p.side) return `${name} · ${p.label}`
  const sub = index.lookup.subpanels.get(p.subpanelId ?? '')
  const place = sub
    ? `${sub.row}${sub.column}/${p.position}`
    : String(p.position)
  return `${name} · ${place} ${p.side}`
}

/**
 * The ordered rows of a route: START, then each hop as a CABLE or PANEL BRIDGE
 * with the endpoint it reaches and its link ID. Shared by the map overlay in
 * both views so they list the same rows.
 */
export function hopRows(index: SnapshotIndex, route: Route): HopRow[] {
  return [
    {
      key: 'start',
      kind: 'start',
      title: 'START',
      label: readableEndpoint(index, route.start),
      endpointId: route.start,
    },
    ...route.hops.map((hop, i) => ({
      key: hop.linkId,
      kind: hop.kind,
      title: `${i + 1} · ${hop.kind === 'internal' ? 'PANEL BRIDGE' : 'CABLE'}`,
      label: readableEndpoint(index, hop.to),
      endpointId: hop.to,
      linkId: hop.linkId,
      linkLabel: hop.kind === 'internal' ? 'bridge' : hop.linkId,
    })),
  ]
}
