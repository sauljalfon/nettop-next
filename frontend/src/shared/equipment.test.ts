import { expect, it } from 'vitest'
import { hasPorts, isPassiveEquipment, kindLabel } from './equipment'

it('treats panels and HDFs as passive and only switches as active devices', () => {
  expect(isPassiveEquipment({ kind: 'switch' })).toBe(false)
  expect(isPassiveEquipment({ kind: 'panel' })).toBe(true)
  expect(isPassiveEquipment({ kind: 'hdf' })).toBe(true)
})

it('RI-09 a rack item is neither passive nor a device with ports', () => {
  expect(isPassiveEquipment({ kind: 'rack_item' })).toBe(false)
  expect(hasPorts({ kind: 'rack_item' })).toBe(false)
  for (const kind of ['switch', 'panel', 'hdf'] as const)
    expect(hasPorts({ kind })).toBe(true)
})

it('RI-09 names each kind', () => {
  expect(kindLabel({ kind: 'switch' })).toBe('Switch')
  expect(kindLabel({ kind: 'panel' })).toBe('Panel')
  expect(kindLabel({ kind: 'hdf' })).toBe('HDF')
  expect(kindLabel({ kind: 'rack_item' })).toBe('Rack item')
})
