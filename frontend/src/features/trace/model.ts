import type { Route, StartOutcomeName, TraceResult } from '../../shared/types'
import { facetLabel } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { walkOfRoute } from '../paths/follow'
import {
  startPlate,
  stepsOfWalk,
  type PathCable,
  type PathJack,
  type PathPlate,
  type PathStep,
} from '../paths/pathLine'

type Installed = {
  equipment: ReadonlySet<string>
  links: ReadonlySet<string>
}

/**
 * A server route as a line of plates and cables: the start plate (its jack
 * selected), then the route's own stored cables and plates through
 * `walkOfRoute`; the last plate carries `destination`. The route is drawn as
 * the server gave it and is never walked again.
 */
export function routeLine(
  index: SnapshotIndex,
  route: Route,
  installed?: Installed,
): { steps: PathStep[]; cables: number } {
  const walk = walkOfRoute(index, route)
  // A route that starts on a bridged jack leaves through its bridge: that
  // jack is the second jack of the start plate, not a cable.
  const first = walk.hops[0]
  const bridged = first?.kind === 'internal' && first.from === route.start
  const start = startPlate(
    index,
    bridged ? [route.start, first.to] : [route.start],
    installed,
  )
  const rest = stepsOfWalk(
    index,
    bridged ? { ...walk, hops: walk.hops.slice(1) } : walk,
    start,
    installed,
  )
  return { steps: [start, ...rest.steps], cables: rest.cables }
}

/** One node's plates and the cables between them, in a dashed frame. */
export type Frame = {
  siteId?: string
  nodeId?: string
  /** Site and node names, as separate entries (never joined). */
  place: string[]
  steps: PathStep[]
}

export const isFrame = (item: Frame | PathCable): item is Frame =>
  'steps' in item

/**
 * Consecutive plates of one node, with the cables between them, in one frame;
 * a cable between two nodes stands between frames. A gap goes into the frame
 * beside it. A drawing aid only: it never feeds traversal.
 */
export function nodeFrames(
  index: SnapshotIndex,
  steps: PathStep[],
): (Frame | PathCable)[] {
  const out: (Frame | PathCable)[] = []
  let current: Frame | undefined
  /** Cables and gaps seen since the last plate. */
  let pending: PathStep[] = []
  const placeOf = (equipmentId: string) => {
    const nodeId = index.places.get(equipmentId)?.nodeId
    const node = nodeId ? index.nodes.get(nodeId) : undefined
    const site = node ? index.sites.get(node.siteId) : undefined
    return {
      nodeId,
      siteId: site?.id ?? index.places.get(equipmentId)?.siteId,
      place: [site?.name, node?.name].filter((x): x is string => !!x),
    }
  }
  for (const step of steps) {
    if (step.kind !== 'plate') {
      pending.push(step)
      continue
    }
    const p = placeOf(step.equipmentId)
    if (current && current.nodeId === p.nodeId && current.siteId === p.siteId) {
      current.steps.push(...pending, step)
    } else {
      const lead = pending.filter((s) => s.kind === 'gap')
      const cables = pending.filter((s): s is PathCable => s.kind === 'cable')
      if (current) {
        current.steps.push(...lead)
        out.push(...cables)
      } else {
        out.push(...cables)
      }
      current = {
        ...(p.siteId ? { siteId: p.siteId } : {}),
        ...(p.nodeId ? { nodeId: p.nodeId } : {}),
        place: p.place,
        steps: current ? [step] : [...lead, step],
      }
      out.push(current)
    }
    pending = []
  }
  if (pending.length) {
    const gaps = pending.filter((s) => s.kind === 'gap')
    const cables = pending.filter((s): s is PathCable => s.kind === 'cable')
    if (current) current.steps.push(...gaps)
    out.push(...cables)
  }
  return out
}

export type ResultItem = {
  kind: 'route' | 'mismatch'
  index: number
  route: Route
}

/**
 * The result's routes by destination role, AGG before BB, in the server's
 * order inside each; mismatches apart. `index` is the position in
 * `result.routes` (or `result.mismatches` for a mismatch).
 */
export function resultGroups(result: TraceResult): {
  aggregation: ResultItem[]
  backbone: ResultItem[]
  mismatches: ResultItem[]
} {
  const routes = result.routes.map((route, index): ResultItem => ({
    kind: 'route',
    index,
    route,
  }))
  return {
    aggregation: routes.filter(
      (i) => i.route.destinationRole === 'aggregation',
    ),
    backbone: routes.filter((i) => i.route.destinationRole === 'backbone'),
    mismatches: result.mismatches.map((route, index): ResultItem => ({
      kind: 'mismatch',
      index,
      route,
    })),
  }
}

