import type { Snapshot } from '../../shared/types'

/** "Site / Node / Rack" of an equipment; empty when it has no known location. */
export function locationLabel(s: Snapshot, equipmentId: string) {
  const equipment = s.equipment.find((e) => e.id === equipmentId),
    rack = s.racks.find((r) => r.id === equipment?.rackId),
    node = s.nodes.find((n) => n.id === rack?.nodeId),
    site = s.sites.find((site) => site.id === node?.siteId)
  return [site?.name, node?.name, rack?.name].filter(Boolean).join(' / ')
}

/** Site / Node / Rack / Equipment. */
export function locationPath(s: Snapshot, equipmentId: string) {
  const name = s.equipment.find((e) => e.id === equipmentId)?.name
  return [locationLabel(s, equipmentId), name].filter(Boolean).join(' / ')
}

/**
 * "N of M cabled". A device port is one unit; a panel or HDF position is one
 * unit, cabled when either side has a cable.
 */
export function cabledSummary(s: Snapshot, equipmentId: string) {
  const cabled = new Set<string>()
  for (const l of s.links) {
    if (l.kind !== 'cable') continue
    cabled.add(l.a)
    cabled.add(l.b)
  }
  const units = new Map<string, boolean>()
  for (const p of s.endpoints) {
    if (p.equipmentId !== equipmentId) continue
    const unit =
      p.position === undefined ? p.id : `${p.subpanelId ?? ''}/${p.position}`
    units.set(unit, (units.get(unit) ?? false) || cabled.has(p.id))
  }
  return {
    cabled: [...units.values()].filter(Boolean).length,
    total: units.size,
  }
}
