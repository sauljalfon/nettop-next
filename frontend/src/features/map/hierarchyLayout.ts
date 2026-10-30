import type { HierarchyGroup, NetworkHierarchy } from './hierarchy'

/**
 * The demo's columns and sizes (conceptual-demo.html): tops, frames, node cards.
 * The frame is 280 wide, not the demo's 220: a pair with "no BB" on both needs it.
 */
export const COLUMN_X = { top: 0, frame: 160, node: 490 }
export const TOP_BOX = { w: 120, h: 30 }
export const FRAME_BOX = { w: 280, h: 30 }
export const NODE_W = 270
/** A closed card is one row. */
export const CLOSED_H = 22
const CARD_GAP = 4
const FRAME_GAP = 12
/** A frame with no card shown still takes one row. */
const EMPTY_ROW = 26
/** Where the first row starts; the column heads sit above it. */
const FIRST_ROW_Y = 44
const HEAD_Y = 14
/** The stack of tops is centred on the frames, but never lower than this. */
const TOP_CAP_Y = 140
/** An open card: head, 20 per switch, and 30 for the quiet line. */
const OPEN_HEAD = 42
const OPEN_ROW = 20
const OPEN_REST = 30
/** The gap between stacked tops. */
const TOP_GAP = 22
const MARGIN = 24

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface HierarchyLabel {
  text: 'Backbone' | 'Top AGG' | 'Aggregation' | 'Nodes'
  x: number
  y: number
}

export interface HierarchyLayout {
  /** By top ID and by node card key. */
  boxes: Map<string, Box>
  /** By group key: the frame of one or two AGGs, "Direct to BB" or "No AGG". */
  frames: Map<string, Box>
  /** The column heads. */
  labels: HierarchyLabel[]
  size: { width: number; height: number }
  /** Only cards with a problem were laid out. */
  onlyProblems: boolean
}

/** The height of a card: one row closed; open, its head, a row per switch and the quiet line. */
export const cardHeight = (
  open: boolean,
  switches: number,
  elsewhere: number,
) =>
  open
    ? OPEN_HEAD + switches * OPEN_ROW + (elsewhere > 0 ? OPEN_REST : 0)
    : CLOSED_H

/**
 * Where everything of one network goes, left to right: the tops stacked on the
 * left, a frame per group in the middle, each centred on its node cards, and the
 * node cards in a column on the right. An open card is taller and pushes the
 * cards below it down. Pure and deterministic; computed, never saved. With
 * `onlyProblems`, only the cards with a mark are laid out, and a frame stays
 * when it has such a card or an AGG with no BB.
 */
export function hierarchyLayout(
  h: NetworkHierarchy,
  opts: { onlyProblems: boolean; open: ReadonlySet<string> },
): HierarchyLayout {
  const boxes = new Map<string, Box>()
  const frames = new Map<string, Box>()
  const labels: HierarchyLabel[] = []
  const empty = {
    boxes,
    frames,
    labels,
    size: { width: 0, height: 0 },
    onlyProblems: opts.onlyProblems,
  }
  if (h.topIds.length === 0 && h.groups.length === 0) return empty

  const shown = (g: HierarchyGroup) =>
    opts.onlyProblems ? g.nodes.filter((c) => c.problem) : g.nodes
  const kept = h.groups
    .map((g) => ({ g, cards: shown(g) }))
    .filter(
      ({ g, cards }) =>
        !opts.onlyProblems ||
        cards.length > 0 ||
        g.aggIds.some((id) => h.noTop.has(id)),
    )

  let y = FIRST_ROW_Y
  for (const { g, cards } of kept) {
    const rows = cards.map((c) => {
      const height = cardHeight(
        opts.open.has(c.key),
        c.switchIds.length,
        c.elsewhere.length,
      )
      const row = { key: c.key, y, height }
      y += height + CARD_GAP
      return row
    })
    if (rows.length === 0) y += EMPTY_ROW
    const top = rows.length ? rows[0].y : y - EMPTY_ROW
    const bottom = y - CARD_GAP
    frames.set(g.key, {
      x: COLUMN_X.frame,
      y: (top + bottom) / 2 - FRAME_BOX.h / 2,
      ...FRAME_BOX,
    })
    for (const r of rows)
      boxes.set(r.key, {
        x: COLUMN_X.node,
        y: r.y,
        w: NODE_W,
        h: r.height,
      })
    y += FRAME_GAP
  }

  // The tops, stacked and centred on the frames, never lower than the cap.
  const n = h.topIds.length
  if (n > 0) {
    const centres = [...frames.values()].map((f) => f.y + f.h / 2)
    const middle = centres.length
      ? (Math.min(...centres) + Math.max(...centres)) / 2
      : FIRST_ROW_Y + TOP_BOX.h / 2
    const stack = n * TOP_BOX.h + (n - 1) * TOP_GAP
    const centre = Math.min(middle, TOP_CAP_Y + TOP_BOX.h / 2)
    const first = Math.max(FIRST_ROW_Y, centre - stack / 2)
    h.topIds.forEach((id, i) =>
      boxes.set(id, {
        x: COLUMN_X.top,
        y: first + i * (TOP_BOX.h + TOP_GAP),
        ...TOP_BOX,
      }),
    )
    labels.push({
      text: h.topKind === 'backbone' ? 'Backbone' : 'Top AGG',
      x: COLUMN_X.top,
      y: HEAD_Y,
    })
  }
  if (h.groups.length) {
    labels.push({ text: 'Aggregation', x: COLUMN_X.frame, y: HEAD_Y })
    labels.push({ text: 'Nodes', x: COLUMN_X.node, y: HEAD_Y })
  }

  let bottom = 0
  for (const b of [...boxes.values(), ...frames.values()])
    bottom = Math.max(bottom, b.y + b.h)
  return {
    ...empty,
    size: { width: COLUMN_X.node + NODE_W + MARGIN, height: bottom + MARGIN },
  }
}

/**
 * The boxes a selection pans to, best first: a card together with its frame, then
 * the card alone; an AGG's frame; a top itself. `scrollTo` is `Lit.scrollTo`.
 */
export function selectionBoxes(
  h: NetworkHierarchy,
  layout: HierarchyLayout,
  scrollTo: string | undefined,
): Box[] {
  if (scrollTo === undefined) return []
  const own = layout.boxes.get(scrollTo) ?? layout.frames.get(scrollTo)
  if (!own) return []
  const card = h.groups.flatMap((g) => g.nodes).find((c) => c.key === scrollTo)
  const frame = card && layout.frames.get(card.groupKey)
  if (!frame) return [own]
  const x = Math.min(own.x, frame.x)
  const y = Math.min(own.y, frame.y)
  return [
    {
      x,
      y,
      w: Math.max(own.x + own.w, frame.x + frame.w) - x,
      h: Math.max(own.y + own.h, frame.y + frame.h) - y,
    },
    own,
  ]
}
