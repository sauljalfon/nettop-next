import { comparePorts, hasSide } from '../../shared/ports'
import type { Endpoint } from '../../shared/types'
import { followPort, type WalkEnd } from '../paths/follow'
import type { SnapshotIndex } from './snapshotIndex'

export type FocusSide = 'left' | 'right'

/** One passive equipment a circuit passes through, and where (never a joined string). */
export interface FocusStep {
  equipmentId: string
  /** The position without its side, as the walk sheet reads it: "1", "3C/5". */
  place: string
}

export interface FocusCircuit {
  /** The endpoint the walk starts from (on the center, or on a ring's equipment). */
  start: string
  /** The far switch port. */
  end: string
  via: FocusStep[]
  /** Every cable and bridge of the walk, in order. */
  linkIds: string[]
}

export interface FocusNeighbour {
  equipmentId: string
  side: FocusSide
  circuits: FocusCircuit[]
}

/** More neighbours than the cap, shown as one card per node and side. */
export interface FocusGroup {
  nodeId?: string
  side: FocusSide
  equipmentIds: string[]
  /** The center or earlier ring's equipment whose walks reached the members, by name then ID. */
  fromIds: string[]
  /** The circuits that reach the members. */
  circuitCount: number
}

export interface FocusRing {
  neighbours: FocusNeighbour[]
  groups: FocusGroup[]
}

/** A cabled walk from the center that reaches no switch (uncabled endpoints are not listed). */
export interface FocusEnd {
  start: string
  end: WalkEnd
  via: FocusStep[]
}

export interface Focus {
  centerId: string
  hops: number
  rings: FocusRing[]
  ends: FocusEnd[]
}

/** A position as the walk sheet reads it: "3C/5" on an HDF, "1" on a panel; a port's label otherwise. */
export function endpointPlace(index: SnapshotIndex, p: Endpoint): string {
  if (p.position === undefined || !p.side) return p.label
  const sub = index.lookup.subpanels.get(p.subpanelId ?? '')
  return sub ? `${sub.row}${sub.column}/${p.position}` : `${p.position}`
}

export const DEFAULT_CAP = 24
const MAX_HOPS = 3

/**
 * The neighbourhood of one equipment, read only through `followPort`: its
 * cables and bridges, nothing inferred from names, positions or roles beyond
 * the explicit role that places a card left or right. Pure; it never feeds a
 * trace. Ring 1 is what the center's own walks reach; ring k+1 is what the walks
 * from every equipment of ring k reach, minus the center and earlier rings.
 * A ring over `cap` neighbours is given as groups per node and side instead.
 */
