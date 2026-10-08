import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, edge17Result } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { hopRows } from './hops'

describe('POL-04 ordered hop rows, shared by the map overlay and Physical', () => {
  const s = acceptanceSnapshot()
  const [route] = edge17Result().routes
  const rows = hopRows(indexSnapshot(s), route)

  it('starts with START, then one row per hop in route order', () => {
    expect(rows).toHaveLength(1 + route.hops.length)
    expect(rows[0]).toMatchObject({
      kind: 'start',
      title: 'START',
      label: 'EDGE-17 · 1',
      endpointId: 'EDGE-17:p1',
    })
  })

  it('numbers each hop and names it CABLE or PANEL BRIDGE', () => {
    expect(rows.slice(1).map((r) => r.title)).toEqual([
      '1 · CABLE',
      '2 · PANEL BRIDGE',
      '3 · CABLE',
      '4 · PANEL BRIDGE',
      '5 · CABLE',
      '6 · PANEL BRIDGE',
      '7 · CABLE',
    ])
  })

  it('labels each hop by the endpoint it arrives at, with its link ID', () => {
    expect(rows.slice(1).map((r) => [r.label, r.linkId])).toEqual([
      ['PANEL-A · 1 front', 'A01'],
      ['PANEL-A · 1 rear', 'PANEL-A:1:bridge'],
      ['HDF-01 · 3C/5 rear', 'A02'],
      ['HDF-01 · 3C/5 front', 'HDF-01:3C/5:bridge'],
      ['HDF-02 · 2B/3 front', 'A03'],
      ['HDF-02 · 2B/3 rear', 'HDF-02:2B/3:bridge'],
      ['AGG-03 · 1', 'A04'],
    ])
  })

  it('points each row at an endpoint, so a click can select its equipment', () => {
    expect(rows.map((r) => r.endpointId)).toEqual([
      'EDGE-17:p1',
      ...route.hops.map((h) => h.to),
    ])
  })

  it('is a start row alone for a zero-hop route', () => {
    expect(hopRows(indexSnapshot(s), { ...route, hops: [] })).toHaveLength(1)
  })
})

describe('TR-02 hop labels and link labels are readable', () => {
  const s = acceptanceSnapshot()
  const [route] = edge17Result().routes

  it('a link reads its cable ID, or "bridge" for an internal link', () => {
    const rows = hopRows(indexSnapshot(s), route)
    expect(rows.slice(1).map((r) => r.linkLabel)).toEqual([
      'A01',
      'bridge',
      'A02',
      'bridge',
      'A03',
      'bridge',
      'A04',
    ])
    expect(rows[0].linkLabel).toBeUndefined()
    // The identity stays available for tests and tools.
    expect(rows[2].linkId).toBe('PANEL-A:1:bridge')
  })

  it('a position reads equipment, position and side from the structure, not from the stored label', () => {
    const odd = {
      ...s,
      endpoints: s.endpoints.map((e) =>
        e.id === 'PANEL-A:1:f'
          ? { ...e, label: '1 · Front' }
          : e.id === 'HDF-01:3C/5:r'
            ? { ...e, label: 'sp 3C pos 5 (rear)' }
            : e,
      ),
    }
    const labels = hopRows(indexSnapshot(odd), route).map((r) => r.label)
    expect(labels[1]).toBe('PANEL-A · 1 front')
    expect(labels[3]).toBe('HDF-01 · 3C/5 rear')
  })

  it('a device port reads equipment and its own label', () => {
    expect(hopRows(indexSnapshot(s), route)[0].label).toBe('EDGE-17 · 1')
  })
})
