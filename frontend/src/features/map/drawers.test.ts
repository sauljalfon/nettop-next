import { describe, expect, it } from 'vitest'
import { drawerSides } from './drawers'

describe('POL-02 which side of the map an open drawer covers', () => {
  it('Explore and the equipment library open on the left', () => {
    expect(drawerSides('explorer')).toEqual({ left: true, right: false })
    expect(drawerSides('library')).toEqual({ left: true, right: false })
  })

  it('the Trace tool, inspector and plans open on the right', () => {
    for (const d of ['trace', 'inspector', 'plans'])
      expect(drawerSides(d)).toEqual({ left: false, right: true })
  })

  it('covers neither side when nothing is open', () => {
    expect(drawerSides(null)).toEqual({ left: false, right: false })
  })
})
