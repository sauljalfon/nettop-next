import type { Equipment, Rack, Snapshot } from '../../shared/types'

export interface TreeRack {
  rack: Rack
  equipment: Equipment[]
}
export interface TreeNode {
  node: Snapshot['nodes'][number]
  racks: TreeRack[]
}
export interface TreeSite {
  site: Snapshot['sites'][number]
  nodes: TreeNode[]
}

/**
 * The Explore tree for a search text. With no text, every site, node and rack.
 * With text, only the equipment whose name or role contains it (ignoring case),
 * and only the racks, nodes and sites that contain at least one such match.
 */
export function filterTree(s: Snapshot, query: string): TreeSite[] {
  const q = query.trim().toLowerCase()
  const matches = (e: Equipment) =>
    !q || `${e.name} ${e.role}`.toLowerCase().includes(q)
  const byRack = new Map<string, Equipment[]>()
  for (const e of s.equipment) {
    if (!matches(e)) continue
    const list = byRack.get(e.rackId)
    if (list) list.push(e)
    else byRack.set(e.rackId, [e])
  }
  const keep = <T>(list: T[]) => (q ? list.filter(Boolean) : list)
  return s.sites
    .map((site) => ({
      site,
      nodes: s.nodes
        .filter((n) => n.siteId === site.id)
        .map((node) => ({
          node,
          racks: s.racks
            .filter((r) => r.nodeId === node.id)
            .map((rack) => ({ rack, equipment: byRack.get(rack.id) ?? [] }))
            .filter((r) => !q || r.equipment.length > 0),
        }))
        .filter((n) => !q || n.racks.length > 0),
    }))
    .filter((site) => !q || site.nodes.length > 0)
    .map((site) => ({ ...site, nodes: keep(site.nodes) }))
}
