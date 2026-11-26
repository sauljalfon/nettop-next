import { describe, expect, it } from 'vitest'
import { nameDir } from './nameDir'

describe('nameDir', () => {
  it('follows the first letter, like dir="auto"', () => {
    expect(nameDir('מתג גישה C9300')).toBe('rtl')
    expect(nameDir('9300 מתג')).toBe('rtl')
    expect(nameDir('C9300 מתג')).toBe('ltr')
    expect(nameDir('123')).toBe('ltr')
  })
})
