import type { Endpoint, Snapshot } from '../../shared/types'
import { comparePorts } from '../../shared/ports'
import { endpointNetwork } from '../map/circuitNetwork'
import type { SnapshotIndex } from '../map/snapshotIndex'

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
}

export interface InventoryRows {
  equipment: InventoryRow[]
  ports: InventoryRow[]
  cables: InventoryRow[]
}

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const KIND = { switch: 'Switch', panel: 'Panel', hdf: 'HDF' } as const
const byName = new Intl.Collator(undefined, { numeric: true })

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

  const equipment = snapshot.equipment.map((e, i): InventoryRow => {
    const { site, node } = place(e.id)
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
        manufacturer: e.manufacturer ?? '',
        model: e.model ?? '',
        serial: e.serialNumber ?? '',
        ip: e.ipAddress ?? '',
        status: cap(e.status),
      },
      raw: { net, status: e.status ?? '' },
      pieces: {},
    }
  })

  const proposedEquipment = (id: string) => planned && !installedIDs.has(id)
  const ordered = [...snapshot.endpoints].sort(
    (a, b) =>
      byName.compare(nameOf(a.equipmentId), nameOf(b.equipmentId)) ||
      comparePorts(a, b),
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

  return { equipment, ports, cables }
}
