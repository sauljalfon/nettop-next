import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { highlightFor, resolveLocation } from './highlight'
import { indexSnapshot } from './snapshotIndex'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)

describe('POL-14 highlight of a location', () => {
  it('Building A: its equipment, every cable leaving that equipment, and the far-end neighbor', () => {
    expect(highlightFor(index, { kind: 'node', id: 'node-a' })).toEqual({
      location: { kind: 'node', id: 'node-a' },
      equipmentIds: ['EDGE-17', 'PANEL-A'],
      // EDGE-17 ↔ PANEL-A (a01/a05/a09) and PANEL-A ↔ HDF-01 (a02/a06/a10)
      linkIds: ['A01', 'A02', 'A05', 'A06', 'A09', 'A10'],
      neighborIds: ['HDF-01'],
    })
  })

  it('includes cables between highlighted equipment, and not their far ends twice', () => {
    const h = highlightFor(index, { kind: 'node', id: 'node-core' })!
    expect(h.equipmentIds).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'HDF-02',
    ])
    // A04/A08/A12 stay inside the node; A03/A07/A11/B03 go to HDF-01; B04 to AGG-12.
    expect(h.linkIds).toEqual([
      'A03',
      'A04',
      'A07',
      'A08',
      'A11',
      'A12',
      'B03',
      'B04',
    ])
    expect(h.neighborIds).toEqual(['AGG-12', 'HDF-01'])
  })

  it('a site covers all of its nodes', () => {
    const h = highlightFor(index, { kind: 'site', id: 'site-main' })!
    expect(h.equipmentIds).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
    expect(h.neighborIds).toEqual(['AGG-12', 'PANEL-DR'])
    expect(h.linkIds).toContain('B02')
    expect(h.linkIds).not.toContain('B01') // EDGE-22 ↔ PANEL-DR is entirely outside
  })

  it('lists a far end only for cables that leave the location, and unconnected equipment has none', () => {
    const h = highlightFor(index, { kind: 'node', id: 'node-dr1' })!
    expect(h.equipmentIds).toEqual(['EDGE-22', 'PANEL-DR'])
    expect(h.neighborIds).toEqual(['HDF-01']) // only PANEL-DR ↔ HDF-01 leaves DR Access
    const doctored = acceptanceSnapshot()
    doctored.equipment.find((e) => e.id === 'AGG-15')!.rackId = 'rack-core-03'
    const lone = highlightFor(indexSnapshot(doctored), {
      kind: 'node',
      id: 'node-core',
    })!
    expect(lone.equipmentIds).toContain('AGG-15')
  })

  it('lists each cable and each neighbor once', () => {
    const h = highlightFor(index, { kind: 'node', id: 'node-a' })!
    expect(new Set(h.linkIds).size).toBe(h.linkIds.length)
    expect(new Set(h.neighborIds).size).toBe(h.neighborIds.length)
  })

  it('never lists internal bridges', () => {
    const h = highlightFor(index, { kind: 'node', id: 'node-sm' })!
    expect(h.linkIds.some((id) => id.endsWith(':bridge'))).toBe(false)
    expect(h.equipmentIds).toEqual(['HDF-01'])
  })

  it('ignores a location that is not in the snapshot, or none', () => {
    expect(highlightFor(index, { kind: 'node', id: 'gone' })).toBeUndefined()
    expect(highlightFor(index, { kind: 'site', id: 'gone' })).toBeUndefined()
    expect(highlightFor(index, undefined)).toBeUndefined()
  })

  it('leaves out equipment whose rack is unknown', () => {
    const doctored = acceptanceSnapshot()
    doctored.equipment.find((e) => e.id === 'EDGE-17')!.rackId = 'gone'
    const h = highlightFor(indexSnapshot(doctored), {
      kind: 'node',
      id: 'node-a',
    })!
    expect(h.equipmentIds).toEqual(['PANEL-A'])
    expect(h.neighborIds).toEqual(['EDGE-17', 'HDF-01'])
  })
})

describe('resolving a location', () => {
  it('keeps one that exists and drops one that does not', () => {
    expect(resolveLocation(index, { kind: 'node', id: 'node-a' })).toEqual({
      kind: 'node',
      id: 'node-a',
    })
    expect(resolveLocation(index, { kind: 'site', id: 'site-dr' })).toEqual({
      kind: 'site',
      id: 'site-dr',
    })
    expect(
      resolveLocation(index, { kind: 'node', id: 'site-dr' }),
    ).toBeUndefined()
    expect(resolveLocation(index, undefined)).toBeUndefined()
  })
})
