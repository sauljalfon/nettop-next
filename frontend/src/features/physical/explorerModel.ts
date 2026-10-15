import type {
  Context,
  Network,
  NodePosition,
  SiteLayout,
  Snapshot,
} from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { piecesText, type TextPiece } from '../../shared/textPieces'
import { defaultNodeLayout, type NodeGraph, type Position } from './layout'
import { resolveLocation, type PhysicalLocation } from './location'
import { rackElevation } from './elevation'
import type { Inventory, RouteMarks } from './inventory'
import type { Equipment } from '../../shared/types'

/** A network and how many active devices it has here; networks keep the snapshot's order. */
export interface NetworkMix {
  networkId: string
  name: string
  count: number
}

export function mixOf(
  active: ReadonlyMap<string, number>,
  networks: readonly Network[],
): NetworkMix[] {
  return networks
    .filter((n) => active.has(n.id))
    .map((n) => ({ networkId: n.id, name: n.name, count: active.get(n.id)! }))
}

/** One line under the breadcrumbs: what Physical shows and how the network choice is used. */
export function scopeNote(
  networks: readonly Network[],
  networkId: string | undefined,
): string {
  const chosen = networks.find((n) => n.id === networkId)
  return chosen
    ? `Complete physical inventory. ${chosen.name} selected: its devices are marked; other networks stay visible.`
    : 'Complete physical inventory. All networks are shown.'
}

/** A stable text for `data-location`, down to the endpoint and side. */
export function locationKey(l: PhysicalLocation): string {
  return [
    l.level === 'sites' ? 'sites' : undefined,
    l.siteId && `site:${l.siteId}`,
    l.nodeId && `node:${l.nodeId}`,
    l.rackId && `rack:${l.rackId}`,
    l.equipmentId && `equipment:${l.equipmentId}`,
    l.endpointId && `endpoint:${l.endpointId}`,
    l.side,
  ]
    .filter(Boolean)
    .join('/')
}

/** "node-a:10,20 node-b:-3,0": the drawn arrangement, for `data-node-positions`. */
export function positionMarks(positions: ReadonlyMap<string, Position>) {
  return [...positions]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, p]) => `${id}:${Math.round(p.x)},${Math.round(p.y)}`)
    .join(' ')
}

/** Saved positions for this site's nodes, and the default arrangement for the rest. */
export function nodePositions(
  nodes: readonly { id: string; name: string }[],
  saved: readonly NodePosition[],
  graph?: NodeGraph,
): Map<string, Position> {
  const own = new Set(nodes.map((n) => n.id))
  const kept = new Map(
    saved
      .filter((p) => own.has(p.nodeId))
      .map((p) => [p.nodeId, { x: p.x, y: p.y }] as const),
  )
  return new Map([...kept, ...defaultNodeLayout(nodes, kept, graph)])
}

/** The cached layout with one node's position replaced (the optimistic update). */
export function withSavedPosition(
  layout: SiteLayout,
  nodeId: string,
  x: number,
  y: number,
): SiteLayout {
  const exists = layout.positions.some((p) => p.nodeId === nodeId)
  return {
    ...layout,
    positions: exists
      ? layout.positions.map((p) =>
          p.nodeId === nodeId ? { nodeId, x, y } : p,
        )
      : [...layout.positions, { nodeId, x, y }],
  }
}

export const withoutPositions = (layout: SiteLayout): SiteLayout => ({
  ...layout,
  positions: [],
})

/** Stroke width of a site line: 3 px for one cable, one more per extra cable, up to 8 px. */
export const siteLineWidth = (count: number) =>
  Math.min(8, 3 + Math.max(0, count - 1))

/** A line is drawn dashed in a plan only when none of its cables is installed. */
export function allProposed(
  linkIds: readonly string[],
  installedLinkIds: ReadonlySet<string>,
  context: Context,
): boolean {
  return (
    context === 'planned' &&
    linkIds.length > 0 &&
    linkIds.every((id) => !installedLinkIds.has(id))
  )
}

export interface CableEnd {
  endpointId: string
  equipmentId: string
  /** "HDF-01 · 3C/5 rear" */
  label: string
  rack: string
  rackId: string
}
export interface CableRow {
  linkId: string
  a: CableEnd
  b: CableEnd
}

/** The cables of a line or a card's link, each with both ends and their racks. */
export function cableRows(
  index: SnapshotIndex,
  linkIds: readonly string[],
): CableRow[] {
  const byId = new Map(index.cables.map((c) => [c.id, c]))
  const end = (endpointId: string): CableEnd => {
    const endpoint = index.lookup.endpoints.get(endpointId)
    const equipment = index.equipment.get(endpoint?.equipmentId ?? '')
    const rack = index.racks.get(equipment?.rackId ?? '')
    return {
      endpointId,
      equipmentId: equipment?.id ?? '',
      label: `${equipment?.name ?? endpoint?.equipmentId ?? ''} · ${endpoint?.label ?? endpointId}`,
      rack: rack?.name ?? '',
      rackId: rack?.id ?? '',
    }
  }
  return linkIds.flatMap((id) => {
    const cable = byId.get(id)
    return cable ? [{ linkId: id, a: end(cable.a), b: end(cable.b) }] : []
  })
}

