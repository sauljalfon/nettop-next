import { describe, expect, it } from 'vitest'
import {
  centerTarget,
  coversFromRects,
  viewportFor,
  visibleCenter,
} from './center'

describe('POL-05 centering on a card', () => {
  it('targets the middle of the measured card', () => {
    expect(centerTarget({ x: 100, y: 40, width: 240, height: 120 })).toEqual({
      x: 220,
      y: 100,
    })
  })

  it('falls back to the top-left corner for a card that is not measured yet', () => {
    expect(centerTarget({ x: 100, y: 40, width: 0, height: 0 })).toEqual({
      x: 100,
      y: 40,
    })
  })
})

const surface = { left: 0, top: 66, right: 1440, bottom: 1050 }
const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
})

describe('POL-05 covered areas of the canvas', () => {
  it('has none when nothing overlaps it', () => {
    expect(coversFromRects(surface, [])).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    })
  })

  it('reads a tall panel near the left edge as a left cover, up to its right edge', () => {
    const drawer = rect(91, 146, 461, 1030) // Explore: left 91, 370 wide
    expect(coversFromRects(surface, [drawer])).toEqual({
      left: 461,
      right: 0,
      top: 0,
      bottom: 0,
    })
  })

  it('reads a tall panel near the right edge as a right cover, from its left edge', () => {
    const drawer = rect(1023, 146, 1423, 1030) // inspector: right 17, 400 wide
    expect(coversFromRects(surface, [drawer])).toEqual({
      left: 0,
      right: 417,
      top: 0,
      bottom: 0,
    })
  })

  it('reads a short wide overlay at the bottom as a bottom cover', () => {
    const results = rect(100, 846, 1360, 1033)
    expect(coversFromRects(surface, [results])).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 204,
    })
  })

  it('combines a drawer with the results overlay, taking the largest on each side', () => {
    const covers = coversFromRects(surface, [
      rect(91, 146, 461, 1030),
      rect(477, 846, 1360, 1033),
      rect(91, 200, 300, 1030),
    ])
    expect(covers).toEqual({ left: 461, right: 0, top: 0, bottom: 204 })
  })

  it('ignores anything outside the canvas', () => {
    expect(coversFromRects(surface, [rect(0, 0, 1440, 60)])).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    })
  })
})

describe('POL-05 the center of what is actually visible', () => {
  const size = { width: 1440, height: 984 }
  it('is the middle of the canvas with nothing open', () => {
    expect(
      visibleCenter(size, { left: 0, right: 0, top: 0, bottom: 0 }),
    ).toEqual({ x: 720, y: 492 })
  })

  it('leaves out an open left drawer', () => {
    expect(
      visibleCenter(size, { left: 461, right: 0, top: 0, bottom: 0 }),
    ).toEqual({ x: 950.5, y: 492 })
  })

  it('leaves out an open right drawer', () => {
    expect(
      visibleCenter(size, { left: 0, right: 417, top: 0, bottom: 0 }),
    ).toEqual({ x: 511.5, y: 492 })
  })

  it('leaves out the results overlay at the bottom', () => {
    expect(
      visibleCenter(size, { left: 0, right: 0, top: 0, bottom: 204 }),
    ).toEqual({ x: 720, y: 390 })
  })

  it('falls back to the whole canvas when the covers leave no room', () => {
    expect(
      visibleCenter(size, { left: 800, right: 800, top: 0, bottom: 0 }),
    ).toEqual({ x: 720, y: 492 })
  })
})

describe('POL-05 the viewport that puts a point where we want it', () => {
  it('places the target at the screen point without changing zoom', () => {
    expect(viewportFor({ x: 220, y: 100 }, { x: 950, y: 390 }, 0.5)).toEqual({
      x: 950 - 110,
      y: 390 - 50,
      zoom: 0.5,
    })
  })
})
