import type { BatchCommand, Endpoint, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'

/** The most cables one range may make: a batch holds 500 commands. */
export const MAX_RANGE = 500

export const PAST_THE_END = 'past the last position'

export interface RangePair {
  /** 1-based, as listed. */
  n: number
  /** Absent when the run passed its last position. */
  near?: Endpoint
  far?: Endpoint
  nearName: string
  farName: string
  /** Why this pair cannot be made, in names and in the server's words; absent when it can. */
  problem?: string
}

const COLUMNS = 'ABCD'

/**
 * The endpoints of one equipment in the order a range runs through them, on
 * one side (none for a switch): switch ports by port number, standard panel positions by
 * position, HDF positions by row, then block A–D, then position 1–6 (answer 22).
 * A switch's ports run by their position (1…N in port group order, never read
 * from a label). Only ports saved before groups have no position (0): those
 * run by the number the app wrote into their label ("Port 7"), as a number and
 * not as text, and a label without a number goes after the numbered ones, in
 * its original order.
 */
export function runOf(
  s: Snapshot,
  equipmentId: string,
  side: 'front' | 'rear' | undefined,
): Endpoint[] {
  const blocks = new Map(s.subpanels.map((p) => [p.id, p]))
  const key = (e: Endpoint): number => {
    const block = e.subpanelId ? blocks.get(e.subpanelId) : undefined
    if (block)
      return (
        (block.row * COLUMNS.length + COLUMNS.indexOf(block.column)) * 6 +
        (e.position ?? 0)
      )
    if (e.position !== undefined) return e.position
    const port = e.label.match(/(\d+)\s*$/)
    return port ? Number(port[1]) : Number.POSITIVE_INFINITY
  }
  return (
    s.endpoints
      .filter(
        (e) => e.equipmentId === equipmentId && (e.side ?? '') === (side ?? ''),
      )
      .map((e) => [key(e), e] as const)
      // The sort is stable, so equal keys (all the unnumbered) keep their order.
      .sort((x, y) => (x[0] === y[0] ? 0 : x[0] < y[0] ? -1 : 1))
      .map(([, e]) => e)
  )
}

const run = (s: Snapshot, start: Endpoint) =>
  runOf(s, start.equipmentId, start.side)

/**
 * The pairs of a range: `count` endpoints from the near start and from the far
 * start, in order, each checked in the order the server checks a cable
 * (itself, same equipment, already cabled) plus clashes with earlier pairs.
 */
export function rangePairs(
  s: Snapshot,
  index: SnapshotIndex,
  nearStart: string,
  farStart: string,
  count: number,
): RangePair[] {
  const byId = new Map(s.endpoints.map((e) => [e.id, e]))
  const near0 = byId.get(nearStart)
  const far0 = byId.get(farStart)
  if (!near0 || !far0 || count < 1) return []
  const nearRun = run(s, near0)
  const farRun = run(s, far0)
  const nearAt = nearRun.findIndex((e) => e.id === nearStart)
  const farAt = farRun.findIndex((e) => e.id === farStart)
  const name = (e: Endpoint) =>
    `${index.equipment.get(e.equipmentId)?.name ?? e.equipmentId} · ${e.label}`
  const used = new Set<string>()
  const pairs: RangePair[] = []
  for (let i = 0; i < count; i++) {
    const near = nearRun[nearAt + i]
    const far = farRun[farAt + i]
    const pair: RangePair = {
      n: i + 1,
      near,
      far,
      nearName: near ? name(near) : PAST_THE_END,
      farName: far ? name(far) : PAST_THE_END,
    }
    pair.problem = problemOf(index, pair, used)
    if (near) used.add(near.id)
    if (far) used.add(far.id)
    pairs.push(pair)
  }
  return pairs
}

function problemOf(
  index: SnapshotIndex,
  { near, far, nearName, farName }: RangePair,
  used: ReadonlySet<string>,
): string | undefined {
  if (!near || !far) return PAST_THE_END
  if (near.id === far.id) return `${nearName} cannot be cabled to itself`
  if (near.equipmentId === far.equipmentId)
    return `${nearName} and ${farName} are on the same equipment`
  const names = new Map([
    [near.id, nearName],
    [far.id, farName],
  ])
  for (const id of [near.id, far.id]) {
    const cable = index.cableByEndpoint.get(id)
    if (cable) return `${names.get(id)} is already cabled (${cable.linkId})`
  }
  for (const id of [near.id, far.id])
    if (used.has(id))
      return `${names.get(id)} is already used earlier in this range`
  return undefined
}

/** One add_cable per pair that can be made (the box sends them only when nothing is blocked or Skip is ticked). */
export function rangeCommands(pairs: RangePair[]): BatchCommand[] {
  return pairs
    .filter((p) => !p.problem)
    .map((p) => ({
      type: 'add_cable' as const,
      cable: { a: p.near!.id, b: p.far!.id },
    }))
}
