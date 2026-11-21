import type { Route, TraceResult } from '../../shared/types'

export type Picked = {
  kind: 'route' | 'mismatch'
  /** Position in `result.routes` or `result.mismatches`. */
  index: number
  route: Route
}

/**
 * What the page draws in One route: the route chosen in the list or the dock;
 * a mismatch only when one was chosen on the page, or when there is no route
 * at all (then the first mismatch, so a trace with nothing else still shows
 * what it found). Nothing when the result has neither.
 */
export function pickItem(
  result: TraceResult,
  routeIndex: number,
  mismatchIndex: number | undefined,
): Picked | undefined {
  const mismatch =
    mismatchIndex === undefined ? undefined : result.mismatches[mismatchIndex]
  if (mismatch && mismatchIndex !== undefined)
    return { kind: 'mismatch', index: mismatchIndex, route: mismatch }
  const route = result.routes[routeIndex] ?? result.routes[0]
  if (route)
    return {
      kind: 'route',
      index: result.routes[routeIndex] ? routeIndex : 0,
      route,
    }
  const first = result.mismatches[0]
  return first ? { kind: 'mismatch', index: 0, route: first } : undefined
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** The list's first line: "3 routes · 1 mismatch". */
export function countsLine(counts: {
  routes: number
  mismatches: number
}): string {
  return `${plural(counts.routes, 'route', 'routes')} · ${plural(counts.mismatches, 'mismatch', 'mismatches')}`
}

/** The line under the title: "4 cables", "5 equipment", "3 racks in 3 nodes". */
export function countsPhrases(input: {
  cables: number
  equipment: number
  racks: number
  nodes: number
}): string[] {
  return [
    plural(input.cables, 'cable', 'cables'),
    `${input.equipment} equipment`,
    `${plural(input.racks, 'rack', 'racks')} in ${plural(input.nodes, 'node', 'nodes')}`,
  ]
}
