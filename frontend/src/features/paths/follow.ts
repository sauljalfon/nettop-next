import type { Hop, Route } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'

export type WalkEnd =
  | {
      kind: 'destination'
      endpointId: string
      role: 'aggregation' | 'backbone'
    }
  | { kind: 'switch'; endpointId: string }
  | { kind: 'free'; endpointId: string }
  | { kind: 'none'; endpointId: string }
  | { kind: 'endpoint'; endpointId: string }

export interface Walk {
  start: string
  hops: Hop[]
  end: WalkEnd
  networkId?: string
}

/**
 * The path from one endpoint along stored links only: its cable, then the far
 * endpoint's stored bridge, then that endpoint's cable, and so on. It stops at
 * a switch port, at an endpoint with nothing further, or before revisiting an
 * endpoint. Nothing is inferred from positions, names or roles.
 */
export function followPort(index: SnapshotIndex, endpointId: string): Walk {
  const equipmentOf = (id: string) =>
    index.equipment.get(index.owner.get(id) ?? '')
  const walk = (end: WalkEnd, hops: Hop[]): Walk => ({
    start: endpointId,
    hops,
    end,
    networkId: equipmentOf(endpointId)?.networkId,
  })

  const hops: Hop[] = []
  const visited = new Set([endpointId])
  let current = endpointId
  for (;;) {
    const cable = index.cableByEndpoint.get(current)
    if (!cable)
      return walk(
        current === endpointId
          ? { kind: 'none', endpointId }
          : { kind: 'free', endpointId: current },
        hops,
      )
    const far = cable.farEndpointId
    if (visited.has(far))
      return walk({ kind: 'free', endpointId: current }, hops)
    hops.push({ linkId: cable.linkId, from: current, to: far, kind: 'cable' })
    visited.add(far)

    const owner = equipmentOf(far)
    if (owner?.kind === 'switch') {
      const role = owner.role
      return walk(
        role === 'aggregation' || role === 'backbone'
          ? { kind: 'destination', endpointId: far, role }
          : { kind: 'switch', endpointId: far },
        hops,
      )
    }

    const bridge = index.bridgeByEndpoint.get(far)
    if (!bridge || visited.has(bridge.otherEndpointId))
      return walk({ kind: 'free', endpointId: far }, hops)
    hops.push({
      linkId: bridge.linkId,
      from: far,
      to: bridge.otherEndpointId,
      kind: 'internal',
    })
    visited.add(bridge.otherEndpointId)
    current = bridge.otherEndpointId
  }
}

/** A server route as a walk: its own hops, never walked again here. */
export function walkOfRoute(_index: SnapshotIndex, route: Route): Walk {
  return {
    start: route.start,
    hops: route.hops,
    end: route.destinationRole
      ? {
          kind: 'destination',
          endpointId: route.end,
          role: route.destinationRole,
        }
      : { kind: 'endpoint', endpointId: route.end },
    networkId: route.sourceNetworkId,
  }
}
