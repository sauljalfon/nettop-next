import { describe, expect, it } from 'vitest'
import {
  UNRESOLVED_COLOR,
  colorOf,
  networkColors,
  PALETTE,
} from './networkColors'

const nets = (...ids: string[]) =>
  ids.map((id) => ({ id, name: `Network ${id}` }))

describe('POL-17 network colors', () => {
  it('gives each network a palette color in network order', () => {
    const colors = networkColors(nets('A', 'B'))
    expect(colors.get('A')).toBe(PALETTE[0])
    expect(colors.get('B')).toBe(PALETTE[1])
    expect(PALETTE[0]).not.toBe(PALETTE[1])
  })

  it('is stable: a network keeps its color when later networks are added', () => {
    expect(networkColors(nets('A', 'B', 'C')).get('A')).toBe(
      networkColors(nets('A')).get('A'),
    )
  })

  it('wraps around when there are more networks than colors', () => {
    const ids = Array.from({ length: PALETTE.length + 1 }, (_, i) => `N${i}`)
    expect(networkColors(nets(...ids)).get(`N${PALETTE.length}`)).toBe(
      PALETTE[0],
    )
  })

  it('uses grey for an unresolved or unknown network', () => {
    const colors = networkColors(nets('A'))
    expect(colorOf(colors, '')).toBe(UNRESOLVED_COLOR)
    expect(colorOf(colors, 'ZZ')).toBe(UNRESOLVED_COLOR)
    expect(colorOf(colors, 'A')).toBe(PALETTE[0])
    expect(PALETTE).not.toContain(UNRESOLVED_COLOR)
  })
})