/** A node's cables to other sites, grouped by the site at the far end. */
export function otherSiteGroups(
  index: SnapshotIndex,
  linkIds: readonly string[],
  siteId: string,
): { siteId: string; name: string; linkIds: string[] }[] {
  const byId = new Map(index.cables.map((c) => [c.id, c]))
  const groups = new Map<string, string[]>()
  for (const id of linkIds) {
    const cable = byId.get(id)
    if (!cable) continue
    for (const endpoint of [cable.a, cable.b]) {
      const site = index.places.get(index.owner.get(endpoint) ?? '')?.siteId
      if (site && site !== siteId) {
        groups.set(site, [...(groups.get(site) ?? []), id])
        break
      }
    }
  }
  return [...groups]
    .map(([id, ids]) => ({
      siteId: id,
      name: index.sites.get(id)?.name ?? id,
      linkIds: ids,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface RackBlock {
  equipmentId: string
  name: string
  kind: Equipment['kind']
  unit: number
  height: number
  /** The device's network; absent for passive equipment. */
  networkId?: string
  onRoute: boolean
  /** An active device of a network other than the selected one: shown, but quieter. */
  muted: boolean
  /** In a plan and not installed. */
  proposed: boolean
}
export interface RackPreview {
  rackId: string
  name: string
  units: number
  usedUnits: number
  equipmentCount: number
  proposedCount: number
  onRoute: boolean
  blocks: RackBlock[]
}

/** The racks of one node as scaled elevations, in snapshot order. */
export function rackPreviews(
  s: Snapshot,
  inv: Inventory,
  nodeId: string,
  options: {
    marks?: RouteMarks
    networkId?: string
    installedIds?: ReadonlySet<string>
  },
): RackPreview[] {
  const names = new Map(s.racks.map((r) => [r.id, r.name]))
  return (inv.racksByNode.get(nodeId) ?? []).map((rackId) => {
    const rack = inv.racks.get(rackId)!
    const blocks = rackElevation(inv, rackId, options).flatMap(
      (row): RackBlock[] => {
        if (row.kind !== 'equipment') return []
        const e = inv.equipment.get(row.equipmentId)!
        const networkId = e.role === 'passive' ? undefined : e.networkId
        return [
          {
            equipmentId: e.id,
            name: e.name,
            kind: e.kind,
            unit: row.unit,
            height: row.height,
            networkId,
            onRoute: row.onRoute,
            muted: row.muted,
            proposed: row.proposed,
          },
        ]
      },
    )
    return {
      rackId,
      name: names.get(rackId) ?? rackId,
      units: rack.units,
      usedUnits: rack.occupiedUnits,
      equipmentCount: rack.equipment,
      proposedCount: blocks.filter((b) => b.proposed).length,
      onRoute: options.marks?.racks.has(rackId) ?? false,
      blocks,
    }
  })
}

/** Racks whose name, or whose equipment's name, contains the text (ignoring case). */
export function filterRackPreviews(
  previews: RackPreview[],
  query: string,
): RackPreview[] {
  const q = query.trim().toLowerCase()
  if (!q) return previews
  return previews.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.blocks.some((b) => b.name.toLowerCase().includes(q)),
  )
}

/** The layout with one node's saved position put back (or removed, if it had none). */
export function restorePosition(
  layout: SiteLayout,
  nodeId: string,
  prior: NodePosition | undefined,
): SiteLayout {
  const rest = layout.positions.filter((p) => p.nodeId !== nodeId)
  return { ...layout, positions: prior ? [...rest, prior] : rest }
}

/**
 * Where to go for a site, node, rack, equipment or endpoint, with every ancestor
 * filled in. Equipment opens its page; an endpoint opens its equipment's page
 * with that endpoint (and its side) selected. An unknown ID goes to Sites.
 */
export function openLocation(
  index: SnapshotIndex,
  target: {
    siteId?: string
    nodeId?: string
    rackId?: string
    equipmentId?: string
    endpointId?: string
  },
): PhysicalLocation {
  const equipmentId =
    target.equipmentId ?? index.owner.get(target.endpointId ?? '')
  if (equipmentId)
    return resolveLocation(index, {
      level: 'equipment',
      equipmentId,
      endpointId: target.endpointId,
    })
  if (target.rackId)
    return resolveLocation(index, { level: 'rack', rackId: target.rackId })
  if (target.nodeId)
    return resolveLocation(index, { level: 'node', nodeId: target.nodeId })
  return resolveLocation(index, { level: 'site', siteId: target.siteId })
}

/** A copy sorted by name, ignoring case and reading numbers as numbers. */
export function sortedByName<T extends { name: string }>(items: readonly T[]) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  )
}

const ROLE_LABEL: Record<string, string> = {
  access: 'access',
  aggregation: 'AGG',
  backbone: 'BB',
  passive: 'passive',
}

/** "AGG · Network A · 1U at U8", "passive · 3U at U4–U6": the small line under a block's name. */
export function elevationSubtitle(
  e: Pick<Equipment, 'role' | 'networkId' | 'unit' | 'height'>,
  networks: readonly Network[],
): string {
  return piecesText(elevationSubtitlePieces(e, networks))
}

/** The same line with the network name as its own piece, for <bdi>. */
export function elevationSubtitlePieces(
  e: Pick<Equipment, 'role' | 'networkId' | 'unit' | 'height'>,
  networks: readonly Network[],
): TextPiece[] {
  const network =
    e.role === 'passive'
      ? undefined
      : networks.find((n) => n.id === e.networkId)?.name
  const top = e.unit + e.height - 1
  const role = ROLE_LABEL[e.role] ?? e.role
  const units = `${e.height}U at U${e.unit}${e.height > 1 ? `–U${top}` : ''}`
  return network
    ? [{ text: `${role} · ` }, { name: network }, { text: ` · ${units}` }]
    : [{ text: `${role} · ${units}` }]
}
