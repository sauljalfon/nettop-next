import { describe, expect, it } from 'vitest'
import { FIT, FIT_MANY, fitViewport } from './center'
import { HIERARCHY_FIT, hierarchyFit } from './hierarchyFit'

const size = { width: 1440, height: 900 }
const covers = { left: 380, right: 0, top: 0, bottom: 0 }

describe('OV-02 the hierarchy fit', () => {
  it('is its own option, and leaves FIT and FIT_MANY as they are', () => {
    expect(hierarchyFit()).toBe(HIERARCHY_FIT)
    expect(HIERARCHY_FIT).toMatchObject({ fit: 'width', minZoom: 0.6 })
    expect(FIT).not.toHaveProperty('fit')
    expect(FIT_MANY).toEqual({
      padding: 40,
      minZoom: 0.6,
      maxZoom: 1,
      anchor: 'top',
    })
  })

  it('fits a tall narrow tree by its width, at 1 at most, starting at its top', () => {
    const bounds = { x: 0, y: 44, width: 760, height: 3000 }
    const v = fitViewport(bounds, size, covers, hierarchyFit())
    expect(v.zoom).toBe(1)
    // The top row sits at the top padding; the tree is centred in the free width.
    expect(v.y + bounds.y * v.zoom).toBeCloseTo(HIERARCHY_FIT.padding)
    expect(v.x + (bounds.x + bounds.width / 2) * v.zoom).toBeCloseTo(
      380 + (1440 - 380) / 2,
    )
  })

  it('zooms out for a tree wider than the room, never below 0.6', () => {
    const wide = { x: 0, y: 0, width: 1400, height: 3000 }
    const v = fitViewport(wide, size, covers, hierarchyFit())
    expect(v.zoom).toBeCloseTo((1440 - 380 - 80) / 1400)
    const wider = { x: 0, y: 0, width: 4000, height: 3000 }
    expect(fitViewport(wider, size, covers, hierarchyFit()).zoom).toBe(0.6)
  })

  it('still fits a small tree whole, as before', () => {
    const small = { x: 0, y: 44, width: 760, height: 300 }
    expect(fitViewport(small, size, covers, hierarchyFit())).toEqual(
      fitViewport(small, size, covers, FIT),
    )
  })
})
