import { describe, expect, it } from 'vitest'
import { agg03Route } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot, withFullHdf } from './testFixture'
import { routeMarks } from './inventory'
import { hdfFace, layoutPlate, panelFace, switchBank } from './faces'
import { withGroupedSwitch } from './testFixture'

const s = withFullHdf(physicalSnapshot(), 'HDF-01', 4)
const index = indexSnapshot(s)

describe('F10 device banks and standard panels', () => {
  it('shows a switch as a bank in rows of 12', () => {
    const bank = switchBank(index, 'EDGE-17')
    expect(bank.rows).toHaveLength(2)
    expect(bank.rows.map((r) => r.length)).toEqual([12, 12])
    expect(bank.rows[0][0]).toMatchObject({
      endpointId: 'EDGE-17:p1',
      label: '1',
      cabled: true,
      networkId: 'A',
    })
    expect(bank.rows[1][11].label).toBe('24')
  })

  it('orders ports numerically and marks free ones', () => {
    const bank = switchBank(index, 'EDGE-17')
    const labels = bank.rows.flat().map((p) => p.label)
    expect(labels.slice(0, 3)).toEqual(['1', '2', '3'])
    const p4 = bank.rows.flat().find((p) => p.label === '4')!
    expect(p4).toMatchObject({ cabled: false, state: 'free' })
  })

  it('shows the cable peer of a port by ID, not by name', () => {
    const bank = switchBank(index, 'AGG-03')
    const p1 = bank.rows[0][0]
    expect(p1.cable).toEqual({ linkId: 'A04', farEndpointId: 'HDF-02:2B/3:r' })
  })

  it('shows a standard panel with positions 1..N per side', () => {
    const front = panelFace(index, 'PANEL-A', 'front')
    expect(front.positions).toHaveLength(24)
    expect(front.positions[0]).toMatchObject({
      position: 1,
      endpointId: 'PANEL-A:1:f',
      cabled: true,
      networkId: 'A',
      cable: { linkId: 'A01', farEndpointId: 'EDGE-17:p1' },
    })
    const rear = panelFace(index, 'PANEL-A', 'rear')
    expect(rear.positions[0].cable?.linkId).toBe('A02')
    expect(rear.positions[3].cabled).toBe(false)
  })

  it('a position of the same panel keeps its identity on both sides', () => {
    const front = panelFace(index, 'PANEL-A', 'front')
    const rear = panelFace(index, 'PANEL-A', 'rear')
    expect(front.positions.map((p) => p.position)).toEqual(
      rear.positions.map((p) => p.position),
    )
  })
})

describe('F09 / PHY-08 the HDF grid shows every block and every network', () => {
  const face = hdfFace(index, 'HDF-01', 'rear')

  it('has four columns A-D and 4 rows = 16 blocks in row-major order', () => {
    expect(face.rows).toBe(4)
    expect(face.blocks.map((b) => b.label)).toEqual([
      '1A',
      '1B',
      '1C',
      '1D',
      '2A',
      '2B',
      '2C',
      '2D',
      '3A',
      '3B',
      '3C',
      '3D',
      '4A',
      '4B',
      '4C',
      '4D',
    ])
  })

  it('has six positions per block, 96 per side', () => {
    expect(face.blocks.every((b) => b.positions.length === 6)).toBe(true)
    expect(face.blocks.flatMap((b) => b.positions)).toHaveLength(96)
  })

  it('keeps fiber-pair labels as secondary text', () => {
    const p = face.blocks.find((b) => b.label === '3C')!.positions[4]
    expect(p.position).toBe(5)
    expect(p.fiberPair).toBe('9,10')
    expect(face.blocks[0].positions.map((x) => x.fiberPair)).toEqual([
      '1,2',
      '3,4',
      '5,6',
      '7,8',
      '9,10',
      '11,12',
    ])
  })

  it('shows 3C/5 (Network A) and 3C/2 (Network B) as separate circuits', () => {
    const block = face.blocks.find((b) => b.label === '3C')!
    expect(block.positions[4]).toMatchObject({
      endpointId: 'HDF-01:3C/5:r',
      networkId: 'A',
      cabled: true,
      cable: { linkId: 'A02', farEndpointId: 'PANEL-A:1:r' },
    })
    expect(block.positions[1]).toMatchObject({
      endpointId: 'HDF-01:3C/2:r',
      networkId: 'B',
      cabled: true,
      cable: { linkId: 'B02' },
    })
  })

  it('front side carries the other cables', () => {
    const front = hdfFace(index, 'HDF-01', 'front')
    const p5 = front.blocks.find((b) => b.label === '3C')!.positions[4]
    expect(p5.cable?.linkId).toBe('A03')
    expect(p5.cable?.farEndpointId).toBe('HDF-02:2B/3:f')
  })

  it('HDF-02 has 3 rows = 12 blocks', () => {
    const f = hdfFace(index, 'HDF-02', 'front')
    expect(f.rows).toBe(3)
    expect(f.blocks).toHaveLength(12)
  })

  it('a block without a configured position has no endpoint', () => {
    const f = hdfFace(indexSnapshot(physicalSnapshot()), 'HDF-02', 'front')
    const b = f.blocks.find((x) => x.label === '1B')!
    expect(b.positions).toHaveLength(6)
    expect(b.positions.every((p) => p.endpointId === undefined)).toBe(true)
  })
})

