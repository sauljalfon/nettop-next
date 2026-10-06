import { describe, expect, it } from 'vitest'
import { agg03Route, edge17Result } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { buildInventory, routeMarks } from './inventory'

const s = physicalSnapshot()
const index = indexSnapshot(s)
const inv = buildInventory(s, index)

describe('F01 sites show truthful counts', () => {
  it('counts nodes, racks and equipment per site', () => {
    expect(inv.sites.get('site-main')).toMatchObject({
      nodes: 3,
      racks: 5,
      equipment: 8,
    })
    expect(inv.sites.get('site-dr')).toMatchObject({
      nodes: 2,
      racks: 2,
      equipment: 3,
    })
  })

  it('counts active devices per network and passive equipment', () => {
    const main = inv.sites.get('site-main')!
    expect(main.passive).toBe(3) // PANEL-A, HDF-01, HDF-02
    expect([...main.active]).toEqual([['A', 5]]) // EDGE-17, 3 AGG, BB-01
    const dr = inv.sites.get('site-dr')!
    expect(dr.passive).toBe(1)
    expect([...dr.active]).toEqual([['B', 2]])
  })

  it('lists sites, nodes and racks in structure maps', () => {
    expect(inv.nodesBySite.get('site-main')).toEqual([
      'node-a',
      'node-sm',
      'node-core',
    ])
    expect(inv.racksByNode.get('node-core')).toEqual([
      'rack-core-01',
      'rack-core-02',
      'rack-core-03',
    ])
  })
})

describe('F03 Main Distribution owns only its racks and equipment', () => {
  it('counts its own racks and equipment', () => {
    expect(inv.nodes.get('node-core')).toMatchObject({
      racks: 3,
      equipment: 5, // HDF-02, AGG-03, AGG-08, AGG-15, BB-01
      passive: 1,
    })
    expect(inv.equipmentByRack.get('rack-core-02')).toEqual([
      'AGG-08',
      'AGG-15',
    ])
    expect(inv.racks.get('rack-core-01')?.equipment).toBe(2)
  })

  it('counts occupied units, a 3U HDF being three units', () => {
    expect(inv.racks.get('rack-sm01')?.occupiedUnits).toBe(3)
    expect(inv.racks.get('rack-core-01')?.occupiedUnits).toBe(4) // HDF 3U + AGG 1U
    expect(inv.racks.get('rack-core-03')?.occupiedUnits).toBe(1)
  })
})

describe('PHY-03 route marks use the selected route only', () => {
  it('marks nothing without a route', () => {
    const m = routeMarks(index, undefined)
    expect(m.equipment.size).toBe(0)
    expect(m.racks.size).toBe(0)
  })

  it('marks the actual racks, nodes, sites, equipment and endpoints of AGG-03', () => {
    const m = routeMarks(index, agg03Route())
    expect([...m.equipment].sort()).toEqual([
      'AGG-03',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
    expect([...m.racks].sort()).toEqual([
      'rack-a03',
      'rack-core-01',
      'rack-sm01',
    ])
    expect([...m.nodes].sort()).toEqual(['node-a', 'node-core', 'node-sm'])
    expect([...m.sites]).toEqual(['site-main'])
    expect(m.endpoints.has('HDF-01:3C/5:r')).toBe(true)
    expect(m.endpoints.has('HDF-01:3C/5:f')).toBe(true)
    expect(m.endpoints.has('HDF-01:1A/2:r')).toBe(false)
    expect(m.equipmentBySite.get('site-main')).toBe(5)
    expect(m.equipmentByNode.get('node-core')).toBe(2)
    expect(m.equipmentByRack.get('rack-core-01')).toBe(2)
  })

  it('changes with the selected route and ignores the other results', () => {
    const [, agg08, bb] = edge17Result().routes
    const m = routeMarks(index, agg08)
    expect(m.equipment.has('AGG-08')).toBe(true)
    expect(m.equipment.has('AGG-03')).toBe(false)
    expect(m.racks.has('rack-core-02')).toBe(true)
    expect(m.racks.has('rack-core-01')).toBe(true) // HDF-02 sits there
    expect(m.racks.has('rack-core-03')).toBe(false)
    const b = routeMarks(index, bb)
    expect(b.racks.has('rack-core-03')).toBe(true)
    expect(b.racks.has('rack-core-02')).toBe(false)
  })

  it('marks Network B route sites in both sites', () => {
    const m = routeMarks(index, {
      start: 'EDGE-22:p1',
      end: 'AGG-12:p1',
      hops: [
        {
          linkId: 'B01',
          from: 'EDGE-22:p1',
          to: 'PANEL-DR:1:f',
          kind: 'cable',
        },
        {
          linkId: 'B04',
          from: 'HDF-02:2B/6:r',
          to: 'AGG-12:p1',
          kind: 'cable',
        },
      ],
    })
    expect([...m.sites].sort()).toEqual(['site-dr', 'site-main'])
  })
})
