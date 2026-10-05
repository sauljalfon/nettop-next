import { describe, expect, it } from 'vitest'
import { SPLIT_GAP, splitPath } from './splitPath'

const [sx, sy, tx, ty] = [100, 50, 400, 130]
const line = (index: number, count = 3, gap = 24) =>
  splitPath(sx, sy, tx, ty, index, count, gap)
const start = (d: string) =>
  d
    .match(/^M([\d.-]+),([\d.-]+)/)!
    .slice(1)
    .map(Number)
const end = (d: string) =>
  d
    .match(/([\d.-]+),([\d.-]+)$/)!
    .slice(1)
    .map(Number)

describe('POL-18 split path', () => {
  it('starts and ends exactly on the handles, whatever the index', () => {
    for (let i = 0; i < 3; i++) {
      const [d] = line(i)
      expect(start(d)).toEqual([sx, sy])
      expect(end(d)).toEqual([tx, ty])
    }
  })

  it('puts neighbouring midpoints exactly one gap apart', () => {
    const y = [0, 1, 2].map((i) => line(i)[2])
    expect(y[1] - y[0]).toBeCloseTo(24)
    expect(y[2] - y[1]).toBeCloseTo(24)
    expect(line(0, 3, 30)[2] - line(1, 3, 30)[2]).toBeCloseTo(-30)
  })

  it('is symmetric around the straight line between the handles', () => {
    const mid = (sy + ty) / 2
    const [, x0, y0] = line(0)
    const [, x1, y1] = line(1)
    const [, x2, y2] = line(2)
    expect(x0).toBeCloseTo((sx + tx) / 2)
    expect(x1).toBeCloseTo(x0)
    expect(x2).toBeCloseTo(x0)
    expect(y1).toBeCloseTo(mid)
    expect(mid - y0).toBeCloseTo(y2 - mid)
  })

  it('is symmetric for an even count and leaves a single line straight-centered', () => {
    const mid = (sy + ty) / 2
    expect(mid - line(0, 2)[2]).toBeCloseTo(line(1, 2)[2] - mid)
    expect(line(0, 1)[2]).toBeCloseTo(mid)
  })

  it('keeps the gap at least the cable-ID label height', () => {
    expect(SPLIT_GAP).toBeGreaterThanOrEqual(22)
  })
})