export function buildFocus(
  index: SnapshotIndex,
  centerId: string,
  opts: { hops?: number; cap?: number } = {},
): Focus {
  const hops = Number.isFinite(opts.hops)
    ? Math.min(MAX_HOPS, Math.max(1, Math.floor(opts.hops!)))
    : 1
  const cap = opts.cap ?? DEFAULT_CAP
  const empty: Focus = { centerId, hops, rings: [], ends: [] }
  if (!index.equipment.has(centerId)) return empty

  const nameOf = (id: string) => index.equipment.get(id)?.name ?? id
  const byName = (a: string, b: string) =>
    nameOf(a).localeCompare(nameOf(b)) || a.localeCompare(b)
  const endpoint = (id: string) => index.lookup.endpoints.get(id)

  const place = (p: Endpoint) => endpointPlace(index, p)

  const compareEndpoints = (aId: string, bId: string) => {
    const a = endpoint(aId)
    const b = endpoint(bId)
    if (!a || !b) return aId.localeCompare(bId)
    const sa = hasSide(a)
    const sb = hasSide(b)
    if (sa !== sb) return sa ? 1 : -1
    if (!sa) return comparePorts(a, b) || a.id.localeCompare(b.id)
    const ra = index.lookup.subpanels.get(a.subpanelId ?? '')
    const rb = index.lookup.subpanels.get(b.subpanelId ?? '')
    return (
      (ra?.row ?? 0) - (rb?.row ?? 0) ||
      (ra?.column ?? '').localeCompare(rb?.column ?? '') ||
      (a.position ?? 0) - (b.position ?? 0) ||
      (a.side === b.side ? 0 : a.side === 'front' ? -1 : 1) ||
      a.id.localeCompare(b.id)
    )
  }
  const compareStarts = (a: string, b: string) => {
    const oa = index.owner.get(a) ?? ''
    const ob = index.owner.get(b) ?? ''
    return oa === ob ? compareEndpoints(a, b) : byName(oa, ob)
  }

  /** Every walk from the equipment's endpoints, with the passives passed on the way. */
  const walks = (equipmentId: string) => {
    const result: {
      start: string
      end: WalkEnd
      via: FocusStep[]
      linkIds: string[]
      farId?: string
    }[] = []
    for (const p of index.lookup.byEquipment.get(equipmentId) ?? []) {
      const walk = followPort(index, p.id)
      const via: FocusStep[] = []
      for (const hop of walk.hops) {
        if (hop.kind !== 'cable') continue
        const entered = endpoint(hop.to)
        if (!entered || entered.equipmentId === equipmentId) continue
        if (index.equipment.get(entered.equipmentId)?.kind === 'switch')
          continue
        via.push({ equipmentId: entered.equipmentId, place: place(entered) })
      }
      const endOwner = index.owner.get(walk.end.endpointId)
      const isSwitchEnd =
        walk.end.kind === 'switch' || walk.end.kind === 'destination'
      // The equipment holding a dead end is named by the end itself.
      if (!isSwitchEnd && via.at(-1)?.equipmentId === endOwner) via.pop()
      result.push({
        start: p.id,
        end: walk.end,
        via,
        linkIds: walk.hops.map((h) => h.linkId),
        farId: isSwitchEnd ? endOwner : undefined,
      })
    }
    return result
  }

  const sideOf = (equipmentId: string, first: FocusCircuit): FocusSide => {
    const role = index.equipment.get(equipmentId)?.role
    if (role === 'aggregation' || role === 'backbone') return 'right'
    if (role === 'access') return 'left'
    return endpoint(first.start)?.side === 'front' ? 'left' : 'right'
  }

  const ends: FocusEnd[] = []
  let known = new Set([centerId])
  let frontier = [centerId]
  const rings: FocusRing[] = []
  for (let ring = 1; ring <= hops && frontier.length > 0; ring++) {
    const found = new Map<string, FocusCircuit[]>()
    for (const from of frontier)
      for (const w of walks(from)) {
        if (w.farId === undefined) {
          // An uncabled endpoint is not a circuit, so it is not an end.
          if (ring === 1 && w.end.kind !== 'none')
            ends.push({ start: w.start, end: w.end, via: w.via })
          continue
        }
        if (known.has(w.farId)) continue
        const circuit: FocusCircuit = {
          start: w.start,
          end: w.end.endpointId,
          via: w.via,
          linkIds: w.linkIds,
        }
        const list = found.get(w.farId)
        if (list) list.push(circuit)
        else found.set(w.farId, [circuit])
      }
    const neighbours: FocusNeighbour[] = [...found].map(([id, circuits]) => {
      circuits.sort((a, b) => compareStarts(a.start, b.start))
      return { equipmentId: id, side: sideOf(id, circuits[0]), circuits }
    })
    neighbours.sort(
      (a, b) =>
        (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1) ||
        byName(a.equipmentId, b.equipmentId),
    )
    if (neighbours.length === 0) break
    ends.sort((a, b) => compareStarts(a.start, b.start))

    if (neighbours.length > cap) {
      const groups = new Map<string, FocusGroup>()
      for (const n of neighbours) {
        const nodeId = index.places.get(n.equipmentId)?.nodeId
        const key = `${nodeId ?? ''}\u0000${n.side}`
        let g = groups.get(key)
        if (g) g.equipmentIds.push(n.equipmentId)
        else
          groups.set(
            key,
            (g = {
              nodeId,
              side: n.side,
              equipmentIds: [n.equipmentId],
              fromIds: [],
              circuitCount: 0,
            }),
          )
        g.circuitCount += n.circuits.length
        for (const c of n.circuits) {
          const from = index.owner.get(c.start)
          if (from && !g.fromIds.includes(from)) g.fromIds.push(from)
        }
      }
      for (const g of groups.values()) g.fromIds.sort(byName)
      const nodeName = (g: FocusGroup) =>
        g.nodeId ? (index.nodes.get(g.nodeId)?.name ?? g.nodeId) : '￿'
      rings.push({
        neighbours: [],
        groups: [...groups.values()].sort(
          (a, b) =>
            nodeName(a).localeCompare(nodeName(b)) ||
            (a.nodeId ?? '').localeCompare(b.nodeId ?? '') ||
            (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1),
        ),
      })
    } else rings.push({ neighbours, groups: [] })

    frontier = neighbours.map((n) => n.equipmentId)
    known = new Set([...known, ...frontier])
  }
  return { centerId, hops, rings, ends }
}
