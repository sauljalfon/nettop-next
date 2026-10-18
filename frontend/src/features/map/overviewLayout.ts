import {
  defaultNodeLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  type NodeGraph,
  type Position,
} from '../physical/layout'
import type { Overview } from './overview'

/** A closed overview card's height; Physical's NODE_HEIGHT is a size for rack previews. */
export const OVERVIEW_CARD_HEIGHT = 96
/** Heights and gaps of the default arrangement scale together, so cards stay apart. */
const Y_SCALE = OVERVIEW_CARD_HEIGHT / NODE_HEIGHT

/** Space between the right edge of one site's cards and the left edge of the next site's. */
export const SITE_GAP = 240
/** Space around a site's cards inside its frame. */
export const FRAME_PADDING = 32
/** Room above a site's cards for the site name. */
export const FRAME_TITLE = 28

export interface SiteFrame {
  siteId: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * A position (top-left of the card) for every node, in one coordinate space for
 * the whole network. Each site is arranged on its own (its y scaled to the
 * overview card's height) and the sites are placed left to right, SITE_GAP
 * apart, in a fixed order: fewest AGG/BB nodes first (the core site last), then
 * name, then ID. A saved position then replaces only
 * its own card: dragging a card moves that card and nothing else (a card may be
 * dropped on another; that is the user's arrangement).
 */
export function overviewLayout(
  overview: Overview,
  saved: ReadonlyMap<string, Position>,
): Map<string, Position> {
  const nodesOf = new Map<string, Overview['nodes']>()
  for (const n of overview.nodes) {
    const list = nodesOf.get(n.siteId)
    if (list) list.push(n)
    else nodesOf.set(n.siteId, [n])
  }
  const core = (siteId: string) =>
    (nodesOf.get(siteId) ?? []).filter(
      (n) => n.tags.aggregation || n.tags.backbone,
    ).length
  const sites = overview.sites
    .filter((s) => nodesOf.has(s.id))
    .sort(
      (a, b) =>
        core(a.id) - core(b.id) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )

  const graphOf = (siteId: string): NodeGraph => {
    const nodes = nodesOf.get(siteId)!
    const ids = new Set(nodes.map((n) => n.id))
    return {
      roles: new Map(
        nodes.map((n) => [
          n.id,
          {
            access: n.tags.access,
            distribution: n.tags.aggregation || n.tags.backbone,
          },
        ]),
      ),
      pairs: overview.pairs
        .filter((p) => ids.has(p.nodeIds[0]) && ids.has(p.nodeIds[1]))
        .map((p) => p.nodeIds),
    }
  }

  // The default arrangement never reads the saved positions, so saving one
  // card's position never moves another card.
  const out = new Map<string, Position>()
  let right = -Infinity
  for (const site of sites) {
    const own = defaultNodeLayout(
      nodesOf.get(site.id)!,
      new Map(),
      graphOf(site.id),
    )
    const left = Math.min(...[...own.values()].map((p) => p.x))
    const top = Math.min(...[...own.values()].map((p) => p.y))
    const dx = (right === -Infinity ? 0 : right + SITE_GAP) - left
    for (const [id, p] of own) {
      out.set(id, { x: p.x + dx, y: (p.y - top) * Y_SCALE })
      right = Math.max(right, p.x + dx + NODE_WIDTH)
    }
  }
  for (const [id, p] of saved) if (out.has(id)) out.set(id, p)
  return out
}

/**
 * The box around each site's cards, with padding and room above for the site
 * name. A site with no node has no frame. Computed, never saved.
 */
export function siteFrames(
  overview: Overview,
  positions: ReadonlyMap<string, Position>,
): SiteFrame[] {
  const frames: SiteFrame[] = []
  for (const site of overview.sites) {
    const cards = overview.nodes
      .filter((n) => n.siteId === site.id)
      .map((n) => positions.get(n.id))
      .filter((p): p is Position => !!p)
    if (cards.length === 0) continue
    const left = Math.min(...cards.map((p) => p.x))
    const top = Math.min(...cards.map((p) => p.y))
    const right = Math.max(...cards.map((p) => p.x)) + NODE_WIDTH
    const bottom = Math.max(...cards.map((p) => p.y)) + OVERVIEW_CARD_HEIGHT
    frames.push({
      siteId: site.id,
      x: left - FRAME_PADDING,
      y: top - FRAME_PADDING - FRAME_TITLE,
      width: right - left + 2 * FRAME_PADDING,
      height: bottom - top + 2 * FRAME_PADDING + FRAME_TITLE,
    })
  }
  return frames
}
