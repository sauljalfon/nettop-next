import { describe, expect, it } from 'vitest'
import { cardRoleLabel } from './cardRole'

const eq = (kind: 'switch' | 'panel' | 'hdf', role: string) => ({ kind, role })

describe('cardRoleLabel', () => {
  it('names the role of a switch', () => {
    expect(cardRoleLabel(eq('switch', 'access'))).toBe('Access')
    expect(cardRoleLabel(eq('switch', 'aggregation'))).toBe('Aggregation')
    expect(cardRoleLabel(eq('switch', 'backbone'))).toBe('Backbone')
  })
  it('names a passive by its kind', () => {
    expect(cardRoleLabel(eq('panel', 'passive'))).toBe('Patch panel')
    expect(cardRoleLabel(eq('hdf', 'passive'))).toBe('HDF')
  })
})
