import { coversFromRects, withToolRail, type Covers } from './center'

/** What covers the canvas: the open drawers and the results overlay (and the tool rail). */
const OVERLAYS = '.studio-drawer, .map-results'

/**
 * The canvas rectangle and how much of each edge is covered by the open
 * drawers, the results overlay and the tool rail. Both the conceptual map and
 * the site screen fit and center in what is left.
 */
export function visibleArea(
  surface: HTMLElement | null,
): { box: DOMRect; covers: Covers } | undefined {
  if (!surface) return undefined
  const box = surface.getBoundingClientRect()
  const covers = withToolRail(
    coversFromRects(
      box,
      [...document.querySelectorAll(OVERLAYS)].map((el) =>
        el.getBoundingClientRect(),
      ),
    ),
    box,
    document.querySelector('.tool-rail')?.getBoundingClientRect(),
  )
  return { box, covers }
}
