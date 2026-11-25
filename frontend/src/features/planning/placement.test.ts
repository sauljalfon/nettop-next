import { describe, expect, it } from 'vitest'
import { lowestFreeUnit } from './placement'

const racks = [
  { id: 'r1', units: 6 },
  { id: 'r2', units: 2 },
] as never
const eq = (id: string, rackId: string, unit: number, height = 1) =>
  ({ id, rackId, unit, height }) as never

describe('D49 the lowest free unit of a rack', () => {
  it('is the first unit where the whole height fits', () => {
    const equipment = [
      eq('a', 'r1', 1),
      eq('b', 'r1', 3, 2),
      eq('mine', 'r2', 1, 2),
    ]
    expect(lowestFreeUnit({ equipment, racks }, 'r1', 'a')).toBe(1)
    expect(
      lowestFreeUnit(
        { equipment: [...equipment, eq('c', 'r1', 2)], racks },
        'r1',
        'mine',
      ),
    ).toBe(5)
  })
  it('does not count the piece itself, and is the unit above a full rack', () => {
    const equipment = [eq('a', 'r2', 1), eq('b', 'r2', 2), eq('x', 'r1', 1)]
    expect(lowestFreeUnit({ equipment, racks }, 'r2', 'x')).toBe(3)
    expect(lowestFreeUnit({ equipment, racks }, 'r1', 'x')).toBe(1)
  })
})
