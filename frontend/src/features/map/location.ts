import { hasSide } from '../../shared/ports'
import type { Snapshot } from '../../shared/types'

/** "Site / Node / Rack" of an equipment, for plain text only (search, titles, CSV, print); empty when it has no known location. */
export function locationLabel(s: Snapshot, equipmentId: string) {
  const equipment = s.equipment.find((e) => e.id === equipmentId),
    rack = s.racks.find((r) => r.id === equipment?.rackId),
    node = s.nodes.find((n) => n.id === rack?.nodeId),
    site = s.sites.find((site) => site.id === node?.siteId)
  return [site?.name, node?.name, rack?.name].filter(Boolean).join(' / ')
}

/** Site, node and rack names of an equipment, in that order; missing ones are skipped. */
export function locationParts(s: Snapshot, equipmentId: string): string[] {
  const equipment = s.equipment.find((e) => e.id === equipmentId),
    rack = s.racks.find((r) => r.id === equipment?.rackId),
    node = s.nodes.find((n) => n.id === rack?.nodeId),
    site = s.sites.find((site) => site.id === node?.siteId)
  return [site?.name, node?.name, rack?.name].filter((x): x is string => !!x)
}

/** Site / Node / Rack / Equipment. */
export function locationPath(s: Snapshot, equipmentId: string) {
  const name = s.equipment.find((e) => e.id === equipmentId)?.name
  return [locationLabel(s, equipmentId), name].filter(Boolean).join(' / ')
}

/**
 * "N of M cabled" for every equipment in one pass over links and endpoints. A
 * device port is one unit; a panel or HDF position is one unit, cabled when
 * either side has a cable. Equipment without endpoints has no entry.
 */
export function cabledSummaries(
  s: Snapshot,
): Map<string, { cabled: number; total: number }> {
  const cabled = new Set<string>()
  for (const l of s.links) {
    if (l.kind !== 'cable') continue
    cabled.add(l.a)
    cabled.add(l.b)
  }
  const units = new Map<string, Map<string, boolean>>()
  for (const p of s.endpoints) {
    const unit =
      !hasSide(p) || p.position === undefined
        ? p.id
        : `${p.subpanelId ?? ''}/${p.position}`
    let own = units.get(p.equipmentId)
    if (!own) units.set(p.equipmentId, (own = new Map()))
    own.set(unit, (own.get(unit) ?? false) || cabled.has(p.id))
  }
  const result = new Map<string, { cabled: number; total: number }>()
  for (const [id, own] of units) {
    let n = 0
    for (const used of own.values()) if (used) n++
    result.set(id, { cabled: n, total: own.size })
  }
  return result
}

/** "Site / Node / Rack" of every equipment in one pass. */
export function locationLabels(s: Snapshot): Map<string, string> {
  const racks = new Map(s.racks.map((r) => [r.id, r]))
  const nodes = new Map(s.nodes.map((n) => [n.id, n]))
  const sites = new Map(s.sites.map((x) => [x.id, x]))
  return new Map(
    s.equipment.map((e) => {
      const rack = racks.get(e.rackId)
      const node = nodes.get(rack?.nodeId ?? '')
      const site = sites.get(node?.siteId ?? '')
      return [
        e.id,
        [site?.name, node?.name, rack?.name].filter(Boolean).join(' / '),
      ]
    }),
  )
}

/** The site, node and rack names of every equipment in one pass. */
export function locationPartsAll(s: Snapshot): Map<string, string[]> {
  const racks = new Map(s.racks.map((r) => [r.id, r]))
  const nodes = new Map(s.nodes.map((n) => [n.id, n]))
  const sites = new Map(s.sites.map((x) => [x.id, x]))
  return new Map(
    s.equipment.map((e) => {
      const rack = racks.get(e.rackId)
      const node = nodes.get(rack?.nodeId ?? '')
      const site = sites.get(node?.siteId ?? '')
      return [
        e.id,
        [site?.name, node?.name, rack?.name].filter((x): x is string => !!x),
      ]
    }),
  )
}
