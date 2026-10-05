import { describe, expect, it } from 'vitest'
import { stackIndex } from './stacking'

const base = { selected: false, popoverOpen: false, facets: 0 }

describe('POL-01 cards that grow or are in use are raised above their neighbors', () => {
  it('leaves an ordinary card at the bottom of the stack', () => {
    expect(stackIndex(base)).toBe(0)
  })

  it('raises a card that carries facets', () => {
    expect(stackIndex({ ...base, facets: 2 })).toBeGreaterThan(stackIndex(base))
  })

  it('raises a selected card above one that only carries facets', () => {
    expect(stackIndex({ ...base, selected: true })).toBeGreaterThan(
      stackIndex({ ...base, facets: 2 }),
    )
  })

  it('raises a card with its popover open above a selected one', () => {
    expect(stackIndex({ ...base, popoverOpen: true })).toBeGreaterThan(
      stackIndex({ ...base, selected: true }),
    )
  })

  it('uses the highest applicable level, never the sum', () => {
    expect(stackIndex({ selected: true, popoverOpen: true, facets: 3 })).toBe(
      stackIndex({ ...base, popoverOpen: true }),
    )
  })
})
