import { describe, expect, it } from 'vitest'
import { agg03Route } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { buildInventory, routeMarks } from './inventory'
import { nodeConnections } from './connections'
import {
  allProposed,
  cableRows,
  elevationSubtitle,
  elevationSubtitlePieces,
  filterRackPreviews,
  locationKey,
  mixOf,
  nodePositions,
  openLocation,
  restorePosition,
  otherSiteGroups,
  positionMarks,
  rackPreviews,
  scopeNote,
  sortedByName,
  siteLineWidth,
  withSavedPosition,
  withoutPositions,
} from './explorerModel'

const s = physicalSnapshot()
const index = indexSnapshot(s)
const inv = buildInventory(s, index)
const names = new Map(s.networks.map((n) => [n.id, n.name]))

describe('F01 site cards say what they count', () => {
  it('lists the network mix in network order with names and counts', () => {
    expect(mixOf(inv.sites.get('site-main')!.active, s.networks)).toEqual([
      { networkId: 'A', name: 'Network A', count: 5 },
    ])
    expect(mixOf(inv.sites.get('site-dr')!.active, s.networks)).toEqual([
      { networkId: 'B', name: 'Network B', count: 2 },
    ])
  })

  it('orders by the networks list, not by count', () => {
    const active = new Map([
      ['B', 9],
      ['A', 1],
    ])
    expect(mixOf(active, s.networks).map((m) => m.networkId)).toEqual([
      'A',
      'B',
    ])
  })

  it('ignores devices of a network that no longer exists', () => {
    expect(mixOf(new Map([['gone', 3]]), s.networks)).toEqual([])
  })
})

describe('PHY-05 the scope note says what is shown', () => {
  it('names the selected network and says other networks stay visible', () => {
    expect(scopeNote(s.networks, 'A')).toBe(
      'Complete physical inventory. Network A selected: its devices are marked; other networks stay visible.',
    )
  })

  it('says all networks when none is selected or the choice is stale', () => {
    const all = 'Complete physical inventory. All networks are shown.'
    expect(scopeNote(s.networks, undefined)).toBe(all)
    expect(scopeNote(s.networks, 'gone')).toBe(all)
  })
})

describe('location marks', () => {
  it('writes a stable key per level', () => {
    expect(locationKey({ level: 'sites' })).toBe('sites')
    expect(locationKey({ level: 'site', siteId: 'a' })).toBe('site:a')
    expect(locationKey({ level: 'node', siteId: 'a', nodeId: 'b' })).toBe(
      'site:a/node:b',
    )
    expect(
      locationKey({
        level: 'equipment',
        siteId: 'a',
        nodeId: 'b',
        rackId: 'c',
        equipmentId: 'd',
        endpointId: 'e',
        side: 'rear',
      }),
    ).toBe('site:a/node:b/rack:c/equipment:d/endpoint:e/rear')
  })

  it('writes positions sorted by node ID, rounded', () => {
    const p = new Map([
      ['node-b', { x: 10.4, y: 20.6 }],
      ['node-a', { x: -3, y: 0 }],
    ])
    expect(positionMarks(p)).toBe('node-a:-3,0 node-b:10,21')
  })
})

