/** Where to center the view for a card: its middle, or its corner before it is measured. */
export function centerTarget(card: {
  x: number
  y: number
  width: number
  height: number
}) {
  return { x: card.x + card.width / 2, y: card.y + card.height / 2 }
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** How far each edge of the canvas is covered by overlays, in pixels. */
export interface Covers {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Which parts of the canvas overlays cover. A tall panel is a left or right
 * cover (by which half it sits in), reaching from that edge to its far side; a
 * short wide one is a bottom or top cover. Each edge takes the largest cover.
 * Rectangles outside the canvas count for nothing.
 */
export function coversFromRects(surface: Rect, rects: readonly Rect[]): Covers {
  const covers: Covers = { left: 0, right: 0, top: 0, bottom: 0 }
  const height = surface.bottom - surface.top
  const midX = (surface.left + surface.right) / 2
  const midY = (surface.top + surface.bottom) / 2
  for (const r of rects) {
    const left = Math.max(r.left, surface.left)
    const right = Math.min(r.right, surface.right)
    const top = Math.max(r.top, surface.top)
    const bottom = Math.min(r.bottom, surface.bottom)
    if (right - left < 1 || bottom - top < 1) continue
    if (bottom - top >= height / 2) {
      if ((left + right) / 2 < midX)
        covers.left = Math.max(covers.left, right - surface.left)
      else covers.right = Math.max(covers.right, surface.right - left)
    } else if ((top + bottom) / 2 > midY) {
      covers.bottom = Math.max(covers.bottom, surface.bottom - top)
    } else {
      covers.top = Math.max(covers.top, bottom - surface.top)
    }
  }
  return covers
}

/**
 * The middle of the part of the canvas that is not covered, in pixels from the
 * canvas's top-left corner. Falls back to the whole canvas when covers leave no
 * room.
 */
export function visibleCenter(
  size: { width: number; height: number },
  covers: Covers,
) {
  const width = size.width - covers.left - covers.right
  const height = size.height - covers.top - covers.bottom
  if (width <= 0 || height <= 0)
    return { x: size.width / 2, y: size.height / 2 }
  return { x: covers.left + width / 2, y: covers.top + height / 2 }
}

/** The viewport that shows flow point `target` at screen point `at`, at `zoom`. */
export function viewportFor(
  target: { x: number; y: number },
  at: { x: number; y: number },
  zoom: number,
) {
  return { x: at.x - target.x * zoom, y: at.y - target.y * zoom, zoom }
}
