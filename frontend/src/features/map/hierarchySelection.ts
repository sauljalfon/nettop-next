import type { Circuit, NetworkHierarchy } from './hierarchy'
import type { SnapshotIndex } from './snapshotIndex'

/** What the tree is asked to show: a device (Show on map) or a node card of one network. */
export type Selection =
  | { kind: 'equipment'; id: string }
  | { kind: 'card'; networkId: string; key: string }

/** What a selection lights on one network's tree. Roles and IDs only. */
export interface Lit {
  /** Undefined: the selection is on no network's tree. */
  networkId?: string
  /** Card keys. */
  cards: ReadonlySet<string>
  /** Group keys. */
  frames: ReadonlySet<string>
  aggs: ReadonlySet<string>
  tops: ReadonlySet<string>
  /** Access switches marked in open cards. */
  switches: ReadonlySet<string>
  /** Dependents that lose every way up if the selection fails. */
  cutOff: ReadonlySet<string>
  openCards: string[]
  /** A key of hierarchyLayout's boxes (a card key or a top ID) or frames (a group key). */
  scrollTo?: string
}

type Hierarchies = ReadonlyMap<string, NetworkHierarchy>

const empty = (): Lit => ({
  cards: new Set(),
  frames: new Set(),
  aggs: new Set(),
  tops: new Set(),
  switches: new Set(),
  cutOff: new Set(),
  openCards: [],
})

/** An end is a top, or a mid AGG that cannot reach one. */
const isEnd = (h: NetworkHierarchy, id: string) =>
  h.topIds.includes(id) ||
  (h.topKind === 'none' ? h.aggIds.includes(id) : h.noTop.has(id))

/**
 * Everything on the way up of `id`: the devices (itself, then the far side of
 * each circuit, until an end) and the passives the circuits run through.
 */
function wayUp(h: NetworkHierarchy, id: string) {
  const nodes = new Set<string>()
  const via = new Set<string>()
  const walk = (n: string) => {
    if (nodes.has(n)) return
    nodes.add(n)
    if (isEnd(h, n)) return
    for (const c of h.ups.get(n) ?? []) {
      for (const step of c.via) via.add(step.equipmentId)
      walk(c.farId)
    }
  }
  walk(id)
  return { nodes, via }
}

/** Whether `id` has a way to an end that avoids `banned` (a device or a passive). */
function reachesEnd(h: NetworkHierarchy, id: string, banned?: string) {
  const seen = new Set<string>()
  const go = (n: string): boolean => {
    if (n === banned) return false
    if (isEnd(h, n)) return true
    if (seen.has(n)) return false
    seen.add(n)
    return (h.ups.get(n) ?? []).some(
      (c: Circuit) =>
        !c.via.some((step) => step.equipmentId === banned) && go(c.farId),
    )
  }
  return go(id)
}

function dependentsIn(h: NetworkHierarchy, id: string) {
  const out: { id: string; cutOff: boolean }[] = []
  for (const s of h.ups.keys()) {
    if (s === id) continue
    const up = wayUp(h, s)
    if (!up.nodes.has(id) && !up.via.has(id)) continue
    if (!reachesEnd(h, s)) continue
    out.push({ id: s, cutOff: !reachesEnd(h, s, id) })
  }
  return out
}

/**
 * The access switches and AGGs whose way up passes `id` (a device, or a passive
 * anywhere on a circuit), cut off first, then by name. `cutOff`: they have a way
 * to an end now and none that avoids `id`. A device with no way up is not listed.
 */
export function dependents(
  hierarchies: Hierarchies,
  index: SnapshotIndex,
  id: string,
): { id: string; cutOff: boolean }[] {
  const name = (x: string) => index.equipment.get(x)?.name ?? x
  return [...hierarchies.values()]
    .flatMap((h) => dependentsIn(h, id))
    .sort(
      (a, b) =>
        Number(b.cutOff) - Number(a.cutOff) ||
        name(a.id).localeCompare(name(b.id)) ||
        a.id.localeCompare(b.id),
    )
}

