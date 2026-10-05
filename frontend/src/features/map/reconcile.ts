import type { Position } from './layout'

/**
 * Position of a card after the projection changes. A card the user dragged
 * keeps its local position; a new card takes the projected one; after a layout
 * reset every card takes the recomputed first layout.
 */
export function reconciledPosition(
  local: Position | undefined,
  projected: Position,
  reset: boolean,
): Position {
  return reset ? projected : (local ?? projected)
}
