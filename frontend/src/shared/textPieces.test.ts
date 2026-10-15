import { describe, expect, it } from 'vitest'
import { optionText, piecesText } from './textPieces'

const LRM = '‎'

describe('optionText: names inside an <option>, which cannot hold a <bdi>', () => {
  it('marks the text after a name left-to-right, after its leading separator', () => {
    expect(optionText([{ name: 'ארון 03' }, { text: ' · 12U' }])).toBe(
      `ארון 03 · ${LRM}12U`,
    )
    expect(optionText([{ name: 'ארון 03' }, { text: ' (2)' }])).toBe(
      `ארון 03 (${LRM}2)`,
    )
  })

  it('keeps "<name> ·" whole, so a search by the name and its separator still finds it', () => {
    expect(
      optionText([{ name: 'Rack A03' }, { text: ' · 12U' }]).startsWith(
        'Rack A03 ·',
      ),
    ).toBe(true)
  })

  it('leaves text before any name, and a lone name, as they are', () => {
    expect(optionText([{ text: 'Rack ' }, { name: 'A' }])).toBe('Rack A')
    expect(optionText([{ name: 'פאנל ראשי 1' }])).toBe('פאנל ראשי 1')
  })

  it('reads the same as piecesText once the marks are removed', () => {
    const pieces = [{ name: 'פאנל ראשי 1' }, { text: ' · 41 free' }]
    expect(optionText(pieces).replaceAll(LRM, '')).toBe(piecesText(pieces))
  })
})
