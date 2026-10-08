import type { Inventory, RouteMarks } from './inventory'

export type ElevationRow =
  | { kind: 'free'; unit: number }
  | {
      kind: 'equipment'
      equipmentId: string
      /** Lowest unit (the equipment's own `unit`). */
      unit: number
      height: number
      /** Highest unit, `unit + height - 1`. */
      topUnit: number
      onRoute: boolean
      selected: boolean
      /** In a plan and not installed. */
      proposed: boolean
      /** An active device of a network other than the selected one: shown, quieter. */
      muted: boolean
    }

export interface ElevationOptions {
  marks?: RouteMarks
  selectedEquipmentId?: string
  /** The chosen network; its devices stay normal, other active devices are muted. */
  networkId?: string
  /** Equipment that is installed; any other is proposed. Absent: nothing is marked proposed. */
  installedIds?: ReadonlySet<string>
}

/**
 * A rack from the top unit down. Each equipment is one row spanning its full
 * height; units no equipment covers are free rows. Equipment that does not fit
 * the rack or overlaps one already placed is left out here (placement
 * validation rejects it elsewhere), so the rows always add up to the rack's
 * height. Unknown rack: no rows.
 */
export function rackElevation(
  inv: Inventory,
  rackId: string,
  options: ElevationOptions = {},
): ElevationRow[] {
  const rack = inv.racks.get(rackId)
  if (!rack) return []
  const placed = (inv.equipmentByRack.get(rackId) ?? [])
    .map((id) => inv.equipment.get(id)!)
    .filter(
      (e) =>
        e.unit >= 1 && e.height >= 1 && e.unit + e.height - 1 <= rack.units,
    )
    .sort((a, b) => b.unit - a.unit)

  const at = new Map<number, (typeof placed)[number]>()
  for (const e of placed) {
    let clear = true
    for (let u = e.unit; u < e.unit + e.height; u++)
      if (at.has(u)) clear = false
    if (!clear) continue
    for (let u = e.unit; u < e.unit + e.height; u++) at.set(u, e)
  }

  const rows: ElevationRow[] = []
  for (let u = rack.units; u >= 1;) {
    const e = at.get(u)
    if (!e) {
      rows.push({ kind: 'free', unit: u })
      u--
      continue
    }
    rows.push({
      kind: 'equipment',
      equipmentId: e.id,
      unit: e.unit,
      height: e.height,
      topUnit: e.unit + e.height - 1,
      onRoute: options.marks?.equipment.has(e.id) ?? false,
      selected: options.selectedEquipmentId === e.id,
      proposed: !!options.installedIds && !options.installedIds.has(e.id),
      muted:
        !!options.networkId &&
        e.role !== 'passive' &&
        e.networkId !== undefined &&
        e.networkId !== options.networkId,
    })
    u = e.unit - 1
  }
  return rows
}
