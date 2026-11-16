import type { SnapshotIndex } from '../map/snapshotIndex'

/** One equipment at the other end of this equipment's cables. */
export interface FarEquipment {
  equipmentId: string
  name: string
  /** Site, node and rack names of the far equipment. */
  place: string[]
  /** The circuit networks of those cables, in the snapshot's network order. */
  networkIds: string[]
  cables: number
  /** This equipment's own endpoints on those cables. */
  endpointIds: string[]
}

/**
 * What an equipment connects to: one entry per equipment directly at the other
 * end of its stored cables (never through a bridge, never inferred). A panel or
 * HDF counts the cables on both of its sides. Most cables first, then by name.
 */
export function connectsTo(
  index: SnapshotIndex,
  equipmentId: string,
): FarEquipment[] {
  const order = new Map([...index.networkNames.keys()].map((id, i) => [id, i]))
  const groups = new Map<
    string,
    { endpointIds: string[]; networks: Set<string> }
  >()
  for (const [endpointId, owner] of index.owner) {
    if (owner !== equipmentId) continue
    const cable = index.cableByEndpoint.get(endpointId)
    if (!cable) continue
    const farId = index.owner.get(cable.farEndpointId)
    if (!farId || farId === equipmentId) continue
    const group = groups.get(farId) ?? {
      endpointIds: [],
      networks: new Set<string>(),
    }
    group.endpointIds.push(endpointId)
    const network =
      index.circuits.get(endpointId) ??
      index.circuits.get(cable.farEndpointId) ??
      switchNetwork(index, equipmentId) ??
      switchNetwork(index, farId)
    if (network) group.networks.add(network)
    groups.set(farId, group)
  }
  const result: FarEquipment[] = []
  for (const [farId, group] of groups) {
    const far = index.equipment.get(farId)
    if (!far) continue
    result.push({
      equipmentId: farId,
      name: far.name,
      place: index.locationParts.get(farId) ?? [],
      networkIds: [...group.networks].sort(
        (a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9),
      ),
      cables: group.endpointIds.length,
      endpointIds: group.endpointIds,
    })
  }
  return result.sort(
    (a, b) =>
      b.cables - a.cables ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  )
}

/** The network of an active device (a switch has one; a panel does not). */
function switchNetwork(index: SnapshotIndex, equipmentId: string) {
  const e = index.equipment.get(equipmentId)
  return e?.role === 'passive' ? undefined : e?.networkId || undefined
}
