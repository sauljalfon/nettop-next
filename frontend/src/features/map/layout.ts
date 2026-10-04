import type { Snapshot } from '../../shared/types'

export interface Position {
  x: number
  y: number
}

export const COLUMN_WIDTH = 320
export const ROW_HEIGHT = 140

/**
 * Deterministic first layout. Column 0: access switches. Passive equipment in
 * the column equal to its minimum cable distance (in equipment hops, through
 * passive equipment only) from any access switch. AGG/BB in the column after the
 * last passive one. Equipment not reachable from an access switch is parked in a
 * row below. A column is ordered by the average row of its cabled neighbors in
 * the previous column, then by name. Returns positions only for equipment absent
 * from `existing`; existing positions are never recomputed.
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
    members
      .sort(
        (a, b) =>
          key(a) - key(b) ||
          byId.get(a)!.name.localeCompare(byId.get(b)!.name) ||
          a.localeCompare(b),
      )
      .forEach((id, i) => rows.set(id, i))
  }

  const parked = s.equipment
    .filter((e) => !column.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const layoutRows = Math.max(0, ...rows.values()) + 1
  const placed = new Map<string, Position>()
  for (const [id, row] of rows)
    placed.set(id, { x: column.get(id)! * COLUMN_WIDTH, y: row * ROW_HEIGHT })
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
