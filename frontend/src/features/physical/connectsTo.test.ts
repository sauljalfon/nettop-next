import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../map/snapshotIndex'
import { connectsTo } from './connectsTo'
import { physicalSnapshot } from './testFixture'

const index = indexSnapshot(physicalSnapshot())
const by = (id: string) => connectsTo(index, id)

describe('CT-01 connects to counts the far equipment of the stored cables', () => {
  it('EDGE-17: three cables, all to PANEL-A, on Network A', () => {
    const list = by('EDGE-17')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      equipmentId: 'PANEL-A',
      name: 'PANEL-A',
      cables: 3,
      networkIds: ['A'],
      place: ['Main Campus', 'Building A', 'Rack A03'],
    })
    expect(list[0].endpointIds.sort()).toEqual([
      'EDGE-17:p1',
      'EDGE-17:p2',
      'EDGE-17:p3',
    ])
  })

  it('never goes through a bridge: a panel lists both neighbours, not the far side', () => {
    expect(by('PANEL-A').map((f) => [f.name, f.cables])).toEqual([
      ['EDGE-17', 3],
      ['HDF-01', 3],
    ])
  })

  it('an HDF counts both sides, most cables first, then by name', () => {
    expect(by('HDF-01').map((f) => [f.name, f.cables])).toEqual([
      ['HDF-02', 4],
      ['PANEL-A', 3],
      ['PANEL-DR', 1],
    ])
  })

  it('endpointIds are the equipment own endpoints, on the right sides', () => {
    const hdf = by('HDF-01')
    const toPanel = hdf.find((f) => f.name === 'PANEL-A')!
    expect(toPanel.endpointIds.every((id) => id.startsWith('HDF-01:'))).toBe(
      true,
    )
    expect(toPanel.endpointIds.every((id) => id.endsWith(':r'))).toBe(true)
    const toHdf2 = hdf.find((f) => f.name === 'HDF-02')!
    expect(toHdf2.endpointIds.every((id) => id.endsWith(':f'))).toBe(true)
  })

  it('networkIds follow the snapshot order', () => {
    expect(by('HDF-01')[0].networkIds).toEqual(['A', 'B'])
    expect(by('HDF-01')[2].networkIds).toEqual(['B'])
  })

  it('an uncabled equipment connects to nothing', () => {
    expect(by('AGG-15')).toEqual([])
    expect(by('no-such-equipment')).toEqual([])
  })
})
