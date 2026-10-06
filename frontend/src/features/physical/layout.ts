export interface Position {
  x: number
  y: number
}

export const NODE_WIDTH = 240
export const NODE_HEIGHT = 140
const GAP = 40
const COLUMNS = 3

/**
 * Deterministic default arrangement for nodes without a saved position: a grid
 * ordered by name, placed below every saved node so nothing overlaps. Returns
 * positions only for the unsaved nodes; saved ones are never recomputed.
 */
export function defaultNodeLayout(
  nodes: readonly { id: string; name: string }[],
  saved: ReadonlyMap<string, Position>,
): Map<string, Position> {
  const unsaved = nodes
    .filter((n) => !saved.has(n.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  let top = 0
  if (saved.size > 0) {
    let lowest = -Infinity
    for (const p of saved.values()) lowest = Math.max(lowest, p.y)
    top = lowest + NODE_HEIGHT + GAP
  }
  return new Map(
    unsaved.map((n, i) => [
      n.id,
      {
        x: (i % COLUMNS) * (NODE_WIDTH + GAP),
        y: top + Math.floor(i / COLUMNS) * (NODE_HEIGHT + GAP),
      },
    ]),
  )
}
