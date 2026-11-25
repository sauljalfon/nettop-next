import { describe, expect, it } from 'vitest'
import {
  bandCounts,
  bandRows,
  chooseFit,
  hdfHead,
  trialBands,
  type FitTrial,
} from './faceFit'

describe('bandCounts', () => {
  it('keeps 1 and every count up to half the rows', () => {
    expect(bandCounts(1)).toEqual([1])
    expect(bandCounts(3)).toEqual([1])
    expect(bandCounts(12)).toEqual([1, 2, 3, 4, 6])
    expect(bandCounts(32)).toEqual([1, 2, 3, 4, 6, 8])
  })
})

describe('bandRows', () => {
  it('splits rows highest first into equal runs', () => {
    expect(bandRows(12, 2)).toEqual([
      [12, 11, 10, 9, 8, 7],
      [6, 5, 4, 3, 2, 1],
    ])
  })
  it('lets the last band be shorter', () => {
    const b = bandRows(32, 3)
    expect(b.map((x) => x.length)).toEqual([11, 11, 10])
    expect(b[0][0]).toBe(32)
    expect(b[0][10]).toBe(22)
    expect(b[1][0]).toBe(21)
    expect(b[1][10]).toBe(11)
    expect(b[2][0]).toBe(10)
    expect(b[2][9]).toBe(1)
  })
  it('never makes an empty band', () => {
    // 5 rows in 4 bands: runs of 2 -> 2,2,1 (three bands)
    expect(bandRows(5, 4)).toEqual([[5, 4], [3, 2], [1]])
    expect(bandRows(5, 4).every((b) => b.length > 0)).toBe(true)
  })
})

// A plate that is (20 + 10*(j-20)/... ) simple: w = a + bw*j, h = c + bh*j.
const trial = (
  bands: number,
  a: number,
  bw: number,
  c: number,
  bh: number,
): FitTrial => ({
  bands,
  w20: a + 20 * bw,
  h20: c + 20 * bh,
  w40: a + 40 * bw,
  h40: c + 40 * bh,
})

describe('chooseFit', () => {
  it('is width limited: jw = (room.w - a) / bw', () => {
    // a=20, bw=10: jw = (420-20)/10 = 40; height roomy: jh = (1000-0)/10 = 100
    const t = trial(1, 20, 10, 0, 10)
    expect(chooseFit([t], { w: 420, h: 1000 }, 60)).toEqual({
      bands: 1,
      jack: 40,
    })
  })
  it('is height limited: jh below jw, above the floor', () => {
    // jw = 100, jh = (300-0)/10 = 30
    const t = trial(1, 0, 10, 0, 10)
    expect(chooseFit([t], { w: 1000, h: 300 }, 60)).toEqual({
      bands: 1,
      jack: 30,
    })
  })
  it('a taller band count wins when it is less height limited', () => {
    // 1 band: bh=40, jh=500/40=12.5 -> floor 18, jw=50 -> 18
    // 2 bands: bh=20, jh=25, jw=40 (bw=25) -> 25
    const one = trial(1, 0, 20, 0, 40)
    const two = trial(2, 0, 25, 0, 20)
    expect(chooseFit([one, two], { w: 1000, h: 500 }, 60)).toEqual({
      bands: 2,
      jack: 25,
    })
  })
  it('keeps the readable floor when the height would give less', () => {
    const t = trial(1, 0, 10, 0, 100) // jh = 5, jw = 100
    expect(chooseFit([t], { w: 1000, h: 500 }, 60)).toEqual({
      bands: 1,
      jack: 18,
    })
  })
  it('never lets the floor pass jw', () => {
    const t = trial(1, 0, 100, 0, 100) // jw = 10, jh = 5
    expect(chooseFit([t], { w: 1000, h: 500 }, 60)).toEqual({
      bands: 1,
      jack: 10,
    })
  })
  it('max caps the jack', () => {
    const t = trial(1, 0, 10, 0, 10) // jw 100, jh 100
    expect(chooseFit([t], { w: 1000, h: 1000 }, 32).jack).toBe(32)
  })
  it('a tie, or less than half a pixel better, goes to fewer bands', () => {
    const room = { w: 1000, h: 4000 }
    const one = trial(1, 0, 25, 0, 1) // jw 40
    const same = trial(2, 0, 25, 0, 1) // 40
    const near = trial(3, 0, 1000 / 40.4, 0, 1) // 40.4
    expect(chooseFit([one, same, near], room, 60).bands).toBe(1)
    const better = trial(2, 0, 1000 / 41, 0, 1) // 41
    expect(chooseFit([one, better], room, 60)).toEqual({ bands: 2, jack: 41 })
  })
  it('when every trial is held at the readable floor, the shortest plate wins', () => {
    // Both are height limited under 18 and fall back to 18 (jw is 40 and 20).
    // At 18px: one band is 18*40 = 720 tall, two bands 18*20 = 360.
    const room = { w: 800, h: 300 }
    const one = trial(1, 0, 20, 0, 40)
    const two = trial(2, 0, 40, 0, 20)
    expect(chooseFit([one, two], room, 60)).toEqual({ bands: 2, jack: 18 })
  })
  it('a floored jack still loses to a bigger one that fits', () => {
    // One band: jh 25 -> 25. Two bands: jh 10 -> floor 18, shorter but smaller.
    const room = { w: 2000, h: 500 }
    const one = trial(1, 0, 20, 0, 20)
    const two = trial(2, 0, 40, 0, 50)
    expect(chooseFit([one, two], room, 60)).toEqual({ bands: 1, jack: 25 })
  })
  it('floors the result', () => {
    const t = trial(1, 0, 10, 0, 10)
    expect(chooseFit([t], { w: 357, h: 1000 }, 60).jack).toBe(35)
  })
  it('treats a plate that did not grow as unconstrained, and no trials as max', () => {
    const flat: FitTrial = { bands: 1, w20: 100, h20: 50, w40: 100, h40: 50 }
    expect(chooseFit([flat], { w: 500, h: 500 }, 30).jack).toBe(30)
    expect(chooseFit([], { w: 500, h: 500 }, 30)).toEqual({
      bands: 1,
      jack: 30,
    })
  })
})

describe('trialBands', () => {
  it('skips counts that draw the same bands as an earlier one', () => {
    expect(trialBands(12)).toEqual([1, 2, 3, 4, 6])
    expect(trialBands(10)).toEqual([1, 2, 3, 4])
    expect(trialBands(9)).toEqual([1, 2, 3])
    expect(trialBands(3)).toEqual([1])
  })
})

describe('hdfHead', () => {
  it('names the side, and the row run when banded', () => {
    expect(hdfHead('rear', 12, 1)).toBe('rear')
    expect(hdfHead('front', 12, 2)).toBe('front · rows 12–1, left to right')
  })
})
