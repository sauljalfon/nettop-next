import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import {
  defaultFilter,
  filterGroups,
  inspectorGroups,
  inspectorHeader,
  inspectorLocation,
  unitCount,
} from './model'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)
const groups = (id: string) => inspectorGroups(s, index, id)

describe('POL-09 grouping', () => {
  it("puts a switch's ports in one group, in port order", () => {
    const [g] = groups('EDGE-17')
    expect(groups('EDGE-17')).toHaveLength(1)
    expect(g.title).toBe('Ports')
    expect(g.units).toHaveLength(24)
    expect(g.units.slice(0, 3).map((u) => u.label)).toEqual(['1', '2', '3'])
    expect(g.units[9].label).toBe('10') // 10 after 9, not after 1
  })

  it('shows a panel position with its front and rear together', () => {
    const [g] = groups('PANEL-A')
    expect(g.title).toBe('Positions')
    expect(g.units).toHaveLength(24)
    expect(g.units[0].sides.map((x) => x.side)).toEqual(['front', 'rear'])
  })

  it('groups HDF positions by subpanel, in row then column order', () => {
    const g = groups('HDF-01')
    expect(g.map((x) => x.title)).toEqual([
      'Subpanel 1A',
      'Subpanel 2D',
      'Subpanel 3C',
      'Subpanel 4A',
    ])
    expect(g.map((x) => x.units.map((u) => u.label))).toEqual([
      ['1A / 2'],
      ['2D / 4'],
      ['3C / 2', '3C / 5'],
      ['4A / 1', '4A / 2'],
    ])
    expect(g[0].id).toBe('1A')
  })

  it('counts the ports or positions of an equipment', () => {
    expect(unitCount(groups('EDGE-17'))).toBe(24)
    expect(unitCount(groups('HDF-01'))).toBe(6)
    expect(unitCount([])).toBe(0)
  })

  it('has no groups for unknown equipment', () => {
    expect(groups('nope')).toEqual([])
  })
})

describe('POL-09 far ends, cable IDs and circuit networks', () => {
  const unit = (id: string, label: string) =>
    groups(id)
      .flatMap((g) => g.units)
      .find((u) => u.label === label)!

  it('gives a cabled side its far end, cable and circuit network', () => {
    const rear = unit('HDF-01', '3C / 5').sides.find((x) => x.side === 'rear')!
    expect(rear).toMatchObject({
      endpointId: 'HDF-01:3C/5:r',
      cabled: true,
      cable: { linkId: 'A02', farLabel: 'PANEL-A · 1 rear', networkId: 'A' },
    })
    const front = unit('HDF-01', '3C / 5').sides.find(
      (x) => x.side === 'front',
    )!
    expect(front.cable).toMatchObject({
      linkId: 'A03',
      farLabel: 'HDF-02 · 2B/3 front',
      networkId: 'A',
    })
  })

  it("tells Network B's position on the same subpanel apart", () => {
    expect(unit('HDF-01', '3C / 2').networkId).toBe('B')
    expect(unit('HDF-01', '3C / 5').networkId).toBe('A')
  })

  it("takes a switch port's network from its device", () => {
    const port = unit('EDGE-22', '1')
    expect(port.sides[0].cable).toMatchObject({
      linkId: 'B01',
      farLabel: 'PANEL-DR · 1 front',
      networkId: 'B',
    })
  })

  it('marks an uncabled side and unit as free, with no cable', () => {
    const free = unit('EDGE-17', '4')
    expect(free.cabled).toBe(false)
    expect(free.sides[0]).toMatchObject({ cabled: false, cable: undefined })
    expect(unit('HDF-01', '4A / 1').cabled).toBe(false)
  })

  it('is cabled when either side is', () => {
    expect(unit('HDF-01', '3C / 5').cabled).toBe(true)
  })

  it('starts a trace from the front side of a position, the port for a switch', () => {
    expect(unit('HDF-01', '3C / 5').startEndpointId).toBe('HDF-01:3C/5:f')
    expect(unit('EDGE-17', '1').startEndpointId).toBe('EDGE-17:p1')
  })

  it('carries the facet key that "Show connections" and Pin use', () => {
    expect(unit('HDF-01', '3C / 5').key).toBe('3C/5')
    expect(unit('PANEL-A', '2').key).toBe('2')
    expect(unit('EDGE-17', '1').key).toBe('EDGE-17:p1')
  })
})

