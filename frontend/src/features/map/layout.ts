import type { Snapshot } from '../../shared/types'

export interface Position {
  x: number
  y: number
}

export const COLUMN_WIDTH = 320
export const ROW_HEIGHT = 200
/** A layer with more cards than this is wrapped into side-by-side sub-columns. */
export const WRAP_THRESHOLD = 40
/** Extra space between layers (not between a layer's sub-columns) once any layer is wrapped. */
export const LAYER_GAP = 200
/** The canvas's width / height the wrapped map is shaped for (a 1440 × 900 window). */
export const CANVAS_ASPECT = 1.6

/**
 * Deterministic first layout. Column 0: access switches. Passive equipment in
 * the column equal to its minimum cable distance (in equipment hops, through
 * passive equipment only) from any access switch. AGG/BB in the column after the
 * last passive one. Equipment not reachable from an access switch is parked in a
 * row below. A column is ordered by the average row of its cabled neighbors in
 * the previous column, then by name. Returns positions only for equipment absent
 * from `existing`; existing positions are never recomputed.
 *
 * A layer with more than `WRAP_THRESHOLD` cards is grouped by node (then site)
 * and wrapped into sub-columns, so the whole map is about the canvas's shape
 * rather than one tall strip; a group is kept in one sub-column when it fits.
 * When no layer is that large the layout is exactly the plain one above.
 */
export function layeredLayout(
  s: Snapshot,
  existing: ReadonlyMap<string, Position>,
): Map<string, Position> {
  const owner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId]))
  const neighbors = new Map<string, Set<string>>(
    s.equipment.map((e) => [e.id, new Set()]),
  )
  for (const l of s.links) {
    if (l.kind !== 'cable') continue
    const a = owner.get(l.a)
    const b = owner.get(l.b)
    if (!a || !b || a === b) continue
    neighbors.get(a)?.add(b)
    neighbors.get(b)?.add(a)
  }
  const byId = new Map(s.equipment.map((e) => [e.id, e]))
  const access = s.equipment.filter((e) => e.role === 'access').map((e) => e.id)

  // Breadth-first over passive equipment from the access switches.
  const column = new Map<string, number>(access.map((id) => [id, 0]))
  const reachedActive = new Set<string>()
  for (let frontier = access; frontier.length;) {
    const next: string[] = []
    for (const id of frontier)
      for (const n of neighbors.get(id) ?? []) {
        const e = byId.get(n)!
        if (e.role === 'passive') {
          if (!column.has(n)) {
            column.set(n, column.get(id)! + 1)
            next.push(n)
          }
        } else if (e.role !== 'access') reachedActive.add(n)
      }
    frontier = next
  }
  const lastPassive = Math.max(
    0,
    ...[...column]
      .filter(([id]) => byId.get(id)!.role === 'passive')
      .map(([, c]) => c),
  )
  for (const id of reachedActive) column.set(id, lastPassive + 1)

  const rows = new Map<string, number>()
  const columns = [...new Set(column.values())].sort((a, b) => a - b)
  const nodeOf = groupOf(s)
  const layers = new Map<number, string[]>()
  for (const c of columns) {
    const members = [...column].filter(([, v]) => v === c).map(([id]) => id)
    const key = (id: string) => {
      const rowsOfPrev = [...(neighbors.get(id) ?? [])]
        .filter((n) => column.get(n) === c - 1)
        .map((n) => rows.get(n)!)
      return rowsOfPrev.length
        ? rowsOfPrev.reduce((a, b) => a + b, 0) / rowsOfPrev.length
        : 0
    }
    members.sort(
      (a, b) =>
        key(a) - key(b) ||
        byId.get(a)!.name.localeCompare(byId.get(b)!.name) ||
        a.localeCompare(b),
    )
    const ordered =
      members.length > WRAP_THRESHOLD
        ? groupedOrder(members, nodeOf, key)
        : members
    ordered.forEach((id, i) => rows.set(id, i))
    layers.set(c, ordered)
  }

  const parked = s.equipment
    .filter((e) => !column.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const placed = new Map<string, Position>()
  let layoutRows: number
  if ([...layers.values()].every((l) => l.length <= WRAP_THRESHOLD)) {
    layoutRows = Math.max(0, ...rows.values()) + 1
    for (const [id, row] of rows)
      placed.set(id, { x: column.get(id)! * COLUMN_WIDTH, y: row * ROW_HEIGHT })
  } else {
    layoutRows = wrapLayers(columns, layers, nodeOf, placed)
  }
  parked.forEach((e, i) =>
    placed.set(e.id, { x: i * COLUMN_WIDTH, y: (layoutRows + 1) * ROW_HEIGHT }),
  )

  // Only new cards get a position, and never on top of an existing card.
  const taken = new Set([...existing.values()].map((p) => `${p.x},${p.y}`))
  const result = new Map<string, Position>()
  for (const e of s.equipment) {
    if (existing.has(e.id)) continue
    const p = { ...placed.get(e.id)! }
    while (taken.has(`${p.x},${p.y}`)) p.y += ROW_HEIGHT
    taken.add(`${p.x},${p.y}`)
    result.set(e.id, p)
  }
  return result
}