describe('per-endpoint state: free, cabled, on route, selected', () => {
  it('marks route endpoints from the selected route only', () => {
    const marks = routeMarks(index, agg03Route())
    const face = hdfFace(index, 'HDF-01', 'rear', {
      marks,
      selectedEndpointId: 'HDF-01:3C/5:r',
    })
    const pos = (label: string, n: number) =>
      face.blocks.find((b) => b.label === label)!.positions[n - 1]
    expect(pos('3C', 5)).toMatchObject({ state: 'selected', onRoute: true })
    expect(pos('3C', 2)).toMatchObject({ state: 'cabled', onRoute: false })
    expect(pos('1A', 2)).toMatchObject({ state: 'cabled', onRoute: false })
    expect(pos('1A', 1).state).toBe('free')
    const other = hdfFace(index, 'HDF-01', 'rear', { marks })
    expect(other.blocks.find((b) => b.label === '3C')!.positions[4].state).toBe(
      'route',
    )
  })

  it('marks route ports on switches', () => {
    const marks = routeMarks(index, agg03Route())
    const bank = switchBank(index, 'AGG-03', { marks })
    expect(bank.rows[0][0].state).toBe('route')
  })
})

describe('PG-04 port banks: one per port group', () => {
  const grouped = withGroupedSwitch(physicalSnapshot(), 'SW-G', 'rack-a03', 3, [
    {
      count: 24,
      prefix: 'Gi1/0/',
      portType: 'copper',
      connector: 'RJ45',
      speed: '1G',
    },
    {
      count: 4,
      prefix: 'Te1/1/',
      portType: 'fiber',
      connector: 'SFP+',
      speed: '10G',
    },
  ])
  const gi = indexSnapshot(grouped)

  it('draws one bank per group with a caption from its first and last name, type and speed', () => {
    const { banks } = switchBank(gi, 'SW-G')
    expect(banks.map((b) => b.caption)).toEqual([
      'Gi1/0/1–Gi1/0/24 · copper · 1G',
      'Te1/1/1–Te1/1/4 · fiber · 10G',
    ])
    expect(banks.map((b) => b.cells.length)).toEqual([24, 4])
    expect(banks[0].cells[0]).toMatchObject({
      endpointId: 'SW-G:p1',
      label: 'Gi1/0/1',
    })
    expect(banks[1].cells[0]).toMatchObject({
      endpointId: 'SW-G:p25',
      label: 'Te1/1/1',
    })
  })

  it('keeps rows as every port in order, in rows of 12', () => {
    const { rows } = switchBank(gi, 'SW-G')
    expect(rows.flat().map((c) => c.endpointId)).toEqual(
      Array.from({ length: 28 }, (_, i) => `SW-G:p${i + 1}`),
    )
  })

  it('orders by position even when the group labels sort the other way', () => {
    const swapped = withGroupedSwitch(
      physicalSnapshot(),
      'SW-S',
      'rack-a03',
      3,
      [
        { count: 2, prefix: 'Te1/1/' },
        { count: 2, prefix: 'Gi1/0/' },
      ],
    )
    const { banks } = switchBank(indexSnapshot(swapped), 'SW-S')
    expect(banks.map((b) => b.caption)).toEqual([
      'Te1/1/1–Te1/1/2',
      'Gi1/0/1–Gi1/0/2',
    ])
  })

  it('a switch saved before groups is one bank with no caption, as before', () => {
    const { banks } = switchBank(index, 'EDGE-17')
    expect(banks).toHaveLength(1)
    expect(banks[0].caption).toBe('')
    expect(banks[0].cells).toHaveLength(24)
  })

  it('a single-port group names just that port', () => {
    const one = withGroupedSwitch(physicalSnapshot(), 'SW-1', 'rack-a03', 3, [
      { count: 1, prefix: 'Mgmt', speed: '100M' },
    ])
    expect(switchBank(indexSnapshot(one), 'SW-1').banks[0].caption).toBe(
      'Mgmt1 · 100M',
    )
  })
})

describe('port banks lie side by side and wrap (step 11b fixup)', () => {
  const plate = (groups: { count: number; prefix: string }[]) => {
    const g = withGroupedSwitch(
      physicalSnapshot(),
      'SW-L',
      'rack-a03',
      3,
      groups,
    )
    return layoutPlate(switchBank(indexSnapshot(g), 'SW-L').banks)
  }
  const shape = (rows: ReturnType<typeof plate>) =>
    rows.map((r) => r.map((u) => `${u.cells.length}${u.caption ? '*' : ''}`))

  it('puts 24 + 4 in one row, access ports first and the uplinks to their right', () => {
    const rows = plate([
      { count: 24, prefix: 'Gi1/0/' },
      { count: 4, prefix: 'Te1/1/' },
    ])
    expect(shape(rows)).toEqual([['24*', '4*']])
    expect(rows[0][1].cells[0].label).toBe('Te1/1/1')
  })

  it('wraps what does not fit: 48 + 4 puts the second 24-port block and the uplinks on a second row', () => {
    const rows = plate([
      { count: 48, prefix: 'Gi1/0/' },
      { count: 4, prefix: 'Te1/1/' },
    ])
    // The 48-port group is two blocks of 24 ports; only the first carries the caption.
    expect(shape(rows)).toEqual([['24*'], ['24', '4*']])
    expect(rows[1][0].cells[0].label).toBe('Gi1/0/25')
  })

  it('a switch with one group, or saved before groups, is one strip as before', () => {
    const one = plate([{ count: 48, prefix: 'E' }])
    expect(shape(one)).toEqual([['48*']])
    const old = layoutPlate(switchBank(index, 'EDGE-17').banks)
    expect(shape(old)).toEqual([['24']])
  })
})
