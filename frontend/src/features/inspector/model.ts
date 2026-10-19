import { comparePorts } from '../../shared/ports'
import type { TextPiece } from '../../shared/textPieces'
import type { Equipment, Snapshot } from '../../shared/types'
import { labelMatches } from '../map/connections'
import { facetKey, facetLabel } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'

/** One side of a port or position, with what its cable reaches. */
export interface InspectorSide {
  endpointId: string
  /** "port" for a switch port. */
  side: 'front' | 'rear' | 'port'
  cabled: boolean
  cable?: {
    linkId: string
    /** "HDF-01 · 3C/5 rear". */
    farLabel: string
    /** `farLabel` with the equipment and the position as separate names. */
    farPieces: TextPiece[]
    /** The same without a trailing front/rear (what the panel rows show). */
    farShortPieces: TextPiece[]
    /** Circuit network; empty when unresolved. */
    networkId: string
  }
}

/** A switch port, or one panel/HDF position with both sides. */
export interface InspectorUnit {
  /** The row's key: the position label, or the port endpoint. */
  key: string
  label: string
  sides: InspectorSide[]
  /** True when either side has a cable. */
  cabled: boolean
  networkId: string
  /** Where Find AGG / BB from here starts: the front side, else the rear, else the port. */
  startEndpointId: string
  /**
   * The endpoint "Show in Physical" opens: the row's first cabled side, else its
   * front, else its only endpoint (a port).
   */
  physicalEndpointId: string
}

export interface InspectorGroup {
  /** "ports", "positions", or the subpanel "1A". */
  id: string
  title: string
  units: InspectorUnit[]
  /** Shown as a collapsible group row (an HDF's subpanels); decided by the equipment, never by the group's ID. */
  collapsible: boolean
}

export type EndpointFilter = 'cabled' | 'free' | 'all'

const bySide = (a: InspectorSide, b: InspectorSide) =>
  a.side === b.side ? 0 : a.side === 'front' ? -1 : b.side === 'front' ? 1 : 0

/**
 * The ports or positions of one equipment, grouped: a switch's ports, a panel's
 * positions, or an HDF's positions by subpanel (row, then column). Far ends,
 * cable IDs and networks come from the per-snapshot index; nothing scans all
 * links.
 */
export function inspectorGroups(
  s: Snapshot,
  index: SnapshotIndex,
  equipmentId: string,
): InspectorGroup[] {
  const equipment = index.equipment.get(equipmentId)
  if (!equipment) return []
  const { lookup } = index
  const endpointLabel = (id: string) => {
    const p = lookup.endpoints.get(id)
    const owner = index.equipment.get(p?.equipmentId ?? '')
    return p ? `${owner?.name ?? p.equipmentId} · ${p.label}` : id
  }
  const farPieces = (id: string) => {
    const p = lookup.endpoints.get(id)
    const owner = index.equipment.get(p?.equipmentId ?? '')
    if (!p) return { farPieces: [{ text: id }], farShortPieces: [{ text: id }] }
    const head: TextPiece[] = [
      { name: owner?.name ?? p.equipmentId },
      { text: ' · ' },
    ]
    return {
      farPieces: [...head, { name: p.label }],
      farShortPieces: [...head, { name: shortFarLabel(p.label) }],
    }
  }
  const units = new Map<
    string,
    InspectorUnit & { subpanel?: string; position: number }
  >()
  for (const p of lookup.byEquipment.get(equipmentId) ?? []) {
    const key = facetKey(lookup, p)
    let unit = units.get(key)
    if (!unit) {
      const sub = lookup.subpanels.get(p.subpanelId ?? '')
      unit = {
        key,
        label: facetLabel(lookup, p),
        sides: [],
        cabled: false,
        networkId: '',
        startEndpointId: p.id,
        physicalEndpointId: p.id,
        subpanel: sub ? `${sub.row}${sub.column}` : undefined,
        position: p.position ?? 0,
      }
      units.set(key, unit)
    }
    const cable = index.cableByEndpoint.get(p.id)
    const circuit =
      equipment.kind === 'switch'
        ? (equipment.networkId ?? '')
        : (index.circuits.get(p.id) ?? '')
    unit.sides.push({
      endpointId: p.id,
      side: p.side ?? 'port',
      cabled: !!cable,
      cable: cable && {
        linkId: cable.linkId,
        farLabel: endpointLabel(cable.farEndpointId),
        ...farPieces(cable.farEndpointId),
        networkId: circuit,
      },
    })
    if (cable) unit.cabled = true
    if (!unit.networkId && (cable || equipment.kind !== 'switch'))
      unit.networkId = circuit
  }
  for (const unit of units.values()) {
    unit.sides.sort(bySide)
    unit.startEndpointId = unit.sides[0].endpointId
    unit.physicalEndpointId = (
      unit.sides.find((x) => x.cable) ??
      unit.sides.find((x) => x.side === 'front') ??
      unit.sides[0]
    ).endpointId
  }
  // A switch's ports follow their position (the order they were made in);
  // ports saved before groups, and panel positions, follow the number in the label.
  const natural = (
    a: InspectorUnit & { position: number },
    b: InspectorUnit & { position: number },
  ) =>
    equipment.kind === 'switch'
      ? comparePorts(a, b)
      : a.label.localeCompare(b.label, undefined, { numeric: true })
  const all = [...units.values()]
  if (equipment.kind !== 'hdf')
    return [
      {
        id: equipment.kind === 'switch' ? 'ports' : 'positions',
        title: equipment.kind === 'switch' ? 'Ports' : 'Positions',
        units: all.sort(natural).map(strip),
        collapsible: false,
      },
    ]
  const bySubpanel = new Map<string, typeof all>()
  for (const u of all) {
    const id = u.subpanel ?? '?'
    bySubpanel.set(id, [...(bySubpanel.get(id) ?? []), u])
  }
  return [...bySubpanel]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([id, list]) => ({
      id,
      title: `Subpanel ${id}`,
      units: list.sort((a, b) => a.position - b.position).map(strip),
      collapsible: true,
    }))
}

