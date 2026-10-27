import type { NetworkHierarchy } from './hierarchy'

/** The demo's sizes and spacing. */
export const TIER_CARD = { w: 140, h: 58 }
export const NODE_CARD = { w: 178, h: 86 }
const AGG_GAP = 40
const TOP_GAP = 60
const CARD_GAP = 10
const GROUP_GAP = 48
/** Left of the groups: room for the tier labels. */
const LABEL_WIDTH = 110
const MARGIN = 24
/** From the top row to the Aggregation row, and from it to the frames. */
const TOP_TO_AGG = TIER_CARD.h + 62
const AGG_TO_NODES = TIER_CARD.h + 46
/** The frame's head, above its first row of cards; and the room for "No problems here". */
const FRAME_HEAD = 24
const FRAME_PAD = 10

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
  /** By tier equipment ID (`none` for the "No AGG" card) and by node card key. */
  boxes: Map<string, Box>
  /** By group key. */
  frames: Map<string, Box>
  labels: HierarchyLabel[]
  size: { width: number; height: number }
  /** Only cards with a problem were laid out. */
  onlyProblems: boolean
}

/**
 * Where every card, frame and tier label of one network goes: the top row centred
 * over all the groups, the groups left to right (their AGGs over a frame of node
 * cards), the frames growing downward. Pure and deterministic; computed, never
 * saved. With `onlyProblems`, only the node cards with a problem are laid out
 * and a frame with none keeps its head and room for "No problems here".
 */
export function hierarchyLayout(
  h: NetworkHierarchy,
  opts: { onlyProblems: boolean },
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

  const topY = MARGIN
  const aggY = topY + (h.topIds.length ? TOP_TO_AGG : 0)
  const nodeY = aggY + AGG_TO_NODES

  // The groups left to right, from x = 0; shifted into place below.
  const placed: { id: string; box: Box }[] = []
  const placedFrames: { key: string; box: Box }[] = []
  let x = 0
  for (const g of h.groups) {
    const aggs =
      g.kind === 'aggs' ? g.aggIds : g.kind === 'none' ? ['none'] : []
    const aggW = aggs.length
      ? aggs.length * TIER_CARD.w + (aggs.length - 1) * AGG_GAP
      : 0
    const visible = opts.onlyProblems
      ? g.nodes.filter((c) => c.problem)
      : g.nodes
    const cols = Math.max(
      1,
      Math.min(Math.max(g.aggIds.length, 2), visible.length),
    )
    const gridW = cols * NODE_CARD.w + (cols - 1) * CARD_GAP + 2 * FRAME_PAD
    const width = Math.max(aggW, gridW)
    const aggX = x + (width - aggW) / 2
    const gridX = x + (width - gridW) / 2
    aggs.forEach((id, i) =>
      placed.push({
        id,
        box: {
          x: aggX + i * (TIER_CARD.w + AGG_GAP),
          y: aggY,
          w: TIER_CARD.w,
          h: TIER_CARD.h,
        },
      }),
    )
    visible.forEach((c, i) =>
      placed.push({
        id: c.key,
        box: {
          x: gridX + FRAME_PAD + (i % cols) * (NODE_CARD.w + CARD_GAP),
          y:
            nodeY +
            FRAME_HEAD +
            Math.floor(i / cols) * (NODE_CARD.h + CARD_GAP),
          w: NODE_CARD.w,
          h: NODE_CARD.h,
        },
      }),
    )
    const rows = Math.ceil(visible.length / cols)
    placedFrames.push({
      key: g.key,
      box: {
        x: gridX,
        y: nodeY,
        w: gridW,
        h:
          FRAME_HEAD +
          (rows ? rows * (NODE_CARD.h + CARD_GAP) : FRAME_HEAD) +
          2,
      },
    })
    x += width + GROUP_GAP
  }
  const groupsW = h.groups.length ? x - GROUP_GAP : 0
  const topsW = h.topIds.length * (TIER_CARD.w + TOP_GAP) - TOP_GAP
  const total = Math.max(groupsW, topsW)
  const groupsAt = LABEL_WIDTH + (total - groupsW) / 2
  const topsAt = LABEL_WIDTH + (total - topsW) / 2

  h.topIds.forEach((id, i) =>
    boxes.set(id, {
      x: topsAt + i * (TIER_CARD.w + TOP_GAP),
      y: topY,
      w: TIER_CARD.w,
      h: TIER_CARD.h,
    }),
  )
  for (const p of placed) boxes.set(p.id, { ...p.box, x: p.box.x + groupsAt })
  for (const f of placedFrames)
    frames.set(f.key, { ...f.box, x: f.box.x + groupsAt })

  if (h.topIds.length)
    labels.push({
      text: h.topKind === 'backbone' ? 'Backbone' : 'Top AGG',
      x: 14,
      y: topY + 18,
    })
  if (h.groups.length) {
    labels.push({ text: 'Aggregation', x: 14, y: aggY + 18 })
    labels.push({ text: 'Nodes', x: 14, y: nodeY + 30 })
  }

  let bottom = 0
  for (const b of [...boxes.values(), ...frames.values()])
    bottom = Math.max(bottom, b.y + b.h)
  return {
    ...empty,
    size: { width: LABEL_WIDTH + total + MARGIN, height: bottom + MARGIN },
  }
}
