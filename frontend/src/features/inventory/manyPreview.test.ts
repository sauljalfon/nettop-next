import { describe, expect, it } from 'vitest'
import { piecesText } from '../../shared/textPieces'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { deleteSummary, disconnectSummary } from './manyPreview'

/** INV-13: what the Delete N… and Disconnect N… panes list. */
const s: Snapshot = acceptanceSnapshot()
const index = indexSnapshot(s)

describe('deleteSummary', () => {
  it('lists each equipment with its place, and counts what goes with them', () => {
    const d = deleteSummary(s, index, ['EDGE-17', 'PANEL-A'])
    expect(
      d.items.map((i) => [i.name, i.endpoints, piecesText(i.place)]),
    ).toEqual([
      ['EDGE-17', 24, 'Building A › Rack A03 · U1'],
      ['PANEL-A', 48, 'Building A › Rack A03 · U1'],
    ])
    expect(d.items[0].unit).toBe('ports')
    expect(d.items[1].unit).toBe('positions')
    expect(d.endpoints).toBe(72)
    // A01, A05 and A09 are on both; the panel's rear cables are its own: 6 cables.
    expect(d.cables).toBe(6)
    expect(d.circuits).toHaveLength(3)
    expect(d.circuits[0]).toMatch(/→/)
  })

  it('keeps the names apart as pieces, Hebrew included', () => {
    const t: Snapshot = {
      ...s,
      equipment: s.equipment.map((e) =>
        e.id === 'EDGE-17' ? { ...e, name: 'מתג קומה 2' } : e,
      ),
    }
    const [item] = deleteSummary(t, indexSnapshot(t), ['EDGE-17']).items
    expect(item.name).toBe('מתג קומה 2')
    expect(item.place.filter((p) => 'name' in p)).toEqual([
      { name: 'Building A' },
      { name: 'Rack A03' },
    ])
  })

  it('has no circuit for equipment without a cable, and skips an unknown ID', () => {
    const d = deleteSummary(s, index, ['AGG-15', 'gone'])
    expect(d.items.map((i) => i.name)).toEqual(['AGG-15'])
    expect(d.cables).toBe(0)
    expect(d.circuits).toEqual([])
  })
})

describe('disconnectSummary', () => {
  it('lists each cable with its label and both ends as pieces, and the circuits cut', () => {
    const t: Snapshot = {
      ...s,
      links: s.links.map((l) =>
        l.id === 'A01' ? { ...l, label: 'קומה 2' } : l,
      ),
    }
    const d = disconnectSummary(t, indexSnapshot(t), ['A01', 'A02'])
    expect(d.cables.map((c) => [c.id, c.label])).toEqual([
      ['A01', 'קומה 2'],
      ['A02', 'No label'],
    ])
    expect(piecesText(d.cables[0].ends)).toBe('EDGE-17 1 ↔ PANEL-A 1 front')
    expect(d.cables[0].ends.filter((p) => 'name' in p)).toEqual([
      { name: 'EDGE-17' },
      { name: '1' },
      { name: 'PANEL-A' },
      { name: '1 front' },
    ])
    // Both belong to the one circuit EDGE-17 to AGG-03.
    expect(d.circuits).toHaveLength(1)
  })

  it('skips a cable that is not there', () => {
    expect(disconnectSummary(s, index, ['gone']).cables).toEqual([])
  })
})
