import type { Endpoint, Equipment, Snapshot } from '../../shared/types'
import { comparePorts } from '../../shared/ports'
import type { TextPiece } from '../../shared/textPieces'
import { endpointNetwork } from '../map/circuitNetwork'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { TypeIconKind } from './icons'
import { buildProblems } from './problems'
import { buildRackRows } from './racks'

/**
 * An endpoint cell (Far end, A end, B end): names stay apart for display. A
 * position's label already names its side ("3 · Front"), so none is added.
 */
export interface EndpointPieces {
  equipmentName: string
  label: string
}

export interface InventoryRow {
  /** The object's ID: stable across refetches. */
  key: string
  equipmentId: string
  endpointId?: string
  cableId?: string
  /** In a plan: not in the installed topology. Never true when installed. */
  proposed: boolean
  /** Natural index: breaks sort ties. */
  i: number
  /** Plain text per column key: search, pills, sort and the CSV read this. */
  values: Record<string, string>
  /** For pills: the network ID or the status word of network and status columns. */
  raw: Record<string, string>
  /** Endpoint columns only. */
  pieces: Record<string, EndpointPieces | undefined>
  /** List-valued fields (Missing, Fits): `values` holds them joined with ", ". */
  lists?: Record<string, string[]>
  /** Columns of text with names inside (Where, Detail): the pieces, never one joined string. */
  parts?: Record<string, TextPiece[]>
  /** Racks only. */
  rackId?: string
  /** The icon of the row's object, where the list's own does not say (Racks, Problems, Work list). */
  icon?: TypeIconKind
  /** Work list: the site, node or rack an added container opens in Physical. */
  place?: { siteId?: string; nodeId?: string; rackId?: string }
  /** Work list: removed in the plan, so there is nothing to open there. */
  gone?: true
}

export interface InventoryRows {
  equipment: InventoryRow[]
  ports: InventoryRow[]
  cables: InventoryRow[]
  racks: InventoryRow[]
  problems: InventoryRow[]
  /** Always empty here: the Work list needs the plan and the installed topology (workList.ts). */
  work: InventoryRow[]
}

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const KIND = { switch: 'Switch', panel: 'Panel', hdf: 'HDF' } as const
const byName = new Intl.Collator(undefined, { numeric: true })

/**
 * The details of an equipment that are empty and worth filling in: a panel has
 * no serial number or address to give, an HDF no address.
 */
export function missingOf(e: Equipment): string[] {
  const empty = (v?: string) => !v || v.trim() === ''
  const out: string[] = []
  if (empty(e.manufacturer)) out.push('Manufacturer')
  if (empty(e.model)) out.push('Model')
  if (e.kind !== 'panel' && empty(e.serialNumber)) out.push('Serial number')
  if (e.kind === 'switch' && empty(e.ipAddress)) out.push('IP address')
  return out
}

/**
 * Ports used and free per equipment: a switch counts its ports that have a
 * cable; a panel or HDF counts its positions cabled on either side (the two
 * sides of a position are one; bridges are not cables).
 */
function portUse(snapshot: Snapshot, index: SnapshotIndex) {
  const use = new Map<string, { used: number; total: number }>()
  const positions = new Map<string, boolean>()
  for (const p of snapshot.endpoints) {
    const kind = index.equipment.get(p.equipmentId)?.kind
    const cabled = index.cableByEndpoint.has(p.id)
    let u = use.get(p.equipmentId)
    if (!u) use.set(p.equipmentId, (u = { used: 0, total: 0 }))
    if (kind === 'switch') {
      u.total++
      if (cabled) u.used++
      continue
    }
    const key = `${p.equipmentId}|${p.subpanelId ?? ''}|${p.position ?? p.id}`
    if (!positions.has(key)) {
      positions.set(key, false)
      u.total++
    }
    if (cabled && !positions.get(key)) {
      positions.set(key, true)
      u.used++
    }
  }
  return use
}

