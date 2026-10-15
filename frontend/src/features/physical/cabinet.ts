export const MIN_UNIT_PX = 26
export const MAX_UNIT_PX = 30

/**
 * The height of one rack unit and the gap between units (D33): the height that
 * fits `available` pixels, never below 26 px and never above 30 px, with a 2 px
 * gap. A rack that does not fit at 26 px scrolls; a name is never clipped.
 */
export function rackMetrics(
  available: number,
  units: number,
): { unitPx: number; gap: number } {
  if (units <= 0 || available <= 0) return { unitPx: MIN_UNIT_PX, gap: 2 }
  const fit = Math.floor(available / units) - 2
  return { unitPx: Math.min(MAX_UNIT_PX, Math.max(MIN_UNIT_PX, fit)), gap: 2 }
}

/** Every unit is labeled from 18 px up; below that, only every fifth. */
export const labelEvery = (unitPx: number): 1 | 5 => (unitPx >= 18 ? 1 : 5)

/** Whether a unit's number is drawn, and whether it is bold (every fifth is). */
export function unitLabel(unit: number, every: 1 | 5) {
  const fifth = unit % 5 === 0
  return { show: every === 1 || fifth, strong: fifth }
}

/**
 * What a block shows on its face: its name and the small line "role · network ·
 * nU at Ux–Uy" ('full', from 30 px), the name alone ('name', from 12 px), or
 * nothing ('none'). What does not fit is in the tooltip.
 */
export function blockDetail(blockPx: number): 'full' | 'name' | 'none' {
  if (blockPx >= 30) return 'full'
  if (blockPx >= 12) return 'name'
  return 'none'
}

/** Node previews are a fixed small drawing: 11 px units, shrinking so a tall rack is about 260 px. */
export const previewUnitPx = (units: number): number =>
  Math.min(11, 260 / Math.max(units, 1))