describe('PHY-18 saved positions merge with defaults and update in the cache', () => {
  const nodes = s.nodes.filter((n) => n.siteId === 'site-main')

  it('uses the saved position and a default for each unsaved node', () => {
    const p = nodePositions(nodes, [{ nodeId: 'node-sm', x: 500, y: 40 }])
    expect(p.get('node-sm')).toEqual({ x: 500, y: 40 })
    expect(p.size).toBe(3)
    // Defaults sit below every saved node.
    expect(p.get('node-a')!.y).toBeGreaterThan(40)
    expect(p.get('node-core')!.y).toBeGreaterThan(40)
  })

  it('ignores saved positions of nodes the site no longer has', () => {
    const p = nodePositions(nodes, [{ nodeId: 'node-gone', x: 1, y: 1 }])
    expect(p.has('node-gone')).toBe(false)
    expect(p.size).toBe(3)
  })

  it('withSavedPosition replaces one node and keeps the rest', () => {
    const before = {
      siteId: 'site-main',
      positions: [
        { nodeId: 'node-a', x: 1, y: 2 },
        { nodeId: 'node-sm', x: 3, y: 4 },
      ],
    }
    const after = withSavedPosition(before, 'node-sm', 9, 8)
    expect(after.positions).toEqual([
      { nodeId: 'node-a', x: 1, y: 2 },
      { nodeId: 'node-sm', x: 9, y: 8 },
    ])
    expect(before.positions[1]).toEqual({ nodeId: 'node-sm', x: 3, y: 4 })
    expect(withSavedPosition(before, 'node-core', 5, 6).positions).toHaveLength(
      3,
    )
  })

  it('withoutPositions empties the list for a reset', () => {
    expect(
      withoutPositions({
        siteId: 'x',
        positions: [{ nodeId: 'n', x: 1, y: 1 }],
      }),
    ).toEqual({ siteId: 'x', positions: [] })
  })
})

describe('PHY-19 connection lines and their cable lists', () => {
  const main = nodeConnections(index, 'site-main')

  it('line width grows with the count from 3 to 8 px', () => {
    expect(siteLineWidth(1)).toBe(3)
    expect(siteLineWidth(3)).toBe(5)
    expect(siteLineWidth(4)).toBe(6)
    expect(siteLineWidth(40)).toBe(8)
  })

  it('lists each cable with both ends and their racks', () => {
    const pair = main.pairs.find((p) => p.nodeIds.includes('node-a'))!
    const rows = cableRows(index, pair.linkIds)
    expect(rows.map((r) => r.linkId)).toEqual(['A02', 'A06', 'A10'])
    expect(rows[0]).toMatchObject({
      linkId: 'A02',
      a: {
        endpointId: 'PANEL-A:1:r',
        equipmentId: 'PANEL-A',
        label: 'PANEL-A · 1 rear',
        rack: 'Rack A03',
        rackId: 'rack-a03',
      },
      b: {
        endpointId: 'HDF-01:3C/5:r',
        equipmentId: 'HDF-01',
        label: 'HDF-01 · 3C/5 rear',
        rack: 'Rack SM01',
        rackId: 'rack-sm01',
      },
    })
  })

  it('skips cable IDs the snapshot does not have', () => {
    expect(cableRows(index, ['A02', 'nope']).map((r) => r.linkId)).toEqual([
      'A02',
    ])
  })

  it('groups a node’s cables to other sites by the far site', () => {
    const groups = otherSiteGroups(
      index,
      main.byNode.get('node-sm')!.otherSiteLinkIds,
      'site-main',
    )
    expect(groups).toEqual([
      { siteId: 'site-dr', name: 'DR Site', linkIds: ['B02'] },
    ])
  })

  it('a line is proposed only when every cable is not installed', () => {
    const installed = new Set(['A02', 'A06'])
    expect(allProposed(['A02', 'A06'], installed, 'planned')).toBe(false)
    expect(allProposed(['A10'], installed, 'planned')).toBe(true)
    expect(allProposed(['A02', 'A10'], installed, 'planned')).toBe(false)
    expect(allProposed(['A10'], installed, 'installed')).toBe(false)
    expect(allProposed([], installed, 'planned')).toBe(false)
  })
})

