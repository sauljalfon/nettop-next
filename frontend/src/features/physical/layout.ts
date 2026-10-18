export interface Position {
  x: number
  y: number
}

export const NODE_WIDTH = 250
export const NODE_HEIGHT = 210
const GAP = 40
const COLUMNS = 3
/** Space between the columns of the layered layout, where the lines run. */
const COLUMN_GAP = 200
/** Up to this many unsaved nodes go on a ring; more go in a grid. */
const MAX_RING = 12

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The part of the segment inside the rectangle's interior, as the parameters
 * [t0, t1] along it (0 at `from`, 1 at `to`), or undefined when it only touches
 * or misses it (Liang–Barsky clipping).
 */
export function clipSegment(
  from: Position,
  to: Position,
  r: Rect,
): [number, number] | undefined {
  const dx = to.x - from.x
  const dy = to.y - from.y
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-dx, from.x - r.left],
    [dx, r.right - from.x],
    [-dy, from.y - r.top],
    [dy, r.bottom - from.y],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return undefined
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return undefined
      t0 = Math.max(t0, t)
    } else {
      if (t < t0) return undefined
      t1 = Math.min(t1, t)
    }
  }
  return t1 - t0 > 1e-9 ? [t0, t1] : undefined
}

/** True when the segment touches the rectangle's interior. */
export function segmentCrossesRect(
  from: Position,
  to: Position,
  r: Rect,
): boolean {
  return clipSegment(from, to, r) !== undefined
}

const rectAt = (c: Position): Rect => ({
  left: c.x - NODE_WIDTH / 2,
  top: c.y - NODE_HEIGHT / 2,
  right: c.x + NODE_WIDTH / 2,
  bottom: c.y + NODE_HEIGHT / 2,
})

/** Card centers on a ring of radius r, the first at the top, going clockwise. */
function ringCenters(n: number, r: number): Position[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) }
  })
}

/**
 * The smallest ring (in steps of 10 px) on which no two cards, with a gap, are
 * closer than a card, and no line between two centers crosses a third card. So
 * the lines of a small site never run under another card.
 */
function ringRadius(n: number): number {
  if (n <= 1) return 0
  const clear = (c: Position[]) => {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (
          Math.abs(c[i].x - c[j].x) < NODE_WIDTH + GAP &&
          Math.abs(c[i].y - c[j].y) < NODE_HEIGHT + GAP
        )
          return false
        for (let k = 0; k < n; k++)
          if (
            k !== i &&
            k !== j &&
            segmentCrossesRect(c[i], c[j], rectAt(c[k]))
          )
            return false
      }
    return true
  }
  let r = 10
  while (!clear(ringCenters(n, r))) r += 10
  return r
}

/** What the layered default arrangement needs to know about a site's nodes. */
export interface NodeGraph {
  /** Per node: active access equipment, or AGG/BB equipment (explicit roles, never names). */
  roles: ReadonlyMap<string, { access: boolean; distribution: boolean }>
  /** Pairs of nodes joined by at least one cable. */
  pairs: readonly (readonly [string, string])[]
}

/**
 * Columns by cable distance, left to right: nodes with access equipment (and no
 * AGG/BB); nodes reached only through passive corridors, one column per step of
 * distance from an access node; nodes holding AGG/BB last. Within a column the
 * order follows the average position of the cabled neighbors in the adjacent
 * columns (a few sweeps, like features/map/layout.ts), then the name. Returns
 * undefined when no cable joins two of the nodes: there is nothing to layer.
 * Positions are relative to the top-left of the first card.
 */
