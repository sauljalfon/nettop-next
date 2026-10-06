import type { Equipment, Route, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'

/** Counts shared by sites, nodes and racks. */
export interface Counts {
  equipment: number
  passive: number
  /** Active devices per network ID; devices with no network count under "". */
  active: Map<string, number>
}

export interface SiteInventory extends Counts {
  nodes: number
  racks: number
}
export interface NodeInventory extends Counts {
  racks: number
}
export interface RackInventory extends Counts {
  units: number
  /** Units covered by equipment inside the rack; out-of-range units are not counted. */
  occupiedUnits: number
}

export interface Inventory {
  sites: ReadonlyMap<string, SiteInventory>
  nodes: ReadonlyMap<string, NodeInventory>
  racks: ReadonlyMap<string, RackInventory>
  nodesBySite: ReadonlyMap<string, string[]>
  racksByNode: ReadonlyMap<string, string[]>
  equipmentByRack: ReadonlyMap<string, string[]>
  equipment: ReadonlyMap<string, Equipment>
}

const counts = (): Counts => ({ equipment: 0, passive: 0, active: new Map() })

function count(c: Counts, e: Equipment) {
  c.equipment++
  if (e.role === 'passive') c.passive++
  else
    c.active.set(e.networkId ?? '', (c.active.get(e.networkId ?? '') ?? 0) + 1)
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Complete physical inventory in one pass over sites, nodes, racks and
 * equipment. It never reads the selected route, network, or any link.
 */
export function buildInventory(s: Snapshot, index: SnapshotIndex): Inventory {
  const sites = new Map<string, SiteInventory>()
  const nodes = new Map<string, NodeInventory>()
  const racks = new Map<string, RackInventory>()
  const nodesBySite = new Map<string, string[]>()
  const racksByNode = new Map<string, string[]>()
  const equipmentByRack = new Map<string, string[]>()

  for (const site of s.sites)
    sites.set(site.id, { ...counts(), nodes: 0, racks: 0 })
  for (const node of s.nodes) {
    nodes.set(node.id, { ...counts(), racks: 0 })
    push(nodesBySite, node.siteId, node.id)
    const site = sites.get(node.siteId)
    if (site) site.nodes++
  }
  for (const rack of s.racks) {
    racks.set(rack.id, { ...counts(), units: rack.units, occupiedUnits: 0 })
    push(racksByNode, rack.nodeId, rack.id)
    const node = nodes.get(rack.nodeId)
    if (node) node.racks++
    const site = sites.get(index.nodes.get(rack.nodeId)?.siteId ?? '')
    if (site) site.racks++
  }
  for (const e of s.equipment) {
    const rack = racks.get(e.rackId)
    if (!rack) continue
    push(equipmentByRack, e.rackId, e.id)
    count(rack, e)
    const lo = Math.max(e.unit, 1)
    const hi = Math.min(e.unit + e.height - 1, rack.units)
    rack.occupiedUnits += Math.max(hi - lo + 1, 0)
    const place = index.places.get(e.id)
    const node = nodes.get(place?.nodeId ?? '')
    if (node) count(node, e)
    const site = sites.get(place?.siteId ?? '')
    if (site) count(site, e)
  }
  return {
    sites,
    nodes,
    racks,
    nodesBySite,
    racksByNode,
    equipmentByRack,
    equipment: index.equipment,
  }
}

/** What the selected route touches; empty without a route. */
export interface RouteMarks {
  sites: ReadonlySet<string>
  nodes: ReadonlySet<string>
  racks: ReadonlySet<string>
  equipment: ReadonlySet<string>
  endpoints: ReadonlySet<string>
  /** Link IDs of the route's hops (cables and bridges). */
  links: ReadonlySet<string>
  /** Route equipment per site, node and rack. */
  equipmentBySite: ReadonlyMap<string, number>
  equipmentByNode: ReadonlyMap<string, number>
  equipmentByRack: ReadonlyMap<string, number>
}

const bump = (map: Map<string, number>, id?: string) => {
  if (id) map.set(id, (map.get(id) ?? 0) + 1)
}

/** Marks from the selected route only, through the index; no link scan. */
export function routeMarks(
  index: SnapshotIndex,
  route: Route | undefined,
): RouteMarks {
  const endpoints = new Set<string>()
  const links = new Set<string>()
  if (route) {
    endpoints.add(route.start)
    endpoints.add(route.end)
    for (const hop of route.hops) {
      endpoints.add(hop.from)
      endpoints.add(hop.to)
      links.add(hop.linkId)
    }
  }
  const equipment = new Set<string>()
  for (const id of endpoints) {
    const owner = index.owner.get(id)
    if (owner) equipment.add(owner)
  }
  const sites = new Set<string>()
  const nodes = new Set<string>()
  const racks = new Set<string>()
  const equipmentBySite = new Map<string, number>()
  const equipmentByNode = new Map<string, number>()
  const equipmentByRack = new Map<string, number>()
  for (const id of equipment) {
    const rackId = index.equipment.get(id)?.rackId
    const place = index.places.get(id)
    if (rackId && index.racks.has(rackId)) {
      racks.add(rackId)
      bump(equipmentByRack, rackId)
    }
    if (place?.nodeId) {
      nodes.add(place.nodeId)
      bump(equipmentByNode, place.nodeId)
    }
    if (place?.siteId) {
      sites.add(place.siteId)
      bump(equipmentBySite, place.siteId)
    }
  }
  return {
    sites,
    nodes,
    racks,
    equipment,
    endpoints,
    links,
    equipmentBySite,
    equipmentByNode,
    equipmentByRack,
  }
}
