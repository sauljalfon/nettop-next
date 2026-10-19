import type { Focus, FocusCircuit, FocusGroup } from './focus'
import type { SnapshotIndex } from './snapshotIndex'

/** Distance between the centers of neighbouring columns. */
export const FOCUS_COLUMN = 420
/** Space between two cards of a column. */
export const FOCUS_GAP = 24
/** A neighbour card's height without any via row; a group card is the same while closed. */
export const FOCUS_CARD_HEIGHT = 112
/** One line of a via row (11px text at line-height 1.3, rounded up). */
export const FOCUS_ROW_LINE = 16
/** Space above a card's first via row. */
export const FOCUS_ROWS_PAD = 8
/** More than this many via steps are cut to the first two and "+N more". */
export const MAX_STEPS = 3
export const KEPT_STEPS = 2
export const FOCUS_CARD_WIDTH = 220
export const FOCUS_CENTER_WIDTH = 280
export const FOCUS_CENTER_HEIGHT = 144

export interface FocusItem {
  /** The equipment ID of a center or neighbour, the group's key for a group. */
  id: string
  kind: 'center' | 'neighbour' | 'group'
  side: 'center' | 'left' | 'right'
  ring: number
  /** The card's center. */
  x: number
  y: number
  width: number
  height: number
}

export interface FocusLine {
  id: string
  /** The center or a previous ring's equipment. */
  from: string
  /** A neighbour's equipment ID, or a group card's key. */
  to: string
  /** This pair's circuits; empty for a group (it only knows how many). */
  circuits: FocusCircuit[]
  /** Circuits on the line; 0 when a group is reached from several parents (not split). */
  count: number
}

/** What a line's row says, by size: no names yet (see focusFlow for the pieces). */
export type LabelShape =
  | { kind: 'direct' }
  | { kind: 'steps'; shown: number; more: number }
  | { kind: 'count'; count: number }

/** The row a line leads to its card with; undefined for a group reached from several parents. */
export function labelShape(
  line: Pick<FocusLine, 'circuits' | 'count'>,
): LabelShape | undefined {
  if (line.circuits.length === 1) {
    const via = line.circuits[0].via.length
    if (via === 0) return { kind: 'direct' }
    return via > MAX_STEPS
      ? { kind: 'steps', shown: KEPT_STEPS, more: via - KEPT_STEPS }
      : { kind: 'steps', shown: via, more: 0 }
  }
  return line.count > 0 ? { kind: 'count', count: line.count } : undefined
}

/** Lines of text one row takes: "via" and each step and "+N more", or one line. */
const rowLines = (shape: LabelShape) =>
  shape.kind === 'steps' ? 1 + shape.shown + (shape.more > 0 ? 1 : 0) : 1

/**
 * A card's height from the rows of the lines that end at it. With two or more
 * rows each starts with its parent's name, one more line. The one rule the
 * layout and the card's CSS height both use.
 */
export function focusCardHeight(shapes: readonly LabelShape[]): number {
  if (shapes.length === 0) return FOCUS_CARD_HEIGHT
  const parents = shapes.length > 1 ? shapes.length : 0
  const lines = shapes.reduce((n, shape) => n + rowLines(shape), parents)
  return FOCUS_CARD_HEIGHT + FOCUS_ROWS_PAD + lines * FOCUS_ROW_LINE
}

/** The key of a group card: its ring, node and side. */
export const groupKey = (ring: number, group: FocusGroup) =>
  `group:${ring}:${group.nodeId ?? ''}:${group.side}`

/**
 * Positions for a Focus: the center at the origin, ring k's left cards in a
 * column k columns to the left and its right cards k columns to the right, each
 * column in the Focus's order, top to bottom, centered on y = 0. And the lines:
 * one per pair of a parent (the center or a previous ring's equipment) and a
 * neighbour, with that pair's circuits; a group has one line from each parent.
 * Deterministic and pure; a drawing aid that never feeds a trace.
 */
export function focusLayout(
  index: SnapshotIndex,
  focus: Focus,
): { items: FocusItem[]; lines: FocusLine[] } {
  const items: FocusItem[] = [
    {
      id: focus.centerId,
      kind: 'center',
      side: 'center',
      ring: 0,
      x: 0,
      y: 0,
      width: FOCUS_CENTER_WIDTH,
      height: FOCUS_CENTER_HEIGHT,
    },
  ]
  const lines: FocusLine[] = []
  focus.rings.forEach((ring, i) => {
    const k = i + 1
    const ringLines: FocusLine[] = []
    for (const n of ring.neighbours) {
      const byFrom = new Map<string, FocusCircuit[]>()
      for (const c of n.circuits) {
        const from = index.owner.get(c.start) ?? focus.centerId
        const list = byFrom.get(from)
        if (list) list.push(c)
        else byFrom.set(from, [c])
      }
      for (const [from, circuits] of byFrom)
        ringLines.push({
          id: `${from}|${n.equipmentId}`,
          from,
          to: n.equipmentId,
          circuits,
          count: circuits.length,
        })
    }
    for (const g of ring.groups) {
      const to = groupKey(k, g)
      for (const from of g.fromIds)
        ringLines.push({
          id: `${from}|${to}`,
          from,
          to,
          circuits: [],
          count: g.fromIds.length === 1 ? g.circuitCount : 0,
        })
    }
    lines.push(...ringLines)
    const heightOf = (id: string) =>
      focusCardHeight(
        ringLines
          .filter((l) => l.to === id)
          .flatMap((l) => labelShape(l) ?? []),
      )
    const cards: Omit<FocusItem, 'x' | 'y'>[] = [
      ...ring.neighbours.map((n) => ({
        id: n.equipmentId,
        kind: 'neighbour' as const,
        side: n.side,
        ring: k,
        width: FOCUS_CARD_WIDTH,
        height: heightOf(n.equipmentId),
      })),
      ...ring.groups.map((g) => ({
        id: groupKey(k, g),
        kind: 'group' as const,
        side: g.side,
        ring: k,
        width: FOCUS_CARD_WIDTH,
        height: heightOf(groupKey(k, g)),
      })),
    ]
    for (const side of ['left', 'right'] as const) {
      const column = cards.filter((c) => c.side === side)
      const total =
        column.reduce((n, c) => n + c.height, 0) +
        Math.max(0, column.length - 1) * FOCUS_GAP
      let top = -total / 2
      for (const c of column) {
        items.push({
          ...c,
          x: (side === 'left' ? -1 : 1) * k * FOCUS_COLUMN,
          y: top + c.height / 2,
        })
        top += c.height + FOCUS_GAP
      }
    }
  })
  return { items, lines }
}
