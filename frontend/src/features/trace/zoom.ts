export const MIN_ZOOM = 0.3
export const MAX_ZOOM = 4
const PAGE_FIT_MAX = 1
const PICTURE_FIT_MAX = 2.5

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

type Size = { w: number; h: number }

/**
 * The zoom that shows the whole drawing. On the page only the width must fit
 * (the page scrolls down) and it never magnifies past 1; in Picture only both
 * must fit, up to 2.5. Never below 0.3.
 */
export function fitZoom(content: Size, box: Size, picture: boolean): number {
  const byW = content.w > 0 ? box.w / content.w : Infinity
  const byH = picture && content.h > 0 ? box.h / content.h : Infinity
  const z = Math.min(byW, byH, picture ? PICTURE_FIT_MAX : PAGE_FIT_MAX)
  return Math.max(MIN_ZOOM, Number.isFinite(z) ? z : PAGE_FIT_MAX)
}

/** One click of + or −: ×1.25 or ÷1.25, kept within 0.3 to 4. */
export function stepZoom(z: number, direction: 1 | -1): number {
  return clamp(direction === 1 ? z * 1.25 : z / 1.25, MIN_ZOOM, MAX_ZOOM)
}

/** ⌘/Ctrl + wheel (or a pinch): wheel up zooms in; one event moves at most 50. */
export function wheelZoom(z: number, deltaY: number): number {
  return clamp(
    z * Math.exp(-clamp(deltaY, -50, 50) * 0.005),
    MIN_ZOOM,
    MAX_ZOOM,
  )
}