function strip(
  unit: InspectorUnit & { subpanel?: string; position: number },
): InspectorUnit {
  const { subpanel: _subpanel, position: _position, ...rest } = unit
  return rest
}

/** Ports or positions across all groups. */
export const unitCount = (groups: readonly InspectorGroup[]) =>
  groups.reduce((n, g) => n + g.units.length, 0)

/** Cabled for a big equipment (more than 48 units), otherwise All. */
export const defaultFilter = (units: number): EndpointFilter =>
  units > 48 ? 'cabled' : 'all'

/** The Cabled / Free / All filter and label search; groups left empty are dropped. */
export function filterGroups(
  groups: readonly InspectorGroup[],
  { mode, query }: { mode: EndpointFilter; query: string },
): InspectorGroup[] {
  return groups
    .map((g) => ({
      ...g,
      units: g.units.filter(
        (u) =>
          (mode === 'all' || (mode === 'cabled') === u.cabled) &&
          (!query.trim() || labelMatches(u.label, query)),
      ),
    }))
    .filter((g) => g.units.length > 0)
}

export function inspectorHeader(
  s: Snapshot,
  index: SnapshotIndex,
  equipment: Equipment,
  installedIDs: ReadonlySet<string>,
) {
  const summary = index.summaries.get(equipment.id) ?? { cabled: 0, total: 0 }
  return {
    name: equipment.name,
    role: equipment.role,
    network:
      equipment.kind === 'switch'
        ? s.networks.find((n) => n.id === equipment.networkId)?.name
        : undefined,
    proposed: !installedIDs.has(equipment.id),
    summary: `${summary.cabled} of ${summary.total} cabled`,
  }
}

/** The site, node and rack of an equipment; whatever is unknown is left out. */
export function inspectorLocation(index: SnapshotIndex, equipmentId: string) {
  const rack = index.racks.get(index.equipment.get(equipmentId)?.rackId ?? '')
  const node = index.nodes.get(rack?.nodeId ?? '')
  const site = index.sites.get(node?.siteId ?? '')
  return {
    ...(site && { site: { id: site.id, name: site.name } }),
    ...(node && { node: { id: node.id, name: node.name } }),
    ...(rack && { rack: { id: rack.id, name: rack.name } }),
  }
}

/**
 * Find AGG / BB from every port is only for switches: the backend rejects a
 * whole-device start from a panel or an HDF (those start from one position).
 */
export const canFindFromDevice = (equipment: Pick<Equipment, 'kind'>) =>
  equipment.kind === 'switch'

/** Cabled ports or positions per circuit network, sorted by network ID; free units are not counted. */
export function networkCounts(
  groups: readonly InspectorGroup[],
): { networkId: string; cabled: number }[] {
  const counts = new Map<string, number>()
  for (const g of groups)
    for (const u of g.units)
      if (u.cabled) counts.set(u.networkId, (counts.get(u.networkId) ?? 0) + 1)
  return [...counts]
    .map(([networkId, cabled]) => ({ networkId, cabled }))
    .sort((a, b) => a.networkId.localeCompare(b.networkId))
}

/** A new set with the group collapsed, or expanded if it was collapsed. */
export function toggleCollapsed(
  collapsed: ReadonlySet<string>,
  groupId: string,
): Set<string> {
  const next = new Set(collapsed)
  if (!next.delete(groupId)) next.add(groupId)
  return next
}

/**
 * A far end without its own Front/Rear suffix ("HDF-02 · 2B/3 front" becomes
 * "HDF-02 · 2B/3"): the row's F/R marker and the tooltip carry the sides.
 */
export const shortFarLabel = (label: string) =>
  label.replace(/\s*(·\s*)?(front|rear)$/i, '')
