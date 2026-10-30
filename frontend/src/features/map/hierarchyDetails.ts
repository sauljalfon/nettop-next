import { equipmentWalks, type WalkStep } from './walks'
import type {
  HierarchyNodeCard,
  NetworkHierarchy,
  UplinkMark,
} from './hierarchy'
import type { TextPiece } from '../../shared/textPieces'
import { litBy } from './hierarchySelection'
import type { SnapshotIndex } from './snapshotIndex'

/** How the drawer words a switch's mark. */
export const MARK_TEXT: Record<UplinkMark, string> = {
  chained: 'chained',
  'no-uplink': 'no uplink',
  'other-network': 'other network',
}

/** The card a key stands for: a node card, or a tier card (a top or a mid AGG). */
export type CardRef =
  { kind: 'node'; card: HierarchyNodeCard } | { kind: 'tier'; id: string }

export function cardByKey(
  h: NetworkHierarchy,
  key: string | undefined,
): CardRef | undefined {
  if (key === undefined) return undefined
  for (const g of h.groups) {
    const card = g.nodes.find((c) => c.key === key)
    if (card) return { kind: 'node', card }
  }
  if (h.topIds.includes(key) || h.aggIds.includes(key))
    return { kind: 'tier', id: key }
  return undefined
}

export interface SwitchRow {
  id: string
  /** 0 for a switch with no parent on this card; one more under each parent. */
  depth: number
  /** Where it goes: its uplinks' far switches, else the switches it hangs under. */
  toIds: string[]
  /** Only another network's switches are reached (no uplink, no chain). */
  other?: { farId: string; networkId: string }[]
  mark?: UplinkMark
}

const nameOf = (index: SnapshotIndex, id: string) =>
  index.equipment.get(id)?.name ?? id
const byName = (index: SnapshotIndex) => (a: string, b: string) =>
  nameOf(index, a).localeCompare(nameOf(index, b)) || a.localeCompare(b)

/**
 * The switches of a node card, each chained one under its parent (the first by
 * name that is on this card), with where it goes and its mark.
 */
export function nodeRows(
  h: NetworkHierarchy,
  index: SnapshotIndex,
  card: HierarchyNodeCard,
): SwitchRow[] {
  const order = byName(index)
  const here = new Set(card.switchIds)
  const children = new Map<string, string[]>()
  const roots: string[] = []
  for (const id of [...card.switchIds].sort(order)) {
    const parent = [...(h.switches.get(id)?.parents ?? [])]
      .sort(order)
      .find((p) => here.has(p) && p !== id)
    if (parent === undefined) roots.push(id)
    else children.set(parent, [...(children.get(parent) ?? []), id])
  }
  const rows: SwitchRow[] = []
  const seen = new Set<string>()
  const visit = (id: string, depth: number) => {
    if (seen.has(id)) return
    seen.add(id)
    const s = h.switches.get(id)
    const uplinks = [...new Set((s?.uplinks ?? []).map((c) => c.farId))].sort(
      order,
    )
    const other = new Map<string, string>()
    for (const c of s?.otherNetwork ?? [])
      other.set(c.farId, index.equipment.get(c.farId)?.networkId ?? '')
    rows.push({
      id,
      depth,
      toIds: uplinks.length ? uplinks : [...(s?.parents ?? [])].sort(order),
      other:
        uplinks.length === 0 && !s?.parents.length && other.size
          ? [...other].map(([farId, networkId]) => ({ farId, networkId }))
          : undefined,
      mark: s?.mark,
    })
    for (const c of children.get(id) ?? []) visit(c, depth + 1)
  }
  for (const id of roots) visit(id, 0)
  // A loop of switches that hang under each other has no root: list them flat.
  for (const id of [...card.switchIds].sort(order)) visit(id, 0)
  return rows
}

export interface SwitchWalk {
  /** The endpoint it starts from, on the switch. */
  start: string
  /** The far switch port. */
  end: string
  farId: string
  /** The passives it passes, in order; empty is "direct". */
  via: WalkStep[]
}

/** Every walk from a switch that reaches another switch, by far switch name. */
export function switchWalks(
  index: SnapshotIndex,
  switchId: string,
): SwitchWalk[] {
  const order = byName(index)
  return equipmentWalks(index, switchId)
    .flatMap((w) =>
      w.farId !== undefined && w.farId !== switchId
        ? [
            {
              start: w.start,
              end: w.end.endpointId,
              farId: w.farId,
              via: w.via,
            },
          ]
        : [],
    )
    .sort((a, b) => order(a.farId, b.farId) || a.start.localeCompare(b.start))
}

/** One step of a way up, from the device toward the tops. */
export type WayStep =
  | { kind: 'port'; endpointId: string }
  | {
      kind: 'passive'
      equipmentId: string
      endpointId: string
      place: string
    }
  | {
      kind: 'device'
      equipmentId: string
      fault?: 'chained only' | 'other network'
    }
  | { kind: 'tops'; ids: string[] }
  | { kind: 'gap'; text: TextPiece[] }

