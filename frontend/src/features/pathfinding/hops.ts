import { piecesText, type TextPiece } from '../../shared/textPieces'
import type { SnapshotIndex } from '../map/snapshotIndex'

/** `readableEndpoint` as pieces: the equipment and the position are separate names. */
export function readableEndpointPieces(
  index: SnapshotIndex,
  endpointId: string,
): TextPiece[] {
  const p = index.lookup.endpoints.get(endpointId)
  if (!p) return [{ text: endpointId }]
  const name = index.equipment.get(p.equipmentId)?.name ?? p.equipmentId
  if (p.position === undefined || !p.side)
    return [{ name }, { text: ' · ' }, { name: p.label }]
  const sub = index.lookup.subpanels.get(p.subpanelId ?? '')
  const place = sub
    ? `${sub.row}${sub.column}/${p.position}`
    : String(p.position)
  return [{ name }, { text: ' · ' }, { name: `${place} ${p.side}` }]
}

/**
 * "HDF-01 · 3C/5 front", "PANEL-A · 1 rear", "EDGE-17 · Port 1": equipment, then
 * a position's row/column, number and side built from the structure (never from
 * the stored label), or a port's own label.
 */
export function readableEndpoint(index: SnapshotIndex, endpointId: string) {
  return piecesText(readableEndpointPieces(index, endpointId))
}
