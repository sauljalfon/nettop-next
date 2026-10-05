import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { foundFor } from './found'
import { indexSnapshot } from './snapshotIndex'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)

describe('POL-06 found: a card, its direct cable neighbors and the cables between them', () => {
  it('EDGE-17 finds PANEL-A and cables A01, A05 and A09', () => {
    expect(foundFor(index, 'EDGE-17')).toEqual({
      id: 'EDGE-17',
      neighborIds: ['PANEL-A'],
      linkIds: ['A01', 'A05', 'A09'],
    })
  })

  it('a middle card finds both neighbors', () => {
    const found = foundFor(index, 'PANEL-A')!
    expect(found.neighborIds).toEqual(['EDGE-17', 'HDF-01'])
    expect(found.linkIds).toEqual(['A01', 'A02', 'A05', 'A06', 'A09', 'A10'])
  })

  it('does not include cables between two neighbors', () => {
    // HDF-01 ↔ HDF-02 cables (A03…) are not found from PANEL-A: HDF-02 is not its neighbor.
    expect(foundFor(index, 'PANEL-A')!.linkIds).not.toContain('A03')
    expect(foundFor(index, 'HDF-01')!.neighborIds).toEqual([
      'HDF-02',
      'PANEL-A',
      'PANEL-DR',
    ])
  })

  it('a card with no cable finds only itself', () => {
    expect(foundFor(index, 'AGG-15')).toEqual({
      id: 'AGG-15',
      neighborIds: [],
      linkIds: [],
    })
  })

  it('lists a neighbor once however many cables join it', () => {
    expect(foundFor(index, 'EDGE-17')!.neighborIds).toHaveLength(1)
  })

  it('returns nothing for equipment that is not in the snapshot', () => {
    expect(foundFor(index, 'nope')).toBeUndefined()
  })

  it('ignores internal bridges', () => {
    expect(
      foundFor(index, 'HDF-01')!.linkIds.some((id) => id.endsWith(':bridge')),
    ).toBe(false)
  })
})
