import { describe, expect, it } from 'vitest'
import { fitZoom, stepZoom, wheelZoom } from './zoom'

describe('fitZoom', () => {
  it('on the page fits the width only and never magnifies past 1', () => {
    expect(fitZoom({ w: 2000, h: 5000 }, { w: 1000, h: 400 }, false)).toBe(0.5)
    expect(fitZoom({ w: 500, h: 100 }, { w: 1000, h: 400 }, false)).toBe(1)
  })
  it('in Picture only fits width and height, up to 2.5', () => {
    expect(fitZoom({ w: 2000, h: 1000 }, { w: 1000, h: 400 }, true)).toBe(0.4)
    expect(fitZoom({ w: 100, h: 50 }, { w: 1000, h: 800 }, true)).toBe(2.5)
  })
  it('is never below 0.3, and survives an empty content or box', () => {
    expect(fitZoom({ w: 100000, h: 10 }, { w: 1000, h: 400 }, false)).toBe(0.3)
    expect(fitZoom({ w: 0, h: 0 }, { w: 1000, h: 400 }, true)).toBe(2.5)
    expect(fitZoom({ w: 500, h: 500 }, { w: 0, h: 0 }, false)).toBe(0.3)
  })
})

describe('stepZoom', () => {
  it('multiplies or divides by 1.25', () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.25)
    expect(stepZoom(1, -1)).toBeCloseTo(0.8)
  })
  it('clamps to 0.3 to 4', () => {
    expect(stepZoom(0.31, -1)).toBe(0.3)
    expect(stepZoom(3.9, 1)).toBe(4)
  })
})

describe('wheelZoom', () => {
  it('scrolling up zooms in, down zooms out, by exp(-delta * 0.005)', () => {
    expect(wheelZoom(1, -20)).toBeCloseTo(Math.exp(0.1))
    expect(wheelZoom(1, 20)).toBeCloseTo(Math.exp(-0.1))
  })
  it('limits one event to 50 and the result to 0.3 to 4', () => {
    expect(wheelZoom(1, -1000)).toBeCloseTo(Math.exp(0.25))
    expect(wheelZoom(1, 1000)).toBeCloseTo(Math.exp(-0.25))
    expect(wheelZoom(0.3, 50)).toBe(0.3)
    expect(wheelZoom(4, -50)).toBe(4)
  })
})
