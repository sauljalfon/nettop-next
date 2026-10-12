import type { HDFInput, Snapshot } from '../../shared/types'

export type ContainerKind = 'site' | 'node' | 'rack'

/** What a container holds: nodes in a site, racks in a node, equipment in a rack. */
export function childCounts(s: Snapshot): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const n of s.nodes) add(n.siteId)
  for (const r of s.racks) add(r.nodeId)
  for (const e of s.equipment) add(e.rackId)
  return counts
}

/** The container is drawn PROPOSED: in a plan, and not part of Installed. */
export const isProposed = (
  s: Pick<Snapshot, 'context'>,
  installedIds: ReadonlySet<string>,
  id: string,
) => s.context === 'planned' && !installedIds.has(id)

/** The IDs of every installed site, node and rack. */
export const containerIds = (
  s: Pick<Snapshot, 'sites' | 'nodes' | 'racks'>,
): Set<string> =>
  new Set([
    ...s.sites.map((x) => x.id),
    ...s.nodes.map((x) => x.id),
    ...s.racks.map((x) => x.id),
  ])

/** Shown on Installed where a plan would offer an edit. */
export const installedHint = (what: string) =>
  `Installed is read-only. Open a plan to ${what}.`

/** The hint under a container that still holds something. */
export const NOT_EMPTY_HINT = 'Delete is available once it is empty'

export const DEFAULT_RACK_UNITS = 42

/** The HDF form's values as typed. */
export interface HdfFormValues {
  name: string
  rows: string
  height: string
  rackId: string
  unit: string
}

export const HDF_MAX_ROWS = 32

/** Positions per side of an HDF: 4 blocks of 6 per row. */
export const hdfPositions = (rows: number) => rows * 4 * 6

/**
 * Checks what can be checked before sending; the server judges the rest (a
 * name that exists, units that are taken) in its own words.
 */
export function parseHdfForm(
  v: HdfFormValues,
): { hdf: HDFInput } | { error: string } {
  const whole = (text: string) =>
    /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN
  const rows = whole(v.rows)
  const height = whole(v.height)
  const unit = whole(v.unit)
  if (!v.name.trim()) return { error: 'Give the HDF a name.' }
  if (!(rows >= 1 && rows <= HDF_MAX_ROWS))
    return { error: `Rows must be between 1 and ${HDF_MAX_ROWS}.` }
  if (!(height >= 1 && height <= 100))
    return {
      error: 'Height must be a whole number of units, 1 or more.',
    }
  if (!v.rackId) return { error: 'Choose a rack.' }
  if (!(unit >= 1 && unit <= 100))
    return { error: 'Lowest unit must be 1 or more.' }
  return {
    hdf: { name: v.name.trim(), rackId: v.rackId, unit, height, rows },
  }
}
