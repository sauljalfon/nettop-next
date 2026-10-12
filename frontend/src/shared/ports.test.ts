import { expect, it } from 'vitest'
import { comparePorts, hasSide } from './ports'

const port = (label: string, position?: number) => ({ label, position })

it('PG orders switch ports by position when set, never by label text', () => {
  const ports = [port('Gi1/0/2', 2), port('Te1/1/1', 3), port('Gi1/0/1', 1)]
  expect([...ports].sort(comparePorts).map((p) => p.label)).toEqual([
    'Gi1/0/1',
    'Gi1/0/2',
    'Te1/1/1',
  ])
  // Groups in reverse label order still follow the position.
  const swapped = [port('Gi1/0/1', 5), port('Te1/1/2', 2), port('Te1/1/1', 1)]
  expect([...swapped].sort(comparePorts).map((p) => p.label)).toEqual([
    'Te1/1/1',
    'Te1/1/2',
    'Gi1/0/1',
  ])
})

it('PG ports saved before groups (no position) keep the numeric label order', () => {
  const ports = [port('Port 10'), port('Port 2'), port('Port 1')]
  expect([...ports].sort(comparePorts).map((p) => p.label)).toEqual([
    'Port 1',
    'Port 2',
    'Port 10',
  ])
})

it('only a side marks a panel position', () => {
  expect(hasSide({ side: 'front' })).toBe(true)
  expect(hasSide({})).toBe(false)
})
