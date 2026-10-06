import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { resolveLocation, SITES, type PhysicalLocation } from './location'
import {
  breadcrumbs,
  historyReducer,
  initialHistory,
  type PhysicalHistory,
} from './history'

const index = indexSnapshot(physicalSnapshot())

describe('resolveLocation fills ancestors from the deepest ID', () => {
  it('an equipment knows its rack, node and site', () => {
    expect(
      resolveLocation(index, { level: 'equipment', equipmentId: 'HDF-01' }),
    ).toEqual({
      level: 'equipment',
      equipmentId: 'HDF-01',
      rackId: 'rack-sm01',
      nodeId: 'node-sm',
      siteId: 'site-main',
    })
  })

  it('keeps an endpoint and takes its side', () => {
    const r = resolveLocation(index, {
      level: 'equipment',
      equipmentId: 'HDF-01',
      endpointId: 'HDF-01:3C/5:r',
    })
    expect(r.endpointId).toBe('HDF-01:3C/5:r')
    expect(r.side).toBe('rear')
  })

  it('drops an endpoint that belongs to other equipment', () => {
    const r = resolveLocation(index, {
      level: 'equipment',
      equipmentId: 'HDF-02',
      endpointId: 'HDF-01:3C/5:r',
    })
    expect(r.endpointId).toBeUndefined()
  })

  it('ignores IDs deeper than the level', () => {
    expect(
      resolveLocation(index, {
        level: 'node',
        nodeId: 'node-sm',
        rackId: 'rack-sm01',
        equipmentId: 'HDF-01',
      }),
    ).toEqual({ level: 'node', nodeId: 'node-sm', siteId: 'site-main' })
  })

  it('keeps a chosen side with no endpoint', () => {
    const r = resolveLocation(index, {
      level: 'equipment',
      equipmentId: 'HDF-01',
      side: 'front',
    })
    expect(r.side).toBe('front')
  })
})

describe('PHY-02 a location whose objects vanished falls back to the nearest ancestor', () => {
  const gone: PhysicalLocation = {
    level: 'equipment',
    equipmentId: 'HDF-GONE',
    endpointId: 'HDF-GONE:1A/1:f',
    side: 'front',
    rackId: 'rack-sm01',
    nodeId: 'node-sm',
    siteId: 'site-main',
  }

  it('falls back to the rack', () => {
    expect(resolveLocation(index, gone)).toEqual({
      level: 'rack',
      rackId: 'rack-sm01',
      nodeId: 'node-sm',
      siteId: 'site-main',
    })
  })

  it('then to the node, then the site, then Sites', () => {
    const noRack = { ...gone, rackId: 'rack-gone' }
    expect(resolveLocation(index, noRack)).toEqual({
      level: 'node',
      nodeId: 'node-sm',
      siteId: 'site-main',
    })
    const noNode = { ...noRack, nodeId: 'node-gone' }
    expect(resolveLocation(index, noNode)).toEqual({
      level: 'site',
      siteId: 'site-main',
    })
    expect(resolveLocation(index, { ...noNode, siteId: 'site-gone' })).toEqual(
      SITES,
    )
  })

  it('never lets a stale ancestor ID override the deepest existing one', () => {
    const r = resolveLocation(index, {
      level: 'rack',
      rackId: 'rack-dr01',
      nodeId: 'node-a',
      siteId: 'site-main',
    })
    expect(r).toEqual({
      level: 'rack',
      rackId: 'rack-dr01',
      nodeId: 'node-dr1',
      siteId: 'site-dr',
    })
  })
})

describe('PHY-01 Back restores the exact location, endpoint and side', () => {
  const run = (
    state: PhysicalHistory,
    ...to: PhysicalLocation[]
  ): PhysicalHistory =>
    to.reduce(
      (s, loc) => historyReducer(s, { type: 'navigate', to: loc }),
      state,
    )

  const hdf: PhysicalLocation = {
    level: 'equipment',
    equipmentId: 'HDF-01',
    rackId: 'rack-sm01',
    nodeId: 'node-sm',
    siteId: 'site-main',
    endpointId: 'HDF-01:3C/5:r',
    side: 'rear',
  }

  it('starts at Sites with no history', () => {
    const s = initialHistory()
    expect(s.current).toEqual(SITES)
    expect(s.back).toHaveLength(0)
  })

  it('back returns the previous location exactly', () => {
    const peer: PhysicalLocation = {
      ...hdf,
      equipmentId: 'HDF-02',
      rackId: 'rack-core-01',
      nodeId: 'node-core',
      endpointId: 'HDF-02:2B/3:f',
      side: 'front',
    }
    let s = run(
      initialHistory(),
      { level: 'site', siteId: 'site-main' },
      hdf,
      peer,
    )
    expect(s.current).toEqual(peer)
    s = historyReducer(s, { type: 'back' })
    expect(s.current).toEqual(hdf)
    s = historyReducer(s, { type: 'back' })
    s = historyReducer(s, { type: 'back' })
    expect(s.current).toEqual(SITES)
  })

  it('back at the bottom of the history changes nothing', () => {
    const s = initialHistory()
    expect(historyReducer(s, { type: 'back' })).toBe(s)
  })

  it('navigating to the current location does not push', () => {
    const s = run(initialHistory(), hdf, { ...hdf })
    expect(s.back).toHaveLength(1)
  })

  it('a breadcrumb navigates (pushes) to an ancestor and Back returns', () => {
    const start = run(initialHistory(), hdf)
    const crumbs = breadcrumbs(index, start.current)
    const node = crumbs.find((c) => c.location.level === 'node')!
    const s = historyReducer(start, { type: 'navigate', to: node.location })
    expect(s.current.level).toBe('node')
    expect(historyReducer(s, { type: 'back' }).current).toEqual(hdf)
  })
})

describe('breadcrumbs', () => {
  it('lists Sites, site, node, rack and equipment with names', () => {
    const crumbs = breadcrumbs(index, {
      level: 'equipment',
      equipmentId: 'HDF-01',
    })
    expect(crumbs.map((c) => c.label)).toEqual([
      'Sites',
      'Main Campus',
      'North Sub-main',
      'Rack SM01',
      'HDF-01',
    ])
    expect(crumbs.map((c) => c.location.level)).toEqual([
      'sites',
      'site',
      'node',
      'rack',
      'equipment',
    ])
    expect(crumbs[2].location).toEqual({
      level: 'node',
      siteId: 'site-main',
      nodeId: 'node-sm',
    })
  })

  it('is just Sites at the top', () => {
    expect(breadcrumbs(index, SITES).map((c) => c.label)).toEqual(['Sites'])
  })
})
