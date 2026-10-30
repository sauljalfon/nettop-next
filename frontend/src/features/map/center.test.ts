import { describe, expect, it } from 'vitest'
import {
  centerTarget,
  coversFromRects,
  withToolRail,
  fitViewport,
  panToShow,
  panToShowFirstFit,
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

describe('POL-14 fitting the view to some cards, in the visible area', () => {
  const size = { width: 1440, height: 984 }
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const bounds = { x: 100, y: 200, width: 640, height: 300 }

  it('is capped at zoom 1: a few cards are not blown up', () => {
    const v = fitViewport(bounds, size, none)
    expect(v.zoom).toBe(1)
    // The middle of the cards lands at the middle of the canvas.
    expect(v.x + (100 + 320) * v.zoom).toBeCloseTo(720)
    expect(v.y + (200 + 150) * v.zoom).toBeCloseTo(492)
  })

  it('zooms out to fit tall or wide bounds, with padding', () => {
    const v = fitViewport(
      { x: 0, y: 0, width: 400, height: 2000 },
      size,
      none,
      { padding: 48 },
    )
    expect(v.zoom).toBeCloseTo((984 - 96) / 2000)
    const w = fitViewport(
      { x: 0, y: 0, width: 4000, height: 100 },
      size,
      none,
      { padding: 40 },
    )
    expect(w.zoom).toBeCloseTo((1440 - 80) / 4000)
  })

  it('fits inside the part that is not covered, and centers there', () => {
    const covers = { left: 461, right: 0, top: 0, bottom: 204 }
    const v = fitViewport(
      { x: 0, y: 0, width: 2000, height: 2000 },
      size,
      covers,
      { padding: 48 },
    )
    expect(v.zoom).toBeCloseTo(
      Math.min((1440 - 461 - 96) / 2000, (984 - 204 - 96) / 2000),
    )
    // The bounds' center (1000, 1000) is at the middle of the visible area.
    expect(v.x + 1000 * v.zoom).toBeCloseTo(461 + (1440 - 461) / 2)
    expect(v.y + 1000 * v.zoom).toBeCloseTo((984 - 204) / 2)
  })

  it('keeps every corner of the bounds inside the visible area, padding included', () => {
    const covers = { left: 0, right: 417, top: 0, bottom: 204 }
    const b = { x: -300, y: 50, width: 1800, height: 900 }
    const v = fitViewport(b, size, covers, { padding: 48 })
    const left = v.x + b.x * v.zoom
    const right = v.x + (b.x + b.width) * v.zoom
    const top = v.y + b.y * v.zoom
    const bottom = v.y + (b.y + b.height) * v.zoom
    expect(left).toBeGreaterThanOrEqual(48 - 0.001)
    expect(right).toBeLessThanOrEqual(1440 - 417 - 48 + 0.001)
    expect(top).toBeGreaterThanOrEqual(48 - 0.001)
    expect(bottom).toBeLessThanOrEqual(984 - 204 - 48 + 0.001)
  })

  it('never zooms below the minimum', () => {
    expect(
      fitViewport({ x: 0, y: 0, width: 100000, height: 100000 }, size, none)
        .zoom,
    ).toBe(0.25)
  })

  it('copes with empty bounds and with covers that leave no room', () => {
    expect(
      fitViewport({ x: 5, y: 5, width: 0, height: 0 }, size, none).zoom,
    ).toBe(1)
    const v = fitViewport(bounds, size, {
      left: 800,
      right: 800,
      top: 0,
      bottom: 0,
    })
    expect(Number.isFinite(v.x) && Number.isFinite(v.zoom)).toBe(true)
  })
})

describe('PHY-13 a readable floor keeps the top of tall bounds in view', () => {
  const size = { width: 1440, height: 900 }
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const tall = { x: 100, y: 50, width: 1200, height: 9000 }

  it('floors the zoom and, with anchor top, starts at the top of the bounds instead of their middle', () => {
    const v = fitViewport(tall, size, none, {
      padding: 40,
      minZoom: 0.6,
      anchor: 'top',
    })
    expect(v.zoom).toBe(0.6)
    expect(v.y + 50 * v.zoom).toBeCloseTo(40) // the top edge sits at the padding
    expect(v.x + (100 + 600) * v.zoom).toBeCloseTo(720) // still centered across
  })

  it('centers as before when the zoom is not floored, or with no anchor', () => {
    const small = { x: 0, y: 0, width: 800, height: 400 }
    const a = fitViewport(small, size, none, { anchor: 'top', minZoom: 0.6 })
    const b = fitViewport(small, size, none, { minZoom: 0.6 })
    expect(a).toEqual(b)
    const c = fitViewport(tall, size, none, { minZoom: 0.6 })
    expect(c.y + (50 + 4500) * 0.6).toBeCloseTo(450)
  })
})

describe('LY-05 the first fit keeps a readable zoom and shows the top-left of a large map', () => {
  const size = { width: 1440, height: 900 }
  const covers = { left: 461, right: 0, top: 0, bottom: 204 }
  const campus = { x: 0, y: 0, width: 12560, height: 8400 }

  it('floors the zoom at 0.5 and puts the map’s top-left corner in the visible area’s top-left, clear of covers', () => {
    const v = fitViewport(campus, size, covers, {
      padding: 48,
      minZoom: 0.5,
      anchor: 'top-left',
    })
    expect(v.zoom).toBe(0.5)
    expect(v.x).toBeCloseTo(461 + 48)
    expect(v.y).toBeCloseTo(48)
  })

  it('a small map is still fitted whole and centered (zoom above the floor)', () => {
    const small = { x: 0, y: 0, width: 1600, height: 800 }
    const a = fitViewport(small, size, covers, {
      minZoom: 0.5,
      anchor: 'top-left',
    })
    const b = fitViewport(small, size, covers, { minZoom: 0.5 })
    expect(a).toEqual(b)
    expect(a.zoom).toBeGreaterThan(0.5)
  })
})

describe('POL-31 the tool rail covers the canvas edge too', () => {
  const rail = rect(17, 156, 82, 423) // the rail: short, at the far left

  it('adds its right edge to the left cover, even though it is not a tall panel', () => {
    const covers = { left: 0, right: 417, top: 0, bottom: 300 }
    expect(withToolRail(covers, surface, rail)).toEqual({
      ...covers,
      left: 82,
    })
  })

  it('keeps a larger left cover (an open left drawer)', () => {
    const covers = { left: 461, right: 0, top: 0, bottom: 0 }
    expect(withToolRail(covers, surface, rail).left).toBe(461)
  })

  it('does nothing without a rail, or when the rail is not at the left edge', () => {
    const covers = { left: 0, right: 0, top: 0, bottom: 0 }
    expect(withToolRail(covers, surface, undefined)).toEqual(covers)
    expect(withToolRail(covers, surface, rect(900, 156, 960, 423))).toEqual(
      covers,
    )
  })
})

describe("fitViewport's fit: 'width' option", () => {
  const size = { width: 1000, height: 600 }
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const opts = { padding: 40, minZoom: 0.5, maxZoom: 1, fit: 'width' as const }

  it('fits the width of bounds that are too tall to fit whole, starting at their top', () => {
    const v = fitViewport(
      { x: 10, y: 20, width: 800, height: 5000 },
      size,
      none,
      opts,
    )
    expect(v.zoom).toBe(1) // 920 / 800 is capped at maxZoom
    expect(v.y + 20 * v.zoom).toBeCloseTo(40)
  })

  it('does not change a fit that shows the bounds whole', () => {
    const b = { x: 0, y: 0, width: 400, height: 300 }
    expect(fitViewport(b, size, none, opts)).toEqual(
      fitViewport(b, size, none, { ...opts, fit: undefined }),
    )
  })

  it('is not used by the default options', () => {
    const b = { x: 0, y: 0, width: 800, height: 5000 }
    expect(fitViewport(b, size, none).zoom).toBe(0.25)
  })
})

describe('panToShow', () => {
  const size = { width: 1000, height: 600 }
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const at = { x: 0, y: 0, zoom: 1 }

  it('returns nothing when the box is already in view', () => {
    expect(
      panToShow({ x: 100, y: 100, width: 200, height: 40 }, at, size, none),
    ).toBeUndefined()
  })

  it('pans by the least that brings the box in, keeping the zoom', () => {
    const view = panToShow(
      { x: 1100, y: 100, width: 200, height: 40 },
      { x: 0, y: 0, zoom: 0.5 },
      size,
      none,
    )
    // On screen it is at x 550..650: inside. Nothing to do.
    expect(view).toBeUndefined()
    const far = panToShow(
      { x: 1100, y: 100, width: 200, height: 40 },
      at,
      size,
      none,
    )!
    expect(far.zoom).toBe(1)
    expect(far.y).toBe(0)
    // The right edge (1300) ends 24px inside the canvas's right edge.
    expect(far.x + 1300).toBe(1000 - 24)
  })

  it('keeps the box out from under what covers the canvas', () => {
    const view = panToShow(
      { x: 700, y: 100, width: 200, height: 40 },
      at,
      size,
      { ...none, right: 410 },
    )!
    expect(view.x + 900).toBe(1000 - 410 - 24)
  })

  it('aligns a box wider than the free area by its start', () => {
    const view = panToShow(
      { x: 300, y: 100, width: 2000, height: 40 },
      at,
      size,
      { ...none, left: 60 },
    )!
    expect(view.x + 300).toBe(60 + 24)
  })

  it('brings a box below the canvas up', () => {
    const view = panToShow(
      { x: 100, y: 900, width: 200, height: 100 },
      at,
      size,
      none,
    )!
    expect(view.y + 1000).toBe(600 - 24)
    expect(view.x).toBe(0)
  })
})

describe('panToShowFirstFit', () => {
  const size = { width: 1000, height: 600 }
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const at = { x: 0, y: 0, zoom: 1 }
  const wide = { x: 100, y: 100, width: 800, height: 40 }
  const narrow = { x: 700, y: 100, width: 200, height: 40 }

  it('pans to the first box when it fits the free area', () => {
    const view = panToShowFirstFit([wide, narrow], at, size, {
      ...none,
      right: 100,
    })!
    expect(view.x + 100).toBeGreaterThanOrEqual(24)
    expect(view.x + 900).toBeLessThanOrEqual(1000 - 100 - 24)
  })

  it('falls back to the next box when the first does not fit', () => {
    const view = panToShowFirstFit([wide, narrow], at, size, {
      ...none,
      right: 400,
    })!
    expect(view.x + 900).toBe(1000 - 400 - 24)
  })

  it('does nothing when the box it would use is already in view, and never zooms', () => {
    expect(panToShowFirstFit([wide, narrow], at, size, none)).toBeUndefined()
    const view = panToShowFirstFit(
      [wide, narrow],
      { x: 0, y: 0, zoom: 1.5 },
      size,
      { ...none, right: 400 },
    )
    expect(view?.zoom ?? 1.5).toBe(1.5)
  })
})
