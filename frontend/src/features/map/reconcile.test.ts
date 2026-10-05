import { describe, expect, it } from 'vitest'
import { reconciledPosition } from './reconcile'

const projected = { x: 10, y: 20 }
const local = { x: 99, y: 88 }

describe('POL-03 local drag state versus the projected position', () => {
  it('keeps the card where it was dragged across ordinary refreshes', () => {
    expect(reconciledPosition(local, projected, false)).toEqual(local)
  })

  it('uses the projected position for a card that is new on the map', () => {
    expect(reconciledPosition(undefined, projected, false)).toEqual(projected)
  })

  it('takes the recomputed first layout after a reset, dropping dragged positions', () => {
    expect(reconciledPosition(local, projected, true)).toEqual(projected)
  })
})
