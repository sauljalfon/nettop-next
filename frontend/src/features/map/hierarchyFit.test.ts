import { describe, expect, it } from 'vitest'
import { FIT, FIT_MANY } from './center'
import { hierarchyFit } from './hierarchyFit'

describe('HI-06 the hierarchy fit', () => {
  it('12 node cards or fewer: the plain fit', () => {
    expect(hierarchyFit(0)).toBe(FIT)
    expect(hierarchyFit(12)).toBe(FIT)
  })

  it('13 node cards or more: zoom 0.6 at least, starting at the top', () => {
    expect(hierarchyFit(13)).toBe(FIT_MANY)
    expect(hierarchyFit(13)).toMatchObject({ minZoom: 0.6, anchor: 'top' })
    expect(hierarchyFit(50)).toBe(FIT_MANY)
  })
})
