import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { campusSnapshot } from './campusFixture'
import { buildFocus } from './focus'
import {
  FOCUS_CARD_HEIGHT,
  FOCUS_COLUMN,
  FOCUS_ROW_LINE,
  FOCUS_GAP,
  focusCardHeight,
  focusLayout,
  groupKey,
} from './focusLayout'
import { indexSnapshot } from './snapshotIndex'

const layout = (
  s: Snapshot,
  center: string,
  opts?: Parameters<typeof buildFocus>[2],
) => {
  const index = indexSnapshot(s)
  return focusLayout(index, buildFocus(index, center, opts))
}

const rect = (i: { x: number; y: number; width: number; height: number }) => ({
  left: i.x - i.width / 2,
  right: i.x + i.width / 2,
  top: i.y - i.height / 2,
  bottom: i.y + i.height / 2,
})
function expectNoOverlap(items: ReturnType<typeof focusLayout>['items']) {
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = rect(items[i])
      const b = rect(items[j])
      const apart =
        a.right <= b.left ||
        b.right <= a.left ||
        a.bottom <= b.top ||
        b.bottom <= a.top
      expect(apart, `${items[i].id} vs ${items[j].id}`).toBe(true)
    }
}

describe('CM-10 focus layout', () => {
  it('puts the center at the origin and the AGGs and BB in the right column, centered on y = 0', () => {
    const { items } = layout(acceptanceSnapshot(), 'EDGE-17')
    const center = items.find((i) => i.kind === 'center')!
    expect(center).toMatchObject({ id: 'EDGE-17', x: 0, y: 0, side: 'center' })
    const right = items.filter((i) => i.kind === 'neighbour')
    expect(right.map((i) => i.id)).toEqual(['AGG-03', 'AGG-08', 'BB-01'])
    for (const i of right) {
      expect(i).toMatchObject({
        x: FOCUS_COLUMN,
        side: 'right',
        ring: 1,
      })
    }
    // Every card here says "via" and three steps: four lines more than the bare card.
    const height = focusCardHeight([{ kind: 'steps', shown: 3, more: 0 }])
    expect(right.map((i) => i.height)).toEqual([height, height, height])
    const pitch = height + FOCUS_GAP
    expect(right.map((i) => i.y)).toEqual([-pitch, 0, pitch])
  })

  it('stacks an even number of cards centered, left items on the left', () => {
    const { items } = layout(acceptanceSnapshot(), 'HDF-01')
    const left = items.filter((i) => i.side === 'left')
    expect(left.map((i) => i.id)).toEqual(['EDGE-17', 'EDGE-22'])
    expect(left.every((i) => i.x === -FOCUS_COLUMN)).toBe(true)
    // Heights differ with the rows each card carries; the column is centered.
    const gap =
      left[1].y - left[1].height / 2 - (left[0].y + left[0].height / 2)
    expect(gap).toBe(FOCUS_GAP)
    expect(
      left[0].y - left[0].height / 2 + left[1].y + left[1].height / 2,
    ).toBe(0)
    const right = items.filter((i) => i.side === 'right')
    expect(right).toHaveLength(4)
    expect(right.reduce((n, i) => n + i.y, 0)).toBeCloseTo(0, 6)
  })

  it('puts ring k at k columns from the center', () => {
    const { items } = layout(campusSnapshot(), 'SW-01', { hops: 2, cap: 50 })
    const second = items.filter((i) => i.ring === 2)
    expect(second).toHaveLength(29)
    for (const i of second) expect(Math.abs(i.x)).toBe(2 * FOCUS_COLUMN)
  })

  it('never overlaps two cards, also with a ring of 29 and groups', () => {
    expectNoOverlap(layout(acceptanceSnapshot(), 'EDGE-17').items)
    expectNoOverlap(layout(acceptanceSnapshot(), 'HDF-01').items)
    expectNoOverlap(
      layout(campusSnapshot(), 'SW-01', { hops: 2, cap: 50 }).items,
    )
    expectNoOverlap(layout(campusSnapshot(), 'AGG-1').items)
  })

  it('is deterministic', () => {
    expect(layout(campusSnapshot(), 'SW-01', { hops: 2 })).toEqual(
      layout(campusSnapshot(), 'SW-01', { hops: 2 }),
    )
  })

  it('draws one line per center-neighbour pair with that pair’s circuits', () => {
    const { lines } = layout(acceptanceSnapshot(), 'EDGE-17')
    expect(lines.map((l) => [l.id, l.from, l.to, l.circuits.length])).toEqual([
      ['EDGE-17|AGG-03', 'EDGE-17', 'AGG-03', 1],
      ['EDGE-17|AGG-08', 'EDGE-17', 'AGG-08', 1],
      ['EDGE-17|BB-01', 'EDGE-17', 'BB-01', 1],
    ])
  })

  it('ring 2 lines start at the ring 1 equipment, not at the center', () => {
    const { lines } = layout(campusSnapshot(), 'SW-01', { hops: 2, cap: 50 })
    expect(lines[0]).toMatchObject({ from: 'SW-01', to: 'AGG-1' })
    const second = lines.filter((l) => l.from !== 'SW-01')
    expect(second).toHaveLength(29)
    expect(second.every((l) => l.from === 'AGG-1')).toBe(true)
    expect(second[0].circuits).toHaveLength(1)
  })

  it('a group is one card with one line from each parent', () => {
    const f = buildFocus(indexSnapshot(campusSnapshot()), 'AGG-1')
    const { items, lines } = focusLayout(indexSnapshot(campusSnapshot()), f)
    const groups = items.filter((i) => i.kind === 'group')
    expect(groups.map((g) => g.id)).toEqual(
      f.rings[0].groups.map((g) => groupKey(1, g)),
    )
    expect(lines.map((l) => [l.from, l.to, l.count])).toEqual(
      groups.map((g) => ['AGG-1', g.id, 10]),
    )
    expect(lines.every((l) => l.circuits.length === 0)).toBe(true)
    expect(
      groups.every(
        (g) =>
          g.height === focusCardHeight([{ kind: 'count', count: 10 }]) &&
          g.side === 'left',
      ),
    ).toBe(true)
  })
})

