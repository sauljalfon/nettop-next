import type { SnapshotIndex } from './snapshotIndex'

/**
 * The network of an endpoint for a cable's colour and count: the circuit
 * network of a passive endpoint, else the network of a non-passive owner, else
 * undefined. Presentation only; it never feeds traversal.
 */
export function endpointNetwork(
  index: SnapshotIndex,
  endpointId: string,
): string | undefined {
  const circuit = index.circuits.get(endpointId)
  if (circuit) return circuit
  const e = index.equipment.get(index.owner.get(endpointId) ?? '')
  return e && e.role !== 'passive' ? e.networkId : undefined
}
