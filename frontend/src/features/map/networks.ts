import type { Snapshot } from '../../shared/types'

/**
 * Network of each passive endpoint, taken from the access device on its circuit
 * (the same rule as the engine's passive start). A circuit is the run of passive
 * endpoints joined by cables and bridges, ending at active endpoints. It is
 * resolved only when at least one access device is present and all agree;
 * otherwise the endpoint is absent from the map. Presentation only.
 */
export function circuitNetworks(s: Snapshot): Map<string, string> {
  const owner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId]))
  const equipment = new Map(s.equipment.map((e) => [e.id, e]))
  const adjacent = new Map<string, string[]>()
  for (const l of s.links) {
    adjacent.set(l.a, [...(adjacent.get(l.a) ?? []), l.b])
    adjacent.set(l.b, [...(adjacent.get(l.b) ?? []), l.a])
  }
  const isPassive = (id: string) =>
    equipment.get(owner.get(id) ?? '')?.role === 'passive'

  const result = new Map<string, string>()
  const seen = new Set<string>()
  for (const p of s.endpoints) {
    if (!isPassive(p.id) || seen.has(p.id)) continue
    const circuit = [p.id]
    const ends = new Set<string>()
    seen.add(p.id)
    for (let i = 0; i < circuit.length; i++) {
      for (const next of adjacent.get(circuit[i]) ?? []) {
        if (!isPassive(next)) ends.add(next)
        else if (!seen.has(next)) {
          seen.add(next)
          circuit.push(next)
        }
      }
    }
    const networks = new Set<string>()
    for (const end of ends) {
      const device = equipment.get(owner.get(end) ?? '')
      if (device?.role === 'access') networks.add(device.networkId ?? '')
    }
    const [network] = networks
    if (networks.size === 1 && network)
      for (const id of circuit) result.set(id, network)
  }
  return result
}

/** Sorted network IDs of the circuits through each passive equipment (card badges). */
export function passiveNetworks(s: Snapshot): Map<string, string[]> {
  const byEndpoint = circuitNetworks(s)
  const owner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId]))
  const sets = new Map<string, Set<string>>()
  for (const [endpoint, network] of byEndpoint) {
    const id = owner.get(endpoint)!
    sets.set(id, (sets.get(id) ?? new Set()).add(network))
  }
  return new Map([...sets].map(([id, set]) => [id, [...set].sort()]))
}

/**
 * Equipment shown for a network filter: that network's active devices plus
 * passive equipment carrying at least one of its circuits. `reveal` forces
 * extra equipment (a selected route) visible. No network means everything.
 * Never affects what a trace finds.
 */
export function visibleEquipment(
  s: Snapshot,
  networkId: string | undefined,
  reveal: Iterable<string> = [],
): Set<string> {
  if (!networkId) return new Set(s.equipment.map((e) => e.id))
  const badges = passiveNetworks(s)
  const shown = new Set<string>(reveal)
  for (const e of s.equipment) {
    if (
      e.role === 'passive'
        ? badges.get(e.id)?.includes(networkId)
        : e.networkId === networkId
    )
      shown.add(e.id)
  }
  return shown
}
