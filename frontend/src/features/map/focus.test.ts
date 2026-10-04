import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { routeHighlight } from '../pathfinding/projection'
import {
  boundaryId,
  equipmentInFocus,
  focusView,
  resolveFocus,
  type Focus,
} from './focus'
import { indexSnapshot } from './snapshotIndex'
import { visibleEquipment } from './networks'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)
const building: Focus = { kind: 'node', id: 'node-a' }
const core: Focus = { kind: 'node', id: 'node-core' }
const mainCampus: Focus = { kind: 'site', id: 'site-main' }
const all = new Set(s.equipment.map((e) => e.id))
const sorted = (x: Iterable<string>) => [...x].sort()

function view(
  focus: Focus | undefined,
  over: {
    passes?: Set<string>
    reveal?: Set<string>
    expanded?: Set<string>
  } = {},
) {
  return focusView(index, {
    focus,
    passes: over.passes ?? all,
    reveal: over.reveal ?? new Set(),
    expanded: over.expanded ?? new Set(),
  })
}

describe('C13 equipment in a focus', () => {
  it('a node focus holds the equipment located in its racks', () => {
    expect(sorted(equipmentInFocus(index, building))).toEqual([
      'EDGE-17',
      'PANEL-A',
    ])
    expect(sorted(equipmentInFocus(index, core))).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'HDF-02',
    ])
  })

  it('a site focus holds every node of the site', () => {
    expect(sorted(equipmentInFocus(index, mainCampus))).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
  })

  it('ignores a focus that does not exist in this snapshot', () => {
    expect(resolveFocus(index, { kind: 'node', id: 'gone' })).toBeUndefined()
    expect(resolveFocus(index, building)).toEqual(building)
    expect(resolveFocus(index, undefined)).toBeUndefined()
  })
})

describe('C09 boundary bundles summarize cables that leave the focus', () => {
  it('groups outside cables by outside node and labels them', () => {
    const { bundles } = view(building)
    expect(bundles).toHaveLength(1)
    expect(bundles[0].label).toBe('3 cables to North Sub-main')
    expect(bundles[0].linkIds).toEqual(['A02', 'A06', 'A10'])
    expect(bundles[0].expanded).toBe(false)
  })

  it('keeps every real cable ID with both endpoint IDs', () => {
    const [bundle] = view(building).bundles
    expect(bundle.cables).toEqual([
      {
        linkId: 'A02',
        inside: 'PANEL-A:1:r',
        outside: 'HDF-01:3C/5:r',
        insideEquipmentId: 'PANEL-A',
        outsideEquipmentId: 'HDF-01',
      },
      {
        linkId: 'A06',
        inside: 'PANEL-A:2:r',
        outside: 'HDF-01:1A/2:r',
        insideEquipmentId: 'PANEL-A',
        outsideEquipmentId: 'HDF-01',
      },
      {
        linkId: 'A10',
        inside: 'PANEL-A:3:r',
        outside: 'HDF-01:2D/4:r',
        insideEquipmentId: 'PANEL-A',
        outsideEquipmentId: 'HDF-01',
      },
    ])
    expect(bundle.insideEquipment).toEqual(['PANEL-A'])
    expect(bundle.outsideEquipment).toEqual(['HDF-01'])
  })

  it('makes one bundle per outside location, singular for one cable', () => {
    const { bundles } = view(core)
    expect(bundles.map((b) => b.label)).toEqual([
      '1 cable to DR Distribution',
      '4 cables to North Sub-main',
    ])
    expect(bundles[1].linkIds).toEqual(['A03', 'A07', 'A11', 'B03'])
  })

  it('a site focus summarizes per outside node', () => {
    expect(view(mainCampus).bundles.map((b) => b.label)).toEqual([
      '1 cable to DR Access',
      '1 cable to DR Distribution',
    ])
  })

  it('summarizes under the site when the outside node is unknown', () => {
    const doctored = acceptanceSnapshot()
    doctored.equipment.find((e) => e.id === 'AGG-12')!.rackId = 'no-such-rack'
    const idx = indexSnapshot(doctored)
    const v = focusView(idx, {
      focus: core,
      passes: new Set(doctored.equipment.map((e) => e.id)),
      reveal: new Set(),
      expanded: new Set(),
    })
    expect(v.bundles.map((b) => b.label)).toContain(
      '1 cable to unknown location',
    )
  })

  it('shows only focused equipment until a bundle is expanded', () => {
    expect(sorted(view(building).shown)).toEqual(['EDGE-17', 'PANEL-A'])
  })

  it('expanding reveals the real neighbor cards and keeps the bundle to collapse', () => {
    const id = boundaryId(building, { kind: 'node', id: 'node-sm' })
    const v = view(building, { expanded: new Set([id]) })
    expect(sorted(v.shown)).toEqual(['EDGE-17', 'HDF-01', 'PANEL-A'])
    expect(v.bundles).toHaveLength(1)
    expect(v.bundles[0]).toMatchObject({ id, expanded: true })
    expect(v.bundles[0].linkIds).toEqual(['A02', 'A06', 'A10'])
  })

  it('expanding one bundle leaves the others folded', () => {
    const id = boundaryId(core, { kind: 'node', id: 'node-sm' })
    const v = view(core, { expanded: new Set([id]) })
    expect(v.shown.has('HDF-01')).toBe(true)
    expect(v.shown.has('AGG-12')).toBe(false)
    expect(v.bundles.find((b) => b.id === id)!.expanded).toBe(true)
  })

  it('has no bundles and shows the filter result without a focus', () => {
    const v = view(undefined)
    expect(v.bundles).toEqual([])
    expect(v.shown).toEqual(all)
  })
})

