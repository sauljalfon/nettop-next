import { describe, expect, it } from 'vitest'
import { centerTarget } from './center'

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