export function resultCounts(result: TraceResult): {
  routes: number
  mismatches: number
  reachedPorts: number
  searchedPorts: number
} {
  return {
    routes: result.routes.length,
    mismatches: result.mismatches.length,
    reachedPorts: result.starts.filter((s) => s.outcome === 'reached').length,
    searchedPorts: result.starts.length,
  }
}

export type PortOutcomeLine = {
  endpointId: string
  equipmentId: string
  equipmentName: string
  /** The searched port's jack label. */
  jack: string
  outcome: 'reached' | 'mismatch'
  destinationId?: string
  destinationName?: string
  destinationNetworkId?: string
}

/**
 * "What each port found": a line for each port that reached a destination or
 * a mismatch (the destination from its first route), then counts of the ports
 * that found nothing.
 */
export function portOutcomes(
  index: SnapshotIndex,
  result: TraceResult,
): {
  lines: PortOutcomeLine[]
  counts: Record<Exclude<StartOutcomeName, 'reached' | 'mismatch'>, number>
} {
  const firstRoute = (list: Route[]) => {
    const m = new Map<string, Route>()
    for (const r of list) if (!m.has(r.start)) m.set(r.start, r)
    return m
  }
  const byStart = {
    reached: firstRoute(result.routes),
    mismatch: firstRoute(result.mismatches),
  }
  const counts = { no_destination: 0, disconnected: 0, unresolved_network: 0 }
  const lines: PortOutcomeLine[] = []
  for (const s of result.starts) {
    if (s.outcome !== 'reached' && s.outcome !== 'mismatch') {
      counts[s.outcome]++
      continue
    }
    const route = byStart[s.outcome].get(s.endpoint)
    const equipmentId = index.owner.get(s.endpoint) ?? ''
    const p = index.lookup.endpoints.get(s.endpoint)
    const destinationId = route?.destinationEquipmentId
    lines.push({
      endpointId: s.endpoint,
      equipmentId,
      equipmentName: index.equipment.get(equipmentId)?.name ?? equipmentId,
      jack: p ? facetLabel(index.lookup, p) : s.endpoint,
      outcome: s.outcome,
      ...(destinationId
        ? {
            destinationId,
            destinationName:
              index.equipment.get(destinationId)?.name ?? destinationId,
          }
        : {}),
      ...(route?.destinationNetworkId
        ? { destinationNetworkId: route.destinationNetworkId }
        : {}),
    })
  }
  return { lines, counts }
}

/**
 * Ids of the equipment every line passes through, leaving out each line's
 * first and last plate (the ends are different by definition). Empty for fewer
 * than two lines. A drawing aid only.
 */
export function sharedEquipment(lines: PathStep[][]): Set<string> {
  if (lines.length < 2) return new Set()
  const sets = lines.map((steps) => {
    const ps = steps.filter((s): s is PathPlate => s.kind === 'plate')
    return new Set(ps.slice(1, -1).map((p) => p.equipmentId))
  })
  return new Set([...sets[0]].filter((id) => sets.every((s) => s.has(id))))
}

export type WalkRow =
  | {
      kind: 'step'
      n: number
      plate: PathPlate
      arrives?: PathJack
      leaves?: PathJack
      note: 'start' | 'bridge' | 'end'
    }
  | { kind: 'cable'; linkId: string; networkId?: string }

/**
 * The line as the walk table's rows: one row per plate (numbered, with the
 * jack it arrives at and the one it leaves from) and one per cable between.
 * Gaps have no row.
 */
export function walkRows(_index: SnapshotIndex, steps: PathStep[]): WalkRow[] {
  const firstPlate = steps.findIndex((s) => s.kind === 'plate')
  let lastPlate = -1
  steps.forEach((s, i) => {
    if (s.kind === 'plate') lastPlate = i
  })
  const rows: WalkRow[] = []
  let n = 0
  steps.forEach((s, i) => {
    if (s.kind === 'gap') return
    if (s.kind === 'cable') {
      rows.push({
        kind: 'cable',
        linkId: s.linkId,
        ...(s.networkId ? { networkId: s.networkId } : {}),
      })
      return
    }
    const note = i === firstPlate ? 'start' : i === lastPlate ? 'end' : 'bridge'
    const [a, b] = s.jacks
    rows.push({
      kind: 'step',
      n: ++n,
      plate: s,
      ...(note === 'start'
        ? { leaves: b ?? a }
        : note === 'end'
          ? { arrives: a }
          : { arrives: a, ...(b ? { leaves: b } : {}) }),
      note,
    })
  })
  return rows
}