/** What a selection lights: the selected thing, its way up and what depends on it. */
export function litBy(
  hierarchies: Hierarchies,
  index: SnapshotIndex,
  selection: Selection,
): Lit {
  if (selection.kind === 'card') {
    const h = hierarchies.get(selection.networkId)
    const card = h?.groups
      .flatMap((g) => g.nodes)
      .find((c) => c.key === selection.key)
    if (!h || !card) return empty()
    const l = start(h)
    light(h, l, card.switchIds)
    l.openCards.push(card.key)
    l.scrollTo = card.key
    return finish(l)
  }

  const { id } = selection
  for (const h of hierarchies.values()) {
    if (h.switches.has(id)) {
      const l = start(h)
      const deps = dependentsIn(h, id)
      light(h, l, [
        id,
        ...deps.filter((d) => h.switches.has(d.id)).map((d) => d.id),
      ])
      cut(l, deps)
      const card = cardOf(h).get(id)
      if (card) {
        l.openCards.push(card.key)
        l.scrollTo = card.key
      }
      return finish(l)
    }
    if (h.aggIds.includes(id)) {
      const l = start(h)
      const deps = dependentsIn(h, id)
      const frame = h.groups.find((g) => g.aggIds.includes(id))
      l.aggs.add(id)
      if (frame) {
        l.frames.add(frame.key)
        l.scrollTo = frame.key
      }
      for (const t of wayUp(h, id).nodes)
        if (h.topIds.includes(t)) l.tops.add(t)
      light(
        h,
        l,
        deps.filter((d) => h.switches.has(d.id)).map((d) => d.id),
      )
      cut(l, deps)
      return finish(l)
    }
    if (h.topIds.includes(id)) {
      const l = start(h)
      const cards = cardOf(h)
      l.tops.add(id)
      l.scrollTo = id
      for (const [s, circuits] of h.ups) {
        if (!circuits.some((c) => c.farId === id)) continue
        if (h.switches.has(s)) {
          const frame = cards.get(s)?.groupKey
          if (frame === 'top') l.frames.add(frame)
        } else {
          l.aggs.add(s)
          const frame = h.groups.find((g) => g.aggIds.includes(s))
          if (frame) l.frames.add(frame.key)
        }
      }
      cut(l, dependentsIn(h, id))
      return finish(l)
    }
  }

  if (index.equipment.get(id)?.role === 'passive')
    return passive(hierarchies, index, id)
  return empty()
}

/** The network most of a passive's dependents are on (a tie goes to the first), and its switches. */
function passive(
  hierarchies: Hierarchies,
  index: SnapshotIndex,
  id: string,
): Lit {
  let best:
    { h: NetworkHierarchy; deps: { id: string; cutOff: boolean }[] } | undefined
  for (const h of hierarchies.values()) {
    const deps = dependentsIn(h, id)
    if (deps.length > (best?.deps.length ?? 0)) best = { h, deps }
  }
  if (!best) return empty()
  const { h, deps } = best
  const l = start(h)
  const switches = deps.filter((d) => h.switches.has(d.id)).map((d) => d.id)
  light(h, l, switches)
  cut(l, deps)
  const cards = cardOf(h)
  const own = new Set(
    switches.map((s) => cards.get(s)?.key).filter((k) => k !== undefined),
  )
  if (own.size <= 3) l.openCards.push(...own)
  l.scrollTo = h.groups
    .flatMap((g) => g.nodes)
    .find((c) => l.cards.has(c.key))?.key
  return finish(l)
}

// The sets are filled while building, then handed out read-only.
type Building = Lit & {
  cards: Set<string>
  frames: Set<string>
  aggs: Set<string>
  tops: Set<string>
  switches: Set<string>
  cutOff: Set<string>
}
const start = (h: NetworkHierarchy): Building => ({
  ...(empty() as Building),
  networkId: h.networkId,
})
const finish = (l: Building): Lit => l
const cut = (l: Building, deps: { id: string; cutOff: boolean }[]) => {
  for (const d of deps) if (d.cutOff) l.cutOff.add(d.id)
}

function cardOf(h: NetworkHierarchy) {
  const map = new Map<string, { key: string; groupKey: string }>()
  for (const g of h.groups)
    for (const c of g.nodes) for (const s of c.switchIds) map.set(s, c)
  return map
}

/**
 * Lights each access switch: it, the access switches on its way up (and their
 * cards and frames), its AGGs and the tops on its way up.
 */
function light(h: NetworkHierarchy, l: Building, switchIds: Iterable<string>) {
  const cards = cardOf(h)
  for (const s of switchIds)
    for (const n of wayUp(h, s).nodes) {
      const info = h.switches.get(n)
      if (info) {
        l.switches.add(n)
        const card = cards.get(n)
        if (card) {
          l.cards.add(card.key)
          l.frames.add(card.groupKey)
        }
        for (const a of info.aggIds) l.aggs.add(a)
      } else if (h.aggIds.includes(n)) l.aggs.add(n)
      else if (h.topIds.includes(n)) l.tops.add(n)
    }
}