describe('CM-10 focus layout: cards grow with the rows they carry', () => {
  const mixed = () => {
    const t = acceptanceSnapshot()
    t.links.push({ id: 'X1', kind: 'cable', a: 'EDGE-17:p4', b: 'AGG-15:p1' })
    return layout(t, 'EDGE-17').items
  }

  it('a card with three step lines is taller than a direct card', () => {
    const items = mixed()
    const steps = items.find((i) => i.id === 'AGG-03')!
    const direct = items.find((i) => i.id === 'AGG-15')!
    expect(steps.height).toBeGreaterThan(direct.height)
    expect(direct.height).toBe(focusCardHeight([{ kind: 'direct' }]))
    // "via" and three steps are four lines; "direct" is one.
    expect(steps.height - direct.height).toBe(3 * FOCUS_ROW_LINE)
    expect(direct.height).toBeGreaterThan(FOCUS_CARD_HEIGHT)
  })

  it('a bare card is the base height; a second row adds its parent line and its own', () => {
    expect(focusCardHeight([])).toBe(FOCUS_CARD_HEIGHT)
    const one = focusCardHeight([{ kind: 'direct' }])
    const two = focusCardHeight([{ kind: 'direct' }, { kind: 'direct' }])
    expect(two - one).toBe(3 * FOCUS_ROW_LINE) // two parent lines, one more row, minus nothing shared
  })

  it('stacks mixed heights with exactly FOCUS_GAP between cards, centered on y = 0', () => {
    const items = mixed()
    const column = items
      .filter((i) => i.side === 'right')
      .sort((a, b) => a.y - b.y)
    expect(new Set(column.map((i) => i.height)).size).toBeGreaterThan(1)
    for (let i = 1; i < column.length; i++)
      expect(
        column[i].y -
          column[i].height / 2 -
          (column[i - 1].y + column[i - 1].height / 2),
      ).toBeCloseTo(FOCUS_GAP, 6)
    const top = column[0].y - column[0].height / 2
    const bottom = column.at(-1)!.y + column.at(-1)!.height / 2
    expect((top + bottom) / 2).toBeCloseTo(0, 6)
    expectNoOverlap(items)
  })
})
