import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { moveActive, searchEquipment } from './search'

const s = acceptanceSnapshot()
const names = (q: string, limit?: number) =>
  searchEquipment(s.equipment, q, limit).map((e) => e.name)

describe('POL-06 find on map matches equipment by name', () => {
  it('ignores case', () => {
    expect(names('edge-17')).toEqual(['EDGE-17'])
    expect(names('EDGE-17')).toEqual(['EDGE-17'])
  })

  it('ranks prefix matches first, then other substring matches, each by name', () => {
    expect(names('edge')).toEqual(['EDGE-17', 'EDGE-22'])
    // "-0" is no prefix of anything: all substring matches, in name order.
    expect(names('-0')).toEqual([
      'AGG-03',
      'AGG-08',
      'BB-01',
      'HDF-01',
      'HDF-02',
    ])
    // "a" prefixes AGG-* and ranks above PANEL-A / BB-... which only contain it.
    const result = names('a')
    expect(result.slice(0, 4)).toEqual(['AGG-03', 'AGG-08', 'AGG-12', 'AGG-15'])
    expect(result.slice(4)).toEqual(['PANEL-A', 'PANEL-DR'])
  })

  it('sorts names naturally, so 2 comes before 10', () => {
    const many = [10, 9, 2, 1].map((n) => ({ id: `s${n}`, name: `SW-${n}` }))
    expect(searchEquipment(many, 'sw').map((e) => e.name)).toEqual([
      'SW-1',
      'SW-2',
      'SW-9',
      'SW-10',
    ])
  })

  it('returns nothing for an empty or blank query, or no match', () => {
    expect(names('')).toEqual([])
    expect(names('   ')).toEqual([])
    expect(names('zzz')).toEqual([])
  })

  it('trims the query and honours a limit', () => {
    expect(names('  edge-17  ')).toEqual(['EDGE-17'])
    expect(names('-', 3)).toHaveLength(3)
  })
})

describe('keyboard navigation through the matches', () => {
  it('moves down and up, wrapping at both ends', () => {
    expect(moveActive(0, 1, 3)).toBe(1)
    expect(moveActive(2, 1, 3)).toBe(0)
    expect(moveActive(0, -1, 3)).toBe(2)
    expect(moveActive(1, -1, 3)).toBe(0)
  })

  it('stays at zero with no matches', () => {
    expect(moveActive(0, 1, 0)).toBe(0)
    expect(moveActive(0, -1, 0)).toBe(0)
  })
})
