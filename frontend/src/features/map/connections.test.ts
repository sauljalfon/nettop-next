import { describe, expect, it } from 'vitest'
import { labelMatches } from './connections'

describe('search by label', () => {
  it('matches "3C/5" and "3C / 5" alike, in any case', () => {
    expect(labelMatches('3C / 5', '3C/5')).toBe(true)
    expect(labelMatches('3C / 5', '3C / 5')).toBe(true)
    expect(labelMatches('3C / 5', '3c/5')).toBe(true)
  })

  it('matches a partial label', () => {
    expect(labelMatches('3C / 2', '3C')).toBe(true)
    expect(labelMatches('2D / 4', 'd')).toBe(true)
  })

  it('matches everything for an empty query and nothing for a stranger', () => {
    expect(labelMatches('3C / 5', '')).toBe(true)
    expect(labelMatches('3C / 5', 'zzz')).toBe(false)
  })
})
