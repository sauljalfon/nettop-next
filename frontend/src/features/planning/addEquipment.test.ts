import { expect, it } from 'vitest'
import { checkEquipmentForm } from './AddEquipmentForm'

const ok = {
  name: ' EDGE-31 ',
  networkId: 'net-a',
  rackId: 'rack-a03',
  unit: '4',
  ports: '24',
}

it('ED-16 the library form checks what it can before sending', () => {
  expect(checkEquipmentForm(ok, 'switch')).toEqual({
    name: 'EDGE-31',
    unit: 4,
    ports: 24,
  })
  expect(checkEquipmentForm({ ...ok, name: ' ' }, 'switch')).toHaveProperty(
    'error',
  )
  expect(checkEquipmentForm({ ...ok, networkId: '' }, 'switch')).toEqual({
    error: 'Choose the device’s network.',
  })
  // A panel has no network.
  expect(checkEquipmentForm({ ...ok, networkId: '' }, 'panel')).toHaveProperty(
    'name',
  )
  expect(checkEquipmentForm({ ...ok, rackId: '' }, 'switch')).toEqual({
    error: 'Choose a rack.',
  })
  expect(checkEquipmentForm({ ...ok, unit: '0' }, 'switch')).toHaveProperty(
    'error',
  )
  // A switch may have up to 96 ports (stacks, 48 + 4 uplinks); a panel 48 positions.
  expect(checkEquipmentForm({ ...ok, ports: '96' }, 'switch')).toHaveProperty(
    'ports',
    96,
  )
  expect(checkEquipmentForm({ ...ok, ports: '97' }, 'switch')).toEqual({
    error: 'Ports must be between 1 and 96.',
  })
  expect(checkEquipmentForm({ ...ok, ports: '49' }, 'panel')).toEqual({
    error: 'Positions must be between 1 and 48.',
  })
  expect(checkEquipmentForm({ ...ok, ports: '0' }, 'panel')).toEqual({
    error: 'Positions must be between 1 and 48.',
  })
})
