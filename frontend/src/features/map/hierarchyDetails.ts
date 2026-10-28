import { equipmentWalks, type FocusStep } from './focus'
import type {
  HierarchyNodeCard,
  NetworkHierarchy,
  UplinkMark,
} from './hierarchy'
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
  via: FocusStep[]
}

/** Every walk from a switch that reaches another switch, by far switch name; read like Focus. */
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

export interface TierLink {
  kind: 'up' | 'down' | 'peer link'
  otherId: string
  /** The port on this card's equipment. */
  mine: string
  /** The port on the other. */
  theirs: string
  via: FocusStep[]
}

const KIND_ORDER = { up: 0, down: 1, 'peer link': 2 } as const

/** A tier card's cables to other tier equipment, one per circuit. */
export function tierLinks(
  h: NetworkHierarchy,
  index: SnapshotIndex,
  id: string,
): TierLink[] {
  const order = byName(index)
  const out: TierLink[] = []
  for (const l of h.lines) {
    if (l.a !== id && l.b !== id) continue
    const mineIsA = l.a === id
    const kind: TierLink['kind'] =
      l.kind === 'peer' ? 'peer link' : mineIsA ? 'down' : 'up'
    for (const c of l.circuits)
      out.push({
        kind,
        otherId: mineIsA ? l.b : l.a,
        mine: mineIsA ? c.start : c.end,
        theirs: mineIsA ? c.end : c.start,
        via: c.via,
      })
  }
  return out.sort(
    (x, y) =>
      KIND_ORDER[x.kind] - KIND_ORDER[y.kind] ||
      order(x.otherId, y.otherId) ||
      x.mine.localeCompare(y.mine),
  )
}

/** What hangs under a tier card: its group's nodes and switches, and the AGGs it shares them with. */
export function tierUnder(
  h: NetworkHierarchy,
  id: string,
): { nodes: number; switches: number; sharedWith: string[] } | undefined {
  const g = h.groups.find((g) =>
    g.kind === 'aggs' ? g.aggIds.includes(id) : g.topIds.includes(id),
  )
  if (!g) return undefined
  return {
    nodes: g.nodes.length,
    switches: g.switches,
    sharedWith: g.aggIds.filter((a) => a !== id),
  }
}
