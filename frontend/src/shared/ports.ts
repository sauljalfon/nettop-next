import type { Endpoint } from './types'

/**
 * A switch's ports in the order they were made: by `position` (1…N in port
 * group order) when both have one; ports saved before groups have none and are
 * ordered by the number in their label (as a number, never as text), which is
 * the only place the label is read for order. A positioned port comes before an
 * unpositioned one (a switch has either kind, never both).
 */
export function comparePorts(
  a: Pick<Endpoint, 'position' | 'label'>,
  b: Pick<Endpoint, 'position' | 'label'>,
): number {
  const pa = a.position ?? 0
  const pb = b.position ?? 0
  if (pa > 0 && pb > 0) return pa - pb
  if (pa > 0 || pb > 0) return pa > 0 ? -1 : 1
  return a.label.localeCompare(b.label, undefined, { numeric: true })
}

/**
 * Whether an endpoint is a position side of a panel or HDF. Only `side` says so:
 * a switch port may carry a `position` too (its order).
 */
export const hasSide = (p: Pick<Endpoint, 'side'>) => !!p.side
