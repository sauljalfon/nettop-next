import type {
  Route,
  Snapshot,
  TraceRequest,
  TraceResult,
} from '../../shared/types'
import {
  destinationOf,
  routeOptionLabel,
  type Destination,
} from '../pathfinding/results'

export const hopCounts = (route: Route) => ({
  cables: route.hops.filter((h) => h.kind === 'cable').length,
  bridges: route.hops.filter((h) => h.kind === 'internal').length,
})

export interface RouteRow {
  /** Index into result.routes, the order the engine returned (AGG first). */
  index: number
  label: string
  destination?: Destination
  counts: string
}

/** One row per route, in engine order; nothing is dropped or reordered. */
export function routeRows(s: Snapshot, result: TraceResult): RouteRow[] {
  return result.routes.map((route, index) => {
    const { cables, bridges } = hopCounts(route)
    return {
      index,
      label: routeOptionLabel(s, route),
      destination: destinationOf(s, route),
      counts: `${cables} cables · ${bridges} internal bridges`,
    }
  })
}

/** One line for the collapsed overlay. */
export function resultsSummary(
  s: Snapshot,
  result: TraceResult,
  selected: number,
): string {
  if (!result.routes.length) return `No route · ${result.reason}`
  const d = destinationOf(s, result.routes[selected] ?? result.routes[0])
  const n = result.routes.length
  const head = `${n} route${n === 1 ? '' : 's'}`
  return d ? `${head} · ${d.name} · ${d.role} · ${d.network}` : head
}

/** The overlay's title: the search it shows the result of. */
export const resultsTitle = (mode: TraceRequest['mode']): string =>
  mode === 'point_to_point' ? 'Exact port → port' : 'Find AGG / BB'