/** Group key of every equipment: its site and node, or "" when it has no rack. Never inferred from names. */
function groupOf(s: Snapshot): Map<string, { key: string; label: string }> {
  const nodeOfRack = new Map((s.racks ?? []).map((r) => [r.id, r.nodeId]))
  const nodes = new Map((s.nodes ?? []).map((n) => [n.id, n]))
  const sites = new Map((s.sites ?? []).map((x) => [x.id, x.name]))
  const out = new Map<string, { key: string; label: string }>()
  for (const e of s.equipment) {
    const node = nodes.get(nodeOfRack.get(e.rackId ?? '') ?? '')
    out.set(
      e.id,
      node
        ? {
            key: node.id,
            // Sorts by site, then node name; the ID breaks ties.
            label: `${sites.get(node.siteId) ?? ''}\u0000${node.name}\u0000${node.id}`,
          }
        : { key: '', label: '\uffff' },
    )
  }
  return out
}

/**
 * A big layer's order: cards grouped by node, the groups ordered by the average
 * of their cards' neighbor rows (the plain key), then by site and node name; each
 * group keeps the plain order (neighbor rows, then name) that `members` is in.
 */
function groupedOrder(
  members: readonly string[],
  groupOf: ReadonlyMap<string, { key: string; label: string }>,
  key: (id: string) => number,
): string[] {
  const groups = new Map<
    string,
    { label: string; ids: string[]; sum: number }
  >()
  for (const id of members) {
    const g = groupOf.get(id)!
    const group = groups.get(g.key) ?? { label: g.label, ids: [], sum: 0 }
    group.ids.push(id)
    group.sum += key(id)
    groups.set(g.key, group)
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        a.sum / a.ids.length - b.sum / b.ids.length ||
        a.label.localeCompare(b.label),
    )
    .flatMap((g) => g.ids)
}

/**
 * Places a wrapped map. Every layer is packed into sub-columns of at most R
 * rows (a group that fits goes whole into one sub-column, never split), and R is
 * the one that makes the whole map closest to the canvas's aspect. Layers sit
 * left to right with `LAYER_GAP` between them. Returns the tallest sub-column's
 * row count.
 */
function wrapLayers(
  columns: readonly number[],
  layers: ReadonlyMap<number, string[]>,
  groupOf: ReadonlyMap<string, { key: string; label: string }>,
  placed: Map<string, Position>,
): number {
  type Slot = { sub: number; row: number }
  const pack = (ids: readonly string[], cap: number) => {
    const slots = new Map<string, Slot>()
    let sub = 0
    let used = 0
    let i = 0
    let groups = 0
    let split = 0
    while (i < ids.length) {
      const key = groupOf.get(ids[i])!.key
      let end = i
      while (end < ids.length && groupOf.get(ids[end])!.key === key) end++
      const size = end - i
      groups++
      if (size <= cap && used + size > cap) {
        sub++
        used = 0
      }
      const startSub = sub
      for (; i < end; i++) {
        if (used === cap) {
          sub++
          used = 0
        }
        slots.set(ids[i], { sub, row: used++ })
      }
      if (sub !== startSub) split++
    }
    return {
      slots,
      groups,
      split,
      subs: sub + 1,
      rows: Math.min(
        cap,
        Math.max(used, ...[...slots.values()].map((x) => x.row + 1)),
      ),
    }
  }
  const sized = columns.filter((c) => layers.get(c)!.length > WRAP_THRESHOLD)
  const biggest = Math.max(...sized.map((c) => layers.get(c)!.length))
  // A layer that is not big stays one plain column.
  const shape = (cap: number) => {
    const packs = columns.map((c) => {
      const ids = layers.get(c)!
      return ids.length > WRAP_THRESHOLD
        ? pack(ids, cap)
        : {
            slots: new Map(ids.map((id, row) => [id, { sub: 0, row }])),
            groups: 0,
            split: 0,
            subs: 1,
            rows: ids.length,
          }
    })
    const width =
      packs.reduce((n, p) => n + p.subs * COLUMN_WIDTH, 0) +
      (columns.length - 1) * LAYER_GAP
    const rows = Math.max(...packs.map((p) => p.rows))
    // Closest to the canvas's aspect, and few groups split across sub-columns.
    const groups = packs.reduce((n, p) => n + p.groups, 0)
    const split = packs.reduce((n, p) => n + p.split, 0)
    return {
      packs,
      width,
      rows,
      error:
        Math.abs(Math.log(width / (rows * ROW_HEIGHT) / CANVAS_ASPECT)) +
        0.6 * (split / Math.max(1, groups)),
    }
  }
  let best = shape(WRAP_THRESHOLD)
  for (let cap = WRAP_THRESHOLD + 1; cap <= biggest; cap++) {
    const candidate = shape(cap)
    if (candidate.error < best.error) best = candidate
  }
  let x = 0
  columns.forEach((c, i) => {
    const { slots, subs } = best.packs[i]
    for (const [id, { sub, row }] of slots)
      placed.set(id, { x: x + sub * COLUMN_WIDTH, y: row * ROW_HEIGHT })
    x += subs * COLUMN_WIDTH + LAYER_GAP
  })
  return best.rows
}
