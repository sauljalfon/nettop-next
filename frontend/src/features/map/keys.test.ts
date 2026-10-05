import { describe, expect, it } from 'vitest'
import { shouldClearOnEscape } from './keys'

describe('Esc clears the highlight, except while typing', () => {
  it('ignores Esc while an input, select or textarea has focus', () => {
    for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA'])
      expect(shouldClearOnEscape({ tagName })).toBe(false)
  })

  it('ignores Esc in an editable element', () => {
    expect(
      shouldClearOnEscape({ tagName: 'DIV', isContentEditable: true }),
    ).toBe(false)
  })

  it('clears for a button, the page body, or no target', () => {
    expect(shouldClearOnEscape({ tagName: 'BUTTON' })).toBe(true)
    expect(shouldClearOnEscape({ tagName: 'BODY' })).toBe(true)
    expect(shouldClearOnEscape(null)).toBe(true)
  })
})
