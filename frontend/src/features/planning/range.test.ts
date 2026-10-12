import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../map/snapshotIndex'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { withFullHdf, withGroupedSwitch } from '../physical/testFixture'
import type { Snapshot } from '../../shared/types'
import { rangePairs, rangeCommands, type RangePair } from './range'

const snap = (): Snapshot => withFullHdf(acceptanceSnapshot(), 'HDF-01', 3)
const build = (near: string, far: string, count: number, s = snap()) =>
  rangePairs(s, indexSnapshot(s), near, far, count)
const ends = (pairs: RangePair[]) =>
  pairs.map((p) => [p.near?.id, p.far?.id] as const)

describe('BK-02a the pair builder', () => {
  it('runs switch ports by port number and panel positions by position', () => {
    const pairs = build('EDGE-22:p2', 'PANEL-DR:3:f', 4)
    expect(ends(pairs)).toEqual([
      ['EDGE-22:p2', 'PANEL-DR:3:f'],
      ['EDGE-22:p3', 'PANEL-DR:4:f'],
      ['EDGE-22:p4', 'PANEL-DR:5:f'],
      ['EDGE-22:p5', 'PANEL-DR:6:f'],
    ])
    expect(pairs.every((p) => !p.problem)).toBe(true)
    expect(pairs[0]).toMatchObject({
      nearName: 'EDGE-22 · 2',
      farName: 'PANEL-DR · 3 front',
    })
  })

  it('orders switch ports by the number in their label, not as text: port 10 follows port 9', () => {
    const pairs = build('EDGE-22:p9', 'PANEL-DR:1:r', 3)
    expect(pairs.map((p) => p.near?.id)).toEqual([
      'EDGE-22:p9',
      'EDGE-22:p10',
      'EDGE-22:p11',
    ])
  })

  it('puts ports whose label has no number after the numbered ones, in their original order', () => {
    const s = snap()
    s.endpoints = [
      { id: 'x:uplink-b', equipmentId: 'EDGE-22', label: 'Uplink B' },
      { id: 'x:uplink-a', equipmentId: 'EDGE-22', label: 'Uplink A' },
      ...s.endpoints,
    ]
    const near = build('EDGE-22:p23', 'PANEL-DR:1:r', 4, s).map(
      (p) => p.near?.id,
    )
    expect(near).toEqual([
      'EDGE-22:p23',
      'EDGE-22:p24',
      'x:uplink-b',
      'x:uplink-a',
    ])
  })

  it('stays on the chosen side of a panel', () => {
    const pairs = build('EDGE-22:p1', 'PANEL-DR:22:r', 3)
    expect(pairs.map((p) => p.far?.id)).toEqual([
      'PANEL-DR:22:r',
      'PANEL-DR:23:r',
      'PANEL-DR:24:r',
    ])
  })

  it('marks pairs past the last position, on either side', () => {
    const pairs = build('EDGE-22:p22', 'PANEL-DR:22:f', 5)
    expect(pairs.map((p) => p.problem)).toEqual([
      undefined,
      undefined,
      undefined,
      'past the last position',
      'past the last position',
    ])
    expect(pairs[3].near).toBeUndefined()
    expect(pairs[3].nearName).toBe('past the last position')
  })

  it('runs an HDF by row, column A–D, position 1–6, continuing to the next row', () => {
    const pairs = build('HDF-01:1D/1:f', 'EDGE-22:p1', 8).map((p) => p.near?.id)
    expect(pairs).toEqual([
      'HDF-01:1D/1:f',
      'HDF-01:1D/2:f',
      'HDF-01:1D/3:f',
      'HDF-01:1D/4:f',
      'HDF-01:1D/5:f',
      'HDF-01:1D/6:f',
      'HDF-01:2A/1:f',
      'HDF-01:2A/2:f',
    ])
  })

  it('marks an endpoint that already carries a cable, in the server’s words', () => {
    const s = snap()
    const link = s.links.find((l) => l.kind === 'cable')!
    const near = s.endpoints.find((e) => e.id === link.a)!
    const pairs = build(near.id, 'PANEL-DR:10:f', 1, s)
    expect(pairs[0].problem).toMatch(
      new RegExp(`^.+ · .+ is already cabled \\(${link.id}\\)$`),
    )
  })

  it('marks two endpoints of the same equipment, in names', () => {
    const pairs = build('PANEL-DR:5:f', 'PANEL-DR:5:r', 1)
    expect(pairs[0].problem).toBe(
      'PANEL-DR · 5 front and PANEL-DR · 5 rear are on the same equipment',
    )
  })

  it('marks every pair of a range whose two runs overlap on one piece of equipment', () => {
    const pairs = build('PANEL-DR:1:f', 'PANEL-DR:2:r', 3)
    expect(
      pairs.every((p) => p.problem?.endsWith('on the same equipment')),
    ).toBe(true)
  })

  it('commands: one add_cable per usable pair, skipping the blocked ones', () => {
    const pairs = build('EDGE-22:p22', 'PANEL-DR:22:f', 5)
    expect(rangeCommands(pairs)).toEqual([
      { type: 'add_cable', cable: { a: 'EDGE-22:p22', b: 'PANEL-DR:22:f' } },
      { type: 'add_cable', cable: { a: 'EDGE-22:p23', b: 'PANEL-DR:23:f' } },
      { type: 'add_cable', cable: { a: 'EDGE-22:p24', b: 'PANEL-DR:24:f' } },
    ])
  })
})

describe('PG-03 a range across port groups runs by position, not by label', () => {
  const grouped = withGroupedSwitch(snap(), 'SW-G', 'rack-a03', 3, [
    { count: 24, prefix: 'Gi1/0/' },
    { count: 4, prefix: 'Te1/1/' },
  ])
  it('from Gi1/0/23 with count 4: Gi1/0/23, Gi1/0/24, Te1/1/1, Te1/1/2', () => {
    const pairs = build('SW-G:p23', 'PANEL-DR:10:f', 4, grouped)
    expect(pairs.map((p) => p.near?.label)).toEqual([
      'Gi1/0/23',
      'Gi1/0/24',
      'Te1/1/1',
      'Te1/1/2',
    ])
    expect(pairs.every((p) => !p.problem)).toBe(true)
    expect(pairs[2].nearName).toBe('SW-G · Te1/1/1')
  })

  it('does not read the number at the end of the label for ports that have a position', () => {
    // Both groups end in 1…: by label Gi1/0/1 and Te1/1/1 would both be "1".
    const pairs = build('SW-G:p24', 'PANEL-DR:10:f', 3, grouped)
    expect(pairs.map((p) => p.near?.id)).toEqual([
      'SW-G:p24',
      'SW-G:p25',
      'SW-G:p26',
    ])
  })

  it('stops at the last port of the switch', () => {
    const pairs = build('SW-G:p27', 'PANEL-DR:10:f', 3, grouped)
    expect(pairs.map((p) => p.problem)).toEqual([
      undefined,
      undefined,
      'past the last position',
    ])
  })
})
