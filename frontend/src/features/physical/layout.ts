export interface Position {
  x: number
  y: number
}

export const NODE_WIDTH = 250
export const NODE_HEIGHT = 210
const GAP = 40
const COLUMNS = 3
/** Up to this many unsaved nodes go on a ring; more go in a grid. */
const MAX_RING = 12

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** True when the segment touches the rectangle's interior (Liang–Barsky clipping). */
export function segmentCrossesRect(
  from: Position,
  to: Position,
  r: Rect,
): boolean {
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
      if (q <= 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      t0 = Math.max(t0, t)
    } else {
      if (t < t0) return false
      t1 = Math.min(t1, t)
    }
  }
  return t1 - t0 > 1e-9
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

/**
 * Deterministic default arrangement for nodes without a saved position. Up to
 * 12 go on a ring in name order, starting at the top and going clockwise, with
 * a radius large enough that cards never overlap and no line between two nodes
 * runs under a third; more than 12 go in a grid by name. Either way they sit
 * clear of every saved node: below the lowest one, centered on the saved ones
 * (or on the origin when none is saved). Returns positions only for the unsaved
 * nodes; saved ones are never recomputed.
 */
export function defaultNodeLayout(
  nodes: readonly { id: string; name: string }[],
  saved: ReadonlyMap<string, Position>,
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
