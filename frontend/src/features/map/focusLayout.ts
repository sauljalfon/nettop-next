import type { Focus, FocusCircuit, FocusGroup } from './focus'
import type { SnapshotIndex } from './snapshotIndex'

/** Distance between the centers of neighbouring columns. */
export const FOCUS_COLUMN = 420
/** Space between two cards of a column. */
export const FOCUS_GAP = 24
/** A neighbour card's height; a group card is the same while closed. */
export const FOCUS_CARD_HEIGHT = 112
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
    const cards: Omit<FocusItem, 'x' | 'y'>[] = [
      ...ring.neighbours.map((n) => ({
        id: n.equipmentId,
        kind: 'neighbour' as const,
        side: n.side,
        ring: k,
        width: FOCUS_CARD_WIDTH,
        height: FOCUS_CARD_HEIGHT,
      })),
      ...ring.groups.map((g) => ({
        id: groupKey(k, g),
        kind: 'group' as const,
        side: g.side,
        ring: k,
        width: FOCUS_CARD_WIDTH,
        height: FOCUS_CARD_HEIGHT,
      })),
    ]
    for (const side of ['left', 'right'] as const) {
      const column = cards.filter((c) => c.side === side)
      const pitch = FOCUS_CARD_HEIGHT + FOCUS_GAP
      const top =
        -(column.length * FOCUS_CARD_HEIGHT + (column.length - 1) * FOCUS_GAP) /
        2
      column.forEach((c, row) =>
        items.push({
          ...c,
          x: (side === 'left' ? -1 : 1) * k * FOCUS_COLUMN,
          y: top + FOCUS_CARD_HEIGHT / 2 + row * pitch,
        }),
      )
    }
    for (const n of ring.neighbours) {
      const byFrom = new Map<string, FocusCircuit[]>()
      for (const c of n.circuits) {
        const from = index.owner.get(c.start) ?? focus.centerId
        const list = byFrom.get(from)
        if (list) list.push(c)
        else byFrom.set(from, [c])
      }
      for (const [from, circuits] of byFrom)
        lines.push({
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
        lines.push({
          id: `${from}|${to}`,
          from,
          to,
          circuits: [],
          count: g.fromIds.length === 1 ? g.circuitCount : 0,
        })
    }
  })
  return { items, lines }
}