describe('F03 rack previews hold only the node’s racks', () => {
  const marks = routeMarks(index, agg03Route())

  it('builds one preview per rack of the node, in snapshot order', () => {
    const p = rackPreviews(s, inv, 'node-core', { marks })
    expect(p.map((r) => r.rackId)).toEqual([
      'rack-core-01',
      'rack-core-02',
      'rack-core-03',
    ])
    expect(p[0]).toMatchObject({
      name: 'Rack Core 01',
      equipmentCount: 2,
      usedUnits: 4,
      units: 12,
      onRoute: true,
    })
    expect(p[1].onRoute).toBe(false)
  })

  it('gives each block its height and the colored edge of its network', () => {
    const [core01] = rackPreviews(s, inv, 'node-core', {})
    const hdf = core01.blocks.find((b) => b.equipmentId === 'HDF-02')!
    expect(hdf).toMatchObject({ unit: 4, height: 3, networkId: undefined })
    const agg = core01.blocks.find((b) => b.equipmentId === 'AGG-03')!
    expect(agg).toMatchObject({ networkId: 'A', height: 1, onRoute: false })
  })

  it('marks route blocks', () => {
    const [core01] = rackPreviews(s, inv, 'node-core', { marks })
    expect(
      core01.blocks.filter((b) => b.onRoute).map((b) => b.equipmentId),
    ).toEqual(expect.arrayContaining(['AGG-03', 'HDF-02']))
  })

  it('PHY-05 mutes active devices of other networks but never hides them', () => {
    const unfiltered = rackPreviews(s, inv, 'node-dr1', {})
    const filtered = rackPreviews(s, inv, 'node-dr1', { networkId: 'A' })
    expect(filtered[0].blocks).toHaveLength(unfiltered[0].blocks.length)
    const edge22 = filtered[0].blocks.find((b) => b.equipmentId === 'EDGE-22')!
    expect(edge22.muted).toBe(true)
    // Passive equipment is shared and never muted; nothing is muted without a network.
    expect(
      filtered[0].blocks.find((b) => b.equipmentId === 'PANEL-DR')!.muted,
    ).toBe(false)
    expect(unfiltered[0].blocks.every((b) => !b.muted)).toBe(true)
  })

  it('searches rack and equipment names, ignoring case', () => {
    const all = rackPreviews(s, inv, 'node-core', {})
    expect(filterRackPreviews(all, 'core 02').map((r) => r.rackId)).toEqual([
      'rack-core-02',
    ])
    expect(filterRackPreviews(all, 'bb-01').map((r) => r.rackId)).toEqual([
      'rack-core-03',
    ])
    expect(filterRackPreviews(all, '  ')).toBe(all)
    expect(filterRackPreviews(all, 'zzz')).toEqual([])
  })

  it('knows the network names for badges', () => {
    expect(names.get('A')).toBe('Network A')
  })
})

describe('PHY-18 a failed save puts back only that node', () => {
  const layout = {
    siteId: 'site-main',
    positions: [
      { nodeId: 'node-a', x: 1, y: 2 },
      { nodeId: 'node-sm', x: 9, y: 9 },
    ],
  }

  it('restores the prior position of the node', () => {
    const r = restorePosition(layout, 'node-sm', {
      nodeId: 'node-sm',
      x: 3,
      y: 4,
    })
    expect(r.positions).toEqual([
      { nodeId: 'node-a', x: 1, y: 2 },
      { nodeId: 'node-sm', x: 3, y: 4 },
    ])
  })

  it('removes the node when it had no saved position before', () => {
    expect(restorePosition(layout, 'node-sm', undefined).positions).toEqual([
      { nodeId: 'node-a', x: 1, y: 2 },
    ])
  })

  it('leaves other nodes moved meanwhile alone', () => {
    const meanwhile = withSavedPosition(layout, 'node-a', 7, 7)
    expect(restorePosition(meanwhile, 'node-sm', undefined).positions).toEqual([
      { nodeId: 'node-a', x: 7, y: 7 },
    ])
  })
})

