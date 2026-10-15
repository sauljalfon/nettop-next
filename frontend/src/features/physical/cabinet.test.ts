import { describe, expect, it } from 'vitest'
import {
  blockDetail,
  labelEvery,
  previewUnitPx,
  rackMetrics,
  unitLabel,
} from './cabinet'

describe('D33 a 1U row is max(26 px, what fits), capped at 30 px, with a 2 px gap', () => {
  it('gives a roomy rack 30 px a unit', () => {
    expect(rackMetrics(800, 12)).toEqual({ unitPx: 30, gap: 2 })
    expect(rackMetrics(1400, 42)).toEqual({ unitPx: 30, gap: 2 })
  })

  it('a tall rack never shrinks below 26 px; it scrolls instead', () => {
    expect(rackMetrics(800, 42)).toEqual({ unitPx: 26, gap: 2 })
    expect(rackMetrics(594, 42)).toEqual({ unitPx: 26, gap: 2 })
    expect(rackMetrics(0, 12)).toEqual({ unitPx: 26, gap: 2 })
    expect(rackMetrics(100, 42)).toEqual({ unitPx: 26, gap: 2 })
    expect(rackMetrics(500, 0)).toEqual({ unitPx: 26, gap: 2 })
  })

  it('the gap is always 2 and the unit is always 26 to 30 px', () => {
    for (const units of [1, 12, 20, 42, 60])
      for (const space of [0, 300, 414, 594, 700, 900, 1400]) {
        const m = rackMetrics(space, units)
        expect(m.gap).toBe(2)
        expect(m.unitPx).toBeGreaterThanOrEqual(26)
        expect(m.unitPx).toBeLessThanOrEqual(30)
      }
  })

  it('a taller rack never gets a taller unit', () => {
    expect(rackMetrics(1100, 42).unitPx).toBeLessThanOrEqual(
      rackMetrics(1100, 24).unitPx,
    )
    expect(rackMetrics(1100, 24).unitPx).toBeLessThanOrEqual(
      rackMetrics(1100, 12).unitPx,
    )
  })

  it('when the rack fits, the whole rack, gaps included, fits its space', () => {
    for (const units of [12, 20, 42])
      for (const space of [300, 594, 900, 1200, 1400]) {
        const m = rackMetrics(space, units)
        if (m.unitPx > 26)
          expect(m.unitPx * units + m.gap * (units - 1)).toBeLessThanOrEqual(
            space,
          )
      }
  })
})

describe('RK-01 unit labels: every unit when there is room, else every fifth', () => {
  it('labels every unit from 18 px up, and every fifth below', () => {
    expect(labelEvery(18)).toBe(1)
    expect(labelEvery(30)).toBe(1)
    expect(labelEvery(17)).toBe(5)
    expect(labelEvery(14)).toBe(5)
  })

  it('says which units get a label and which are bold: every fifth', () => {
    const all = Array.from({ length: 12 }, (_, i) => 12 - i)
    expect(all.flatMap((u) => (unitLabel(u, 1).show ? [u] : []))).toEqual(all)
    expect(all.filter((u) => unitLabel(u, 1).strong)).toEqual([10, 5])
    const tall = Array.from({ length: 42 }, (_, i) => 42 - i)
    expect(tall.filter((u) => unitLabel(u, 5).show)).toEqual([
      40, 35, 30, 25, 20, 15, 10, 5,
    ])
    expect(tall.filter((u) => unitLabel(u, 5).strong)).toEqual([
      40, 35, 30, 25, 20, 15, 10, 5,
    ])
  })
})

describe('RK-02 the name and the small line go on the block only when there is room', () => {
  it('shows both lines from 30 px, the name alone from 12 px, nothing below', () => {
    expect(blockDetail(30)).toBe('full')
    expect(blockDetail(96)).toBe('full')
    expect(blockDetail(29)).toBe('name')
    expect(blockDetail(14)).toBe('name')
    expect(blockDetail(11)).toBe('none')
  })
})

describe('node previews use a fixed small height', () => {
  it('a 42U rack is about 260 px; a 12U rack keeps its 11 px units', () => {
    expect(previewUnitPx(12)).toBe(11)
    expect(Math.round(previewUnitPx(42) * 42)).toBeGreaterThanOrEqual(255)
    expect(Math.round(previewUnitPx(42) * 42)).toBeLessThanOrEqual(262)
    expect(previewUnitPx(100) * 100).toBeLessThanOrEqual(262)
  })
})