describe('POL-09 Cabled / Free / All and search', () => {
  const labels = (id: string, mode: 'cabled' | 'free' | 'all', query = '') =>
    filterGroups(groups(id), { mode, query }).flatMap((g) =>
      g.units.map((u) => u.label),
    )

  it('Cabled lists only the cabled positions; Free the rest; All everything', () => {
    expect(labels('HDF-01', 'cabled')).toEqual([
      '1A / 2',
      '2D / 4',
      '3C / 2',
      '3C / 5',
    ])
    expect(labels('HDF-01', 'free')).toEqual(['4A / 1', '4A / 2'])
    expect(labels('HDF-01', 'all')).toHaveLength(6)
  })

  it('drops groups that end up empty', () => {
    const g = filterGroups(groups('HDF-01'), { mode: 'cabled', query: '' })
    expect(g.map((x) => x.id)).toEqual(['1A', '2D', '3C'])
  })

  it('searches labels, ignoring case and spacing around the slash', () => {
    expect(labels('HDF-01', 'all', '3C/5')).toEqual(['3C / 5'])
    expect(labels('HDF-01', 'all', '3C / 5')).toEqual(['3C / 5'])
    expect(labels('HDF-01', 'all', '3c')).toEqual(['3C / 2', '3C / 5'])
  })

  it('combines the filter and the search', () => {
    expect(labels('HDF-01', 'free', '4a/1')).toEqual(['4A / 1'])
    expect(labels('HDF-01', 'cabled', '4a/1')).toEqual([])
  })

  it('searches switch ports by number', () => {
    expect(labels('EDGE-17', 'all', '2')).toEqual([
      '2',
      '12',
      '20',
      '21',
      '22',
      '23',
      '24',
    ])
  })

  it('defaults to Cabled above 48 ports or positions, otherwise All', () => {
    expect(defaultFilter(24)).toBe('all')
    expect(defaultFilter(48)).toBe('all')
    expect(defaultFilter(49)).toBe('cabled')
    expect(defaultFilter(96)).toBe('cabled')
  })
})

describe('POL-09 header and location', () => {
  const installed = new Set(s.equipment.map((e) => e.id))

  it('names the equipment, role, network, state and cabling', () => {
    expect(
      inspectorHeader(
        s,
        index,
        s.equipment.find((e) => e.id === 'EDGE-17')!,
        installed,
      ),
    ).toEqual({
      name: 'EDGE-17',
      role: 'access',
      network: 'Network A',
      proposed: false,
      summary: '3 of 24 cabled',
    })
  })

  it('has no network for a panel and flags proposed equipment', () => {
    const header = inspectorHeader(
      s,
      index,
      s.equipment.find((e) => e.id === 'HDF-01')!,
      new Set(),
    )
    expect(header).toMatchObject({
      network: undefined,
      proposed: true,
      summary: '4 of 6 cabled',
    })
  })

  it('names the site, node and rack, each with the ID that acts on it', () => {
    expect(inspectorLocation(index, 'EDGE-17')).toEqual({
      site: { id: 'site-main', name: 'Main Campus' },
      node: { id: 'node-a', name: 'Building A' },
      rack: { id: 'rack-a03', name: 'Rack A03' },
    })
  })

  it('leaves out what is unknown', () => {
    const doctored = acceptanceSnapshot()
    doctored.equipment.find((e) => e.id === 'AGG-12')!.rackId = 'gone'
    expect(inspectorLocation(indexSnapshot(doctored), 'AGG-12')).toEqual({})
  })
})