describe('F11 opening a place from anywhere resolves its ancestors', () => {
  it('opens a site, a node and a rack at their own level', () => {
    expect(openLocation(index, { siteId: 'site-dr' })).toEqual({
      level: 'site',
      siteId: 'site-dr',
    })
    expect(openLocation(index, { nodeId: 'node-core' })).toEqual({
      level: 'node',
      siteId: 'site-main',
      nodeId: 'node-core',
    })
    expect(openLocation(index, { rackId: 'rack-core-02' })).toEqual({
      level: 'rack',
      siteId: 'site-main',
      nodeId: 'node-core',
      rackId: 'rack-core-02',
    })
  })

  it('opens equipment at its equipment page, and an endpoint with its side selected', () => {
    const page = {
      level: 'equipment',
      siteId: 'site-main',
      nodeId: 'node-sm',
      rackId: 'rack-sm01',
      equipmentId: 'HDF-01',
    }
    expect(openLocation(index, { equipmentId: 'HDF-01' })).toEqual(page)
    expect(openLocation(index, { endpointId: 'HDF-01:3C/5:r' })).toEqual({
      ...page,
      endpointId: 'HDF-01:3C/5:r',
      side: 'rear',
    })
    // A port has no side.
    expect(openLocation(index, { endpointId: 'EDGE-17:p1' })).toMatchObject({
      level: 'equipment',
      equipmentId: 'EDGE-17',
      endpointId: 'EDGE-17:p1',
    })
  })

  it('falls back to Sites for an unknown ID', () => {
    expect(openLocation(index, { nodeId: 'gone' })).toEqual({ level: 'sites' })
    expect(openLocation(index, { endpointId: 'gone' })).toEqual({
      level: 'sites',
    })
  })
})

describe('F01 Sites are listed by name', () => {
  it('sorts ignoring case and reading numbers as numbers, without changing the input', () => {
    const sites = [
      { id: 'a', name: 'site 10' },
      { id: 'b', name: 'Zeta' },
      { id: 'c', name: 'alpha' },
      { id: 'd', name: 'Site 2' },
    ]
    expect(sortedByName(sites).map((x) => x.name)).toEqual([
      'alpha',
      'Site 2',
      'site 10',
      'Zeta',
    ])
    expect(sites[0].id).toBe('a')
  })
})

describe('PHY-07 rack previews count and mark proposed equipment', () => {
  it('flags proposed blocks and counts them per rack', () => {
    const installed = new Set(
      s.equipment.map((e) => e.id).filter((id) => id !== 'AGG-15'),
    )
    const [, core02] = rackPreviews(s, inv, 'node-core', {
      installedIds: installed,
    })
    expect(
      core02.blocks.find((b) => b.equipmentId === 'AGG-15')!.proposed,
    ).toBe(true)
    expect(
      core02.blocks.find((b) => b.equipmentId === 'AGG-08')!.proposed,
    ).toBe(false)
    expect(core02.proposedCount).toBe(1)
    const none = rackPreviews(s, inv, 'node-core', {})
    expect(none.every((r) => r.proposedCount === 0)).toBe(true)
  })
})

describe('F04 an equipment block says its role, network and units', () => {
  const eq = (id: string) => s.equipment.find((e) => e.id === id)!

  it('active devices: role, network name, height and unit', () => {
    expect(elevationSubtitle(eq('EDGE-17'), s.networks)).toBe(
      'access · Network A · 1U at U8',
    )
    expect(elevationSubtitle(eq('AGG-03'), s.networks)).toBe(
      'AGG · Network A · 1U at U8',
    )
    expect(elevationSubtitle(eq('BB-01'), s.networks)).toBe(
      'BB · Network A · 1U at U8',
    )
    expect(elevationSubtitle(eq('EDGE-22'), s.networks)).toBe(
      'access · Network B · 1U at U8',
    )
  })

  it('passive equipment has no network; a 3U HDF spans U4–U6', () => {
    expect(elevationSubtitle(eq('HDF-01'), s.networks)).toBe(
      'passive · 3U at U4–U6',
    )
    expect(elevationSubtitle(eq('PANEL-A'), s.networks)).toBe(
      'passive · 1U at U11',
    )
  })

  it('keeps the network name as its own piece, so a Hebrew name does not swap with the units', () => {
    expect(elevationSubtitlePieces(eq('EDGE-17'), s.networks)).toEqual([
      { text: 'access · ' },
      { name: 'Network A' },
      { text: ' · 1U at U8' },
    ])
    expect(elevationSubtitlePieces(eq('HDF-01'), s.networks)).toEqual([
      { text: 'passive · 3U at U4–U6' },
    ])
  })

  it('leaves out a network that does not exist', () => {
    expect(
      elevationSubtitle({ ...eq('EDGE-17'), networkId: 'gone' }, s.networks),
    ).toBe('access · 1U at U8')
  })
})