export function buildRows(
  snapshot: Snapshot,
  index: SnapshotIndex,
  installedIDs: ReadonlySet<string>,
  installedLinkIDs: ReadonlySet<string>,
): InventoryRows {
  const planned = snapshot.context === 'planned'
  const networkName = new Map(snapshot.networks.map((n) => [n.id, n.name]))
  const netText = (id?: string) => (id ? (networkName.get(id) ?? id) : '')
  const endpoints = new Map(snapshot.endpoints.map((p) => [p.id, p]))
  const nameOf = (equipmentId: string) =>
    index.equipment.get(equipmentId)?.name ?? ''
  const place = (equipmentId: string) => {
    const p = index.places.get(equipmentId)
    return {
      site: index.sites.get(p?.siteId ?? '')?.name ?? '',
      node: index.nodes.get(p?.nodeId ?? '')?.name ?? '',
    }
  }
  const piecesOf = (p?: Endpoint): EndpointPieces | undefined =>
    p && { equipmentName: nameOf(p.equipmentId), label: p.label }
  const textOf = (x?: EndpointPieces) =>
    x ? `${x.equipmentName} ${x.label}` : ''

  const use = portUse(snapshot, index)
  const equipment = snapshot.equipment.map((e, i): InventoryRow => {
    const { site, node } = place(e.id)
    const u = use.get(e.id) ?? { used: 0, total: 0 }
    const missing = missingOf(e)
    const rack = index.racks.get(e.rackId)?.name ?? ''
    const net = e.role === 'passive' ? '' : (e.networkId ?? '')
    return {
      key: e.id,
      equipmentId: e.id,
      proposed: planned && !installedIDs.has(e.id),
      i,
      values: {
        name: e.name,
        kind: KIND[e.kind],
        role: cap(e.role),
        net: netText(net),
        site,
        node,
        rack,
        unit: String(e.unit),
        used: String(u.used),
        free: String(u.total - u.used),
        manufacturer: e.manufacturer ?? '',
        model: e.model ?? '',
        serial: e.serialNumber ?? '',
        ip: e.ipAddress ?? '',
        status: cap(e.status),
        missing: missing.join(', '),
      },
      raw: { net, status: e.status ?? '' },
      pieces: {},
      lists: { missing },
    }
  })

  const proposedEquipment = (id: string) => planned && !installedIDs.has(id)
  // Ports by equipment name: the names are ranked once (equal names share a
  // rank), so the 50,000-port sort compares numbers, not names.
  const rank = new Map<string, number>()
  const byEquipmentName = [...snapshot.equipment].sort((a, b) =>
    byName.compare(a.name, b.name),
  )
  byEquipmentName.forEach((e, i) => {
    const before = byEquipmentName[i - 1]
    const same = before && byName.compare(before.name, e.name) === 0
    rank.set(e.id, same ? rank.get(before.id)! : i)
  })
  const rankOf = (equipmentId: string) => rank.get(equipmentId) ?? -1
  const ordered = [...snapshot.endpoints].sort(
    (a, b) =>
      rankOf(a.equipmentId) - rankOf(b.equipmentId) || comparePorts(a, b),
  )
  const ports = ordered.map((p, i): InventoryRow => {
    const cable = index.cableByEndpoint.get(p.id)
    const { site, node } = place(p.equipmentId)
    const far = piecesOf(endpoints.get(cable?.farEndpointId ?? ''))
    const net = endpointNetwork(index, p.id) ?? ''
    return {
      key: p.id,
      equipmentId: p.equipmentId,
      endpointId: p.id,
      ...(cable ? { cableId: cable.linkId } : {}),
      proposed:
        proposedEquipment(p.equipmentId) ||
        (!!cable && planned && !installedLinkIDs.has(cable.linkId)),
      i,
      values: {
        port: p.label,
        equipment: nameOf(p.equipmentId),
        side: cap(p.side),
        net: netText(net),
        type: cap(p.portType),
        connector: p.connector ?? '',
        speed: p.speed ?? '',
        state: cap(p.state),
        cable: cable?.linkId ?? '',
        far: textOf(far),
        site,
        node,
        connected: cable ? 'Yes' : 'No',
      },
      raw: { net, state: p.state ?? '' },
      pieces: { far },
    }
  })

  const cables = index.cables.map((l, i): InventoryRow => {
    const a = endpoints.get(l.a)
    const b = endpoints.get(l.b)
    const net = endpointNetwork(index, l.a) ?? endpointNetwork(index, l.b) ?? ''
    const pa = piecesOf(a)
    const pb = piecesOf(b)
    return {
      key: l.id,
      equipmentId: a?.equipmentId ?? '',
      endpointId: l.a,
      cableId: l.id,
      proposed: planned && !installedLinkIDs.has(l.id),
      i,
      values: {
        id: l.id,
        a: textOf(pa),
        b: textOf(pb),
        net: netText(net),
        label: l.label ?? '',
        status: cap(l.status),
      },
      raw: { net, status: l.status ?? '' },
      pieces: { a: pa, b: pb },
    }
  })

  return {
    equipment,
    ports,
    cables,
    racks: buildRackRows(snapshot, index),
    problems: buildProblems(snapshot, index, installedIDs),
    work: [],
  }
}