/**
 * The ways up of an access switch or a mid AGG, one row per circuit of
 * `NetworkHierarchy.ups`: its port, the passives passed (each with its jack),
 * the device reached, then the tops that AGG reaches, or a gap. A chained switch
 * continues through its parent's ways up (their first port is not repeated).
 * A top, a passive or an unknown ID has none.
 */
export function wayUp(
  hierarchies: ReadonlyMap<string, NetworkHierarchy>,
  index: SnapshotIndex,
  id: string,
): WayStep[][] {
  for (const h of hierarchies.values()) {
    if (h.switches.has(id) || h.aggIds.includes(id)) return rowsOf(h, index, id)
  }
  return []
}

function rowsOf(
  h: NetworkHierarchy,
  index: SnapshotIndex,
  id: string,
  seen = new Set<string>(),
): WayStep[][] {
  if (seen.has(id)) return []
  seen.add(id)
  const own = h.switches.get(id)
  const isAgg = h.aggIds.includes(id)
  let ups = h.ups.get(id) ?? []
  let fault: 'chained only' | 'other network' | undefined
  if (own?.mark === 'chained') fault = 'chained only'
  else if (own?.mark === 'other-network') {
    ups = own.otherNetwork
    fault = 'other network'
  }
  if (ups.length === 0)
    return [
      [
        {
          kind: 'gap',
          text: [
            { text: isAgg ? 'No BB uplink' : 'No uplink · no port cabled' },
          ],
        },
      ],
    ]
  const rows: WayStep[][] = []
  for (const c of ups) {
    const head: WayStep[] = [
      { kind: 'port', endpointId: c.start },
      ...c.via.map((v): WayStep => ({
        kind: 'passive',
        equipmentId: v.equipmentId,
        endpointId: v.endpointId,
        place: v.place,
      })),
      { kind: 'device', equipmentId: c.farId, ...(fault ? { fault } : {}) },
    ]
    if (fault === 'other network' || h.topIds.includes(c.farId)) rows.push(head)
    else if (h.aggIds.includes(c.farId)) {
      const tops = [...new Set((h.ups.get(c.farId) ?? []).map((u) => u.farId))]
      rows.push([
        ...head,
        tops.length > 0
          ? { kind: 'tops', ids: tops }
          : {
              kind: 'gap',
              text: [
                { name: nameOf(index, c.farId) },
                { text: ' has no BB uplink' },
              ],
            },
      ])
    } else {
      const onward = rowsOf(h, index, c.farId, seen)
      if (onward.length === 0) rows.push(head)
      for (const r of onward) rows.push([...head, ...r.slice(1)])
    }
  }
  return rows
}

export interface CableRow {
  endpointId: string
  linkId: string
  farEndpointId: string
  /** The device or passive at the other end of the cable. */
  farEquipmentId: string
}

/** Each cabled port of an equipment with the jack at the other end of its cable, in port order. */
export function cables(index: SnapshotIndex, id: string): CableRow[] {
  const ports = [...(index.lookup.byEquipment.get(id) ?? [])]
  const side = (p: { side?: string }) => (p.side === 'rear' ? 1 : 0)
  ports.sort(
    (a, b) =>
      (a.position ?? Infinity) - (b.position ?? Infinity) ||
      side(a) - side(b) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }) ||
      a.id.localeCompare(b.id),
  )
  return ports.flatMap((p) => {
    const cable = index.cableByEndpoint.get(p.id)
    const far = cable && index.owner.get(cable.farEndpointId)
    return cable && far
      ? [
          {
            endpointId: p.id,
            linkId: cable.linkId,
            farEndpointId: cable.farEndpointId,
            farEquipmentId: far,
          },
        ]
      : []
  })
}

/**
 * What a passive carries: how many circuits of which network run through it,
 * on the network its selection lights. Undefined when none does.
 */
export function passiveSentence(
  hierarchies: ReadonlyMap<string, NetworkHierarchy>,
  index: SnapshotIndex,
  id: string,
): TextPiece[] | undefined {
  if (index.equipment.get(id)?.role !== 'passive') return undefined
  const networkId = litBy(hierarchies, index, {
    kind: 'equipment',
    id,
  }).networkId
  const h = networkId === undefined ? undefined : hierarchies.get(networkId)
  if (!h) return undefined
  const through = new Set<string>()
  for (const circuits of h.ups.values())
    for (const c of circuits)
      if (c.via.some((v) => v.equipmentId === id))
        through.add([...c.linkIds].sort().join('|'))
  if (through.size === 0) return undefined
  return [
    {
      text: `${through.size} ${through.size === 1 ? 'circuit' : 'circuits'} of `,
    },
    { name: index.networkNames.get(h.networkId) ?? h.networkId },
    { text: through.size === 1 ? ' runs through it.' : ' run through it.' },
  ]
}
