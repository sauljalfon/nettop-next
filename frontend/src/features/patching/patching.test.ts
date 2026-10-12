import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { rangePairs } from '../planning/range'
import {
  farDefault,
  farSide,
  freeCount,
  locationTree,
  nextFree,
  pairMarks,
} from './patching'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)
const none = new Map<string, 'front' | 'rear'>()

describe('PT-01 the location tree for the far-end dropdowns', () => {
  it('lists sites, nodes, racks and equipment by name, numbers in order', () => {
    const tree = locationTree(s)
    expect(tree.map((x) => x.name)).toEqual(['DR Site', 'Main Campus'])
    const main = tree[1]
    expect(main.nodes.map((n) => n.name)).toEqual([
      'Building A',
      'Main Distribution',
      'North Sub-main',
    ])
    expect(main.nodes[0].racks[0].equipment.map((e) => e.name)).toEqual([
      'EDGE-17',
      'PANEL-A',
    ])
    expect(
      main.nodes[1].racks.map((r) => [r.name, r.equipment.length]),
    ).toEqual([
      ['Rack Core 01', 2],
      ['Rack Core 02', 2],
      ['Rack Core 03', 1],
    ])
  })

  it('counts the free endpoints of an equipment', () => {
    expect(freeCount(index, 'EDGE-17')).toBe(21)
    expect(freeCount(index, 'PANEL-A')).toBe(48 - 6)
  })
})

describe('PT-02 the far end the screen starts on', () => {
  it('starts on passive equipment in the near end node, on the front for a switch', () => {
    expect(farDefault(s, index, 'EDGE-17:p5', [], none)).toEqual({
      equipmentId: 'PANEL-A',
      side: 'front',
    })
  })

  it('starts on the last far target of the session, never the near equipment', () => {
    const recent = [
      { equipmentId: 'EDGE-17', side: undefined },
      { equipmentId: 'HDF-01', side: 'rear' as const },
    ]
    expect(farDefault(s, index, 'EDGE-17:p5', recent, none)).toEqual({
      equipmentId: 'HDF-01',
      side: 'rear',
    })
  })

  it('falls back to other equipment when the near end is alone in its node', () => {
    const far = farDefault(s, index, 'AGG-12:p2', [], none)
    expect(far?.equipmentId).toBeDefined()
    expect(far?.equipmentId).not.toBe('AGG-12')
  })

  it('a rear jack starts a passive far end on its rear', () => {
    expect(farSide(index, 'PANEL-A:4:r', 'HDF-01', none)).toBe('rear')
    expect(farSide(index, 'PANEL-A:4:f', 'HDF-01', none)).toBe('front')
  })

  it('from a switch, a panel starts on the side last used for it, else the front', () => {
    expect(farSide(index, 'EDGE-17:p5', 'HDF-01', none)).toBe('front')
    expect(
      farSide(index, 'EDGE-17:p5', 'HDF-01', new Map([['HDF-01', 'rear']])),
    ).toBe('rear')
  })

  it('a switch has no side', () => {
    expect(farSide(index, 'PANEL-A:4:r', 'AGG-03', none)).toBeUndefined()
  })
})

describe('PT-03 the next free jack after a cable', () => {
  const taken = (extra: string[] = []) => {
    const all = new Set([...index.cabled, ...extra])
    return (id: string) => all.has(id)
  }

  it('skips cabled ports, in port order', () => {
    expect(nextFree(s, 'EDGE-17', undefined, taken())).toBe('EDGE-17:p4')
    expect(nextFree(s, 'EDGE-17', undefined, taken(), 'EDGE-17:p4')).toBe(
      'EDGE-17:p5',
    )
  })

  it('treats endpoints cabled moments ago as taken', () => {
    expect(nextFree(s, 'EDGE-17', undefined, taken(['EDGE-17:p4']))).toBe(
      'EDGE-17:p5',
    )
  })

  it('stays on one side of a panel', () => {
    expect(nextFree(s, 'PANEL-A', 'rear', taken())).toBe('PANEL-A:4:r')
  })

  it('is undefined past the last free jack', () => {
    expect(
      nextFree(s, 'EDGE-17', undefined, taken(), 'EDGE-17:p24'),
    ).toBeUndefined()
  })
})

describe('PT-04 pair marks on both faceplates', () => {
  it('numbers each pair and carries the reason a pair is blocked', () => {
    const pairs = rangePairs(s, index, 'EDGE-17:p4', 'PANEL-A:2:f', 3)
    const marks = pairMarks(pairs)
    expect(marks.near.get('EDGE-17:p4')).toEqual({
      n: 1,
      problem: 'PANEL-A · 2 front is already cabled (A05)',
    })
    expect(marks.far.get('PANEL-A:4:f')).toEqual({ n: 3, problem: undefined })
    expect(marks.near.size).toBe(3)
  })
})
