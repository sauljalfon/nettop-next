import { describe, expect, it } from 'vitest'
import {
  blockDetail,
  labelEvery,
  previewUnitPx,
  rackMetrics,
  unitLabel,
} from './cabinet'

describe('RK-01 a rack fits the available height', () => {
  it('gives a roomy rack up to 30 px a unit and a 2 px gap, and 42U about 17 px', () => {
    expect(rackMetrics(800, 12)).toEqual({ unitPx: 30, gap: 2 })
    expect(rackMetrics(800, 42)).toEqual({ unitPx: 17, gap: 2 })
  })

  it('a tight rack shrinks to a 1 px gap and units below 14 px so it still fits', () => {
    // 594 px for 42U (a 1440×900 window with a results panel): 13 px units.
    expect(rackMetrics(594, 42)).toEqual({ unitPx: 13, gap: 1 })
    // 414 px for 42U (1280×720): 8 px units.
    expect(rackMetrics(414, 42)).toEqual({ unitPx: 8, gap: 1 })
  })

  it('never goes below 7 px; then the page scrolls', () => {
    expect(rackMetrics(100, 42)).toEqual({ unitPx: 7, gap: 1 })
    expect(rackMetrics(0, 12)).toEqual({ unitPx: 7, gap: 1 })
  })

  it('a taller rack never gets a taller unit', () => {
    expect(rackMetrics(700, 42).unitPx).toBeLessThanOrEqual(
      rackMetrics(700, 24).unitPx,
    )
    expect(rackMetrics(700, 24).unitPx).toBeLessThanOrEqual(
      rackMetrics(700, 12).unitPx,
    )
  })

  it('the whole rack, gaps included, fits its space unless the minimum applies', () => {
    for (const units of [12, 20, 42])
      for (const space of [300, 414, 500, 594, 700, 900]) {
        const m = rackMetrics(space, units)
        if (m.unitPx > 7)
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
