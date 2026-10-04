import { expect, it } from 'vitest'
import { isPassiveEquipment } from './equipment'

it('treats panels and HDFs as passive and only switches as active devices', () => {
  expect(isPassiveEquipment({ kind: 'switch' })).toBe(false)
  expect(isPassiveEquipment({ kind: 'panel' })).toBe(true)
  expect(isPassiveEquipment({ kind: 'hdf' })).toBe(true)
})