function layeredLayout(
  unsaved: readonly { id: string; name: string }[],
  graph: NodeGraph,
): Map<string, Position> | undefined {
  const ids = new Set(unsaved.map((n) => n.id))
  const neighbors = new Map<string, Set<string>>(
    unsaved.map((n) => [n.id, new Set()]),
  )
  let cabled = 0
  for (const [a, b] of graph.pairs) {
    if (!ids.has(a) || !ids.has(b) || a === b) continue
    neighbors.get(a)!.add(b)
    neighbors.get(b)!.add(a)
    cabled++
  }
  if (cabled === 0) return undefined

  const role = (id: string) => graph.roles.get(id)
  const column = new Map<string, number>()
  const others: string[] = []
  for (const n of unsaved) {
    const r = role(n.id)
    if (r?.distribution) continue
    if (r?.access) column.set(n.id, 0)
    else others.push(n.id)
  }
  // Distance through passive corridors from the access nodes.
  for (let frontier = [...column.keys()]; frontier.length;) {
    const next: string[] = []
    for (const id of frontier)
      for (const m of neighbors.get(id)!)
        if (!column.has(m) && !role(m)?.distribution && !role(m)?.access) {
          column.set(m, column.get(id)! + 1)
          next.push(m)
        }
    frontier = next
  }
  // Corridors no access node reaches sit in the first corridor column.
  for (const id of others) if (!column.has(id)) column.set(id, 1)
  const last = Math.max(0, ...column.values()) + 1
  for (const n of unsaved) if (role(n.id)?.distribution) column.set(n.id, last)

  const columns: string[][] = Array.from({ length: last + 1 }, () => [])
  const byName = [...unsaved] // already sorted by name, then ID
  for (const n of byName) columns[column.get(n.id)!].push(n.id)
  const nameOrder = new Map(byName.map((n, i) => [n.id, i]))

  const rowOf = new Map<string, number>()
  const place = () =>
    columns.forEach((c) => c.forEach((id, i) => rowOf.set(id, i)))
  place()
  const sweep = (c: number, from: number) => {
    const key = (id: string) => {
      const rows = [...neighbors.get(id)!]
        .filter((m) => column.get(m) === from)
        .map((m) => rowOf.get(m)!)
      return rows.length
        ? rows.reduce((x, y) => x + y, 0) / rows.length
        : rowOf.get(id)!
    }
    columns[c].sort(
      (a, b) => key(a) - key(b) || nameOrder.get(a)! - nameOrder.get(b)!,
    )
    columns[c].forEach((id, i) => rowOf.set(id, i))
  }
  for (let round = 0; round < 4; round++) {
    for (let c = columns.length - 2; c >= 0; c--) sweep(c, c + 1)
    for (let c = 1; c < columns.length; c++) sweep(c, c - 1)
  }

  // Column 0 in rows; the others beside the average height of their neighbors in the previous column.
  const pitch = NODE_HEIGHT + GAP
  const y = new Map<string, number>()
  columns[0].forEach((id, i) => y.set(id, i * pitch))
  for (let c = 1; c < columns.length; c++) {
    let floor = -Infinity
    for (const id of columns[c]) {
      const ys = [...neighbors.get(id)!]
        .filter((m) => column.get(m) === c - 1)
        .map((m) => y.get(m)!)
      const wanted = ys.length
        ? ys.reduce((a, b) => a + b, 0) / ys.length
        : Math.max(floor, 0)
      const at = Math.max(wanted, floor)
      y.set(id, at)
      floor = at + pitch
    }
  }
  // Drop the whole arrangement so its top is at 0.
  const top = Math.min(...y.values())
  return new Map(
    unsaved.map((n) => [
      n.id,
      {
        x: column.get(n.id)! * (NODE_WIDTH + COLUMN_GAP),
        y: y.get(n.id)! - top,
      },
    ]),
  )
}

/**
 * Deterministic default arrangement for nodes without a saved position. Up to
 * 12 go on a ring in name order, starting at the top and going clockwise, with
 * a radius large enough that cards never overlap and no line between two nodes
 * runs under a third; more than 12 go in columns by cable distance (`graph`),
 * or in a grid by name when no cable joins them. Either way they sit
 * clear of every saved node: below the lowest one, centered on the saved ones
 * (or on the origin when none is saved). Returns positions only for the unsaved
 * nodes; saved ones are never recomputed.
 */
export function defaultNodeLayout(
  nodes: readonly { id: string; name: string }[],
  saved: ReadonlyMap<string, Position>,
  graph?: NodeGraph,
): Map<string, Position> {
  const unsaved = nodes
    .filter((n) => !saved.has(n.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  if (unsaved.length === 0) return new Map()

  let centerX = 0
  let top = -Infinity // the smallest y the new cards may start at
  if (saved.size > 0) {
    let lowest = -Infinity
    let left = Infinity
    let right = -Infinity
    for (const p of saved.values()) {
      lowest = Math.max(lowest, p.y)
      left = Math.min(left, p.x)
      right = Math.max(right, p.x + NODE_WIDTH)
    }
    top = lowest + NODE_HEIGHT + GAP
    centerX = (left + right) / 2
  }

  if (unsaved.length > MAX_RING) {
    const layered = graph && layeredLayout(unsaved, graph)
    if (layered) {
      // Columns, centered on the saved nodes (or starting at the origin) and below them.
      const width =
        Math.max(...[...layered.values()].map((p) => p.x)) + NODE_WIDTH
      const dx = saved.size > 0 ? centerX - width / 2 : 0
      const dy = saved.size > 0 ? top : 0
      return new Map(
        [...layered].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]),
      )
    }
    const x0 =
      saved.size > 0 ? centerX - (COLUMNS * (NODE_WIDTH + GAP) - GAP) / 2 : 0
    const y0 = saved.size > 0 ? top : 0
    return new Map(
      unsaved.map((n, i) => [
        n.id,
        {
          x: x0 + (i % COLUMNS) * (NODE_WIDTH + GAP),
          y: y0 + Math.floor(i / COLUMNS) * (NODE_HEIGHT + GAP),
        },
      ]),
    )
  }

  const centers = ringCenters(unsaved.length, ringRadius(unsaved.length))
  const highest = Math.min(...centers.map((c) => c.y - NODE_HEIGHT / 2))
  const shiftY = saved.size > 0 ? top - highest : 0
  return new Map(
    unsaved.map((n, i) => [
      n.id,
      {
        x: centerX + centers[i].x - NODE_WIDTH / 2,
        y: shiftY + centers[i].y - NODE_HEIGHT / 2,
      },
    ]),
  )
}
