import type { TextPiece } from '../../shared/textPieces'
import type { Endpoint, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { circuitsCut, equipmentDeletePreview } from '../planning/deletePreview'

export interface DeleteItem {
  id: string
  name: string
  /** Node › rack · U, names apart. */
  place: TextPiece[]
  /** The endpoints it has: ports of a switch, both sides of a panel or HDF's positions. */
  endpoints: number
  unit: 'ports' | 'positions'
}

export interface DeleteSummary {
  items: DeleteItem[]
  endpoints: number
  /** Distinct cables on all of them. */
  cables: number
  /** The circuits those cables cut, access end first. */
  circuits: string[]
}

/** What the Delete N… pane lists: each equipment with its place, and what goes with them all. */
export function deleteSummary(
  snapshot: Snapshot,
  index: SnapshotIndex,
  equipmentIds: readonly string[],
): DeleteSummary {
  const items: DeleteItem[] = []
  const cables = new Set<string>()
  let endpoints = 0
  for (const id of new Set(equipmentIds)) {
    const preview = equipmentDeletePreview(snapshot, index, id)
    if (!preview) continue
    const { equipment } = preview
    const rack = index.racks.get(equipment.rackId)
    const node = index.nodes.get(rack?.nodeId ?? '')
    const place: TextPiece[] = []
    if (node) place.push({ name: node.name }, { text: ' › ' })
    if (rack) place.push({ name: rack.name })
    place.push({ text: ` · U${equipment.unit}` })
    items.push({
      id,
      name: equipment.name,
      place,
      endpoints: preview.endpointCount,
      unit: equipment.kind === 'switch' ? 'ports' : 'positions',
    })
    endpoints += preview.endpointCount
    for (const c of preview.cableIds) cables.add(c)
  }
  return {
    items,
    endpoints,
    cables: cables.size,
    circuits: circuitsCut(snapshot, index, [...cables]).map((c) => c.label),
  }
}

export interface DisconnectItem {
  id: string
  label: string
  /** Both ends: equipment name and port label, names apart. */
  ends: TextPiece[]
}

export interface DisconnectSummary {
  cables: DisconnectItem[]
  circuits: string[]
}

/** What the Disconnect N… pane lists: each cable with both ends, and the circuits cut. */
export function disconnectSummary(
  snapshot: Snapshot,
  index: SnapshotIndex,
  cableIds: readonly string[],
): DisconnectSummary {
  const endpoints = new Map<string, Endpoint>()
  const wanted = new Set<string>()
  const links = cableIds.flatMap((id) => {
    const link = index.cableById.get(id)
    if (!link) return []
    wanted.add(link.a).add(link.b)
    return [link]
  })
  for (const p of snapshot.endpoints)
    if (wanted.has(p.id)) endpoints.set(p.id, p)
  const end = (id: string): TextPiece[] => {
    const p = endpoints.get(id)
    return [
      { name: index.equipment.get(p?.equipmentId ?? '')?.name ?? '' },
      { text: ' ' },
      { name: p?.label ?? '' },
    ]
  }
  return {
    cables: links.map((l) => ({
      id: l.id,
      label: l.label || 'No label',
      ends: [...end(l.a), { text: ' ↔ ' }, ...end(l.b)],
    })),
    circuits: circuitsCut(
      snapshot,
      index,
      links.map((l) => l.id),
    ).map((c) => c.label),
  }
}