describe('focus combines with the network filter and routes', () => {
  it('a card must pass both the focus and the filter', () => {
    const passes = visibleEquipment(s, 'B')
    const v = view(core, { passes })
    expect(sorted(v.shown)).toEqual(['HDF-02'])
    // Cables to cards the filter hides are not summarized.
    expect(v.bundles.map((b) => b.label)).toEqual([
      '1 cable to DR Distribution',
      '4 cables to North Sub-main',
    ])
  })

  it('does not summarize cables to outside cards the filter hides', () => {
    const passes = visibleEquipment(s, 'A')
    const v = view(core, { passes })
    expect(v.bundles.map((b) => b.label)).toEqual([
      '4 cables to North Sub-main',
    ])
  })

  it('a selected route reveals its cards outside the focus', () => {
    const reveal = routeHighlight(s, agg03Route()).equipmentIds
    const v = view(building, { reveal: new Set(reveal) })
    expect(sorted(v.shown)).toEqual([
      'AGG-03',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
    // HDF-01 is on screen, so its cables are real edges, not a summary.
    expect(v.bundles).toEqual([])
  })

  it('hides revealed cards again once the route is cleared', () => {
    expect(sorted(view(building).shown)).toEqual(['EDGE-17', 'PANEL-A'])
  })
})

describe('focus view cost', () => {
  it('reads each cable endpoint a constant number of times, never equipment x links', () => {
    const big = acceptanceSnapshot()
    for (let i = 0; i < 300; i++) {
      const id = `BULK-${i}`
      big.equipment.push({
        ...big.equipment[0],
        id,
        name: id,
        rackId: 'rack-core-03',
      })
      big.endpoints.push({ id: `${id}:p1`, equipmentId: id, label: '1' })
      big.endpoints.push({ id: `${id}:p2`, equipmentId: id, label: '2' })
      big.links.push({
        id: `bulk-${i}`,
        kind: 'cable',
        a: `${id}:p1`,
        b: 'EDGE-17:p10',
      })
    }
    const idx = indexSnapshot(big)
    let reads = 0
    const counted = new Map(idx.owner)
    const get = counted.get.bind(counted)
    counted.get = (k: string) => (reads++, get(k))
    focusView(
      { ...idx, owner: counted },
      {
        focus: building,
        passes: new Set(big.equipment.map((e) => e.id)),
        reveal: new Set(),
        expanded: new Set(),
      },
    )
    const cables = big.links.filter((l) => l.kind === 'cable').length
    expect(reads).toBeLessThanOrEqual(2 * cables)
  })
})
