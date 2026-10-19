import { describe, expect, it } from 'vitest'
import { FIT, FIT_MANY } from './center'
import { overviewFit } from './overviewFit'

describe('CM-12 the overview fit', () => {
  it('12 nodes or fewer: the plain fit, as before', () => {
    expect(overviewFit(0)).toBe(FIT)
    expect(overviewFit(6)).toBe(FIT)
    expect(overviewFit(12)).toBe(FIT)
  })

  it('13 nodes or more: zoom 0.6 at least, starting at the top', () => {
    expect(overviewFit(13)).toBe(FIT_MANY)
    expect(overviewFit(13)).toMatchObject({ minZoom: 0.6, anchor: 'top' })
    expect(overviewFit(40)).toBe(FIT_MANY)
  })
})
