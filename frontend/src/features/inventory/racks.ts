import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { InventoryRow } from './rows'

/** The heights a Fits pill offers. */
export const FIT_HEIGHTS = [1, 2, 4, 8] as const

/**
 * One row per rack from the snapshot: the units its equipment covers (unit to
 * unit + height − 1, as the snapshot has them, so in a plan the proposed
 * places), the free units and the largest free run, and which heights fit in it.
 */
export function buildRackRows(
  snapshot: Snapshot,
  index: SnapshotIndex,
): InventoryRow[] {
  const covered = new Map<string, { taken: Set<number>; count: number }>()
  for (const e of snapshot.equipment) {
    let rack = covered.get(e.rackId)
    if (!rack) covered.set(e.rackId, (rack = { taken: new Set(), count: 0 }))
    rack.count++
    for (let u = e.unit; u < e.unit + Math.max(1, e.height); u++)
      rack.taken.add(u)
  }
  return snapshot.racks.map((r, i): InventoryRow => {
    const entry = covered.get(r.id)
    const taken = entry?.taken ?? new Set<number>()
    let used = 0
    let best = 0
    let bestFrom = 0
    let run = 0
    let from = 0
    for (let u = 1; u <= r.units; u++) {
      if (taken.has(u)) {
        used++
        run = 0
        continue
      }
      if (!run) from = u
      run++
      if (run > best) {
        best = run
        bestFrom = from
      }
    }
    const fits = FIT_HEIGHTS.filter((h) => best >= h).map((h) => `${h}U`)
    const node = index.nodes.get(r.nodeId)
    return {
      key: r.id,
      equipmentId: '',
      rackId: r.id,
      icon: 'rack',
      proposed: false,
      i,
      values: {
        rack: r.name,
        site: index.sites.get(node?.siteId ?? '')?.name ?? '',
        node: node?.name ?? '',
        units: String(r.units),
        used: String(used),
        free: String(r.units - used),
        gap: best ? `U${bestFrom}–U${bestFrom + best - 1} (${best}U)` : 'Full',
        count: String(entry?.count ?? 0),
        fits: fits.join(', '),
      },
      raw: { gap: String(best) },
      pieces: {},
      lists: { fits },
    }
  })
}
