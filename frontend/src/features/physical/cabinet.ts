export const MIN_UNIT_PX = 7
export const MAX_UNIT_PX = 30
/** Units this tall or taller keep the 2 px gap; tighter racks use 1 px. */
const ROOMY_UNIT_PX = 14

/**
 * The height of one rack unit, and the gap between units, so the whole rack fits
 * `available` pixels: up to 30 px a unit with a 2 px gap when there is room
 * (a 12U rack gets 30, a 42U rack about 17), then a 1 px gap and shorter units
 * down to 7 px so a 42U rack still fits a small window. Below 7 px the minimum
 * wins and the page scrolls.
 */
export function rackMetrics(
  available: number,
  units: number,
): { unitPx: number; gap: number } {
  if (units <= 0 || available <= 0) return { unitPx: MIN_UNIT_PX, gap: 1 }
  const per = Math.floor(available / units)
  if (per - 2 >= ROOMY_UNIT_PX)
    return { unitPx: Math.min(MAX_UNIT_PX, per - 2), gap: 2 }
  return { unitPx: Math.max(MIN_UNIT_PX, per - 1), gap: 1 }
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
