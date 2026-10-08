import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import {
  canFindFromDevice,
  defaultFilter,
  filterGroups,
  inspectorGroups,
  inspectorHeader,
  inspectorLocation,
  networkCounts,
  shortFarLabel,
  toggleCollapsed,
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

describe('whole-device Find AGG / BB is for switches only', () => {
  const byId = (id: string) => s.equipment.find((e) => e.id === id)!
  it('is offered for a switch', () => {
    expect(canFindFromDevice(byId('EDGE-17'))).toBe(true)
    expect(canFindFromDevice(byId('BB-01'))).toBe(true)
  })

  it('is not offered for a panel or an HDF: the backend rejects it', () => {
    expect(canFindFromDevice(byId('PANEL-A'))).toBe(false)
    expect(canFindFromDevice(byId('HDF-01'))).toBe(false)
  })
})

describe('POL-20 overview counts and collapsed groups', () => {
  it("counts a switch's cabled ports on its own network", () => {
    expect(networkCounts(groups('EDGE-17'))).toEqual([
      { networkId: 'A', cabled: 3 },
    ])
  })

  it('counts the cabled positions of a shared HDF per circuit network, in network order', () => {
    const counts = networkCounts(groups('HDF-01'))
    expect(counts.map((c) => c.networkId)).toEqual(['A', 'B'])
    expect(counts.reduce((n, c) => n + c.cabled, 0)).toBe(4)
  })

  it('leaves out free units and reports nothing for unused equipment', () => {
    expect(networkCounts(groups('AGG-15'))).toEqual([])
  })

  it('collapses and expands a group without mutating the set', () => {
    const none: ReadonlySet<string> = new Set()
    const one = toggleCollapsed(none, '1A')
    expect(one.has('1A')).toBe(true)
    expect(none.size).toBe(0)
    expect(toggleCollapsed(one, '1A').has('1A')).toBe(false)
  })
})

describe('POL-20 grouping flag and far-end text', () => {
  it('marks HDF groups as collapsible and no others', () => {
    expect(groups('HDF-01').every((g) => g.collapsible)).toBe(true)
    expect(groups('EDGE-17').some((g) => g.collapsible)).toBe(false)
    expect(groups('PANEL-A').some((g) => g.collapsible)).toBe(false)
  })

  it('still shows an HDF grouped when one of its endpoints has no subpanel', () => {
    const bare = acceptanceSnapshot()
    for (const p of bare.endpoints)
      if (p.equipmentId === 'HDF-01' && p.position === 5)
        delete (p as { subpanelId?: string }).subpanelId
    const g = inspectorGroups(bare, indexSnapshot(bare), 'HDF-01')
    expect(g.length).toBeGreaterThan(0)
    expect(g.every((x) => x.collapsible)).toBe(true)
    expect(g.some((x) => x.id === '?')).toBe(true)
  })

  it("drops the far end's Front/Rear suffix from the short text only", () => {
    expect(shortFarLabel('HDF-02 · 2B/3 front')).toBe('HDF-02 · 2B/3')
    expect(shortFarLabel('PANEL-A · 1 · Rear')).toBe('PANEL-A · 1')
    expect(shortFarLabel('EDGE-17 · Port 1')).toBe('EDGE-17 · Port 1')
  })
})

describe('F05 a row opens its endpoint in Physical', () => {
  const unit = (id: string, key: string) =>
    groups(id)
      .flatMap((g) => g.units)
      .find((u) => u.key === key)!

  it('a position opens the first cabled side', () => {
    // HDF-01 3C/5: front (A03) and rear (A02) are both cabled; front sorts first.
    expect(unit('HDF-01', '3C/5').physicalEndpointId).toBe('HDF-01:3C/5:f')
    // PANEL-A 1: front (A01) and rear (A02).
    expect(unit('PANEL-A', '1').physicalEndpointId).toBe('PANEL-A:1:f')
  })

  it('the cabled side wins over the front when only the rear has a cable', () => {
    const cut = {
      ...s,
      links: s.links.filter((l) => l.id !== 'A03'),
    }
    const u = inspectorGroups(cut, indexSnapshot(cut), 'HDF-01')
      .flatMap((g) => g.units)
      .find((x) => x.key === '3C/5')!
    expect(u.physicalEndpointId).toBe('HDF-01:3C/5:r')
  })

  it('a free position opens its front', () => {
    expect(unit('PANEL-A', '10').physicalEndpointId).toBe('PANEL-A:10:f')
  })

  it('a port opens itself', () => {
    expect(unit('EDGE-17', 'EDGE-17:p1').physicalEndpointId).toBe('EDGE-17:p1')
    expect(unit('EDGE-17', 'EDGE-17:p5').physicalEndpointId).toBe('EDGE-17:p5')
  })
})
