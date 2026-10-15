import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { buildSearchItems, searchExplore } from './portSearch'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)
const items = buildSearchItems(index)

describe('SR-01 a cable ID finds the cable and opens its first end', () => {
  it('"a03" lists cable A03 and nothing else', () => {
    const r = searchExplore(items, 'a03')
    expect(r.cables.rows.map((x) => x.id)).toEqual(['A03'])
    expect(r.ports.rows).toEqual([])
  })

  it('shows the cable with both ends and opens its first end', () => {
    const [row] = searchExplore(items, 'a03').cables.rows
    expect(row.label).toBe('A03 · HDF-01 · 3C/5 front ↔ HDF-02 · 2B/3 front')
    expect(row.openEndpointId).toBe('HDF-01:3C/5:f')
  })

  it('ignores case', () => {
    expect(searchExplore(items, 'A03').cables.rows.map((x) => x.id)).toEqual([
      'A03',
    ])
  })
})

describe('SR-02 equipment and a position find both sides, and the cables on them', () => {
  it('"hdf-01 3c/5" lists the front and the rear under Ports, and A02 and A03 under Cables', () => {
    const r = searchExplore(items, 'hdf-01 3c/5')
    expect(r.ports.rows.map((x) => x.label).sort()).toEqual([
      'HDF-01 · 3C/5 front',
      'HDF-01 · 3C/5 rear',
    ])
    expect(r.ports.rows.map((x) => x.id).sort()).toEqual([
      'HDF-01:3C/5:f',
      'HDF-01:3C/5:r',
    ])
    expect(r.cables.rows.map((x) => x.id).sort()).toEqual(['A02', 'A03'])
  })

  it('"panel-a 1 rear" finds that one position side', () => {
    const r = searchExplore(items, 'panel-a 1 rear')
    expect(r.ports.rows.map((x) => x.id)).toContain('PANEL-A:1:r')
    expect(r.ports.rows.map((x) => x.label)).toContain('PANEL-A · 1 rear')
  })

  it('the readable label of a position is built from the structure', () => {
    const odd = {
      ...s,
      endpoints: s.endpoints.map((e) =>
        e.id === 'PANEL-A:1:r' ? { ...e, label: '1 · Rear' } : e,
      ),
    }
    const r = searchExplore(
      buildSearchItems(indexSnapshot(odd)),
      'panel-a 1 rear',
    )
    expect(r.ports.rows.map((x) => x.label)).toContain('PANEL-A · 1 rear')
  })

  it('a port is found by its equipment and number', () => {
    const r = searchExplore(items, 'edge-17 3')
    expect(r.ports.rows[0].id).toBe('EDGE-17:p3')
  })
})

describe('results are capped at 50 with the rest counted', () => {
  it('a broad query keeps 50 ports and says how many more', () => {
    const r = searchExplore(items, 'e')
    expect(r.ports.rows).toHaveLength(50)
    expect(r.ports.more).toBeGreaterThan(0)
    expect(r.cables.rows.length).toBeLessThanOrEqual(50)
  })

  it('an empty query finds nothing', () => {
    expect(searchExplore(items, '  ')).toEqual({
      ports: { rows: [], more: 0 },
      cables: { rows: [], more: 0 },
    })
  })

  it('internal bridges are never offered as cables', () => {
    expect(searchExplore(items, 'bridge').cables.rows).toEqual([])
  })
})

describe('VP-03 search rows carry pieces', () => {
  const text = (pieces: readonly ({ text: string } | { name: string })[]) =>
    pieces.map((x) => ('name' in x ? x.name : x.text)).join('')

  it('a port row joins to its label, equipment and position as names', () => {
    const { ports } = searchExplore(items, 'HDF-01 3C/5')
    expect(ports.rows.length).toBeGreaterThan(0)
    for (const row of ports.rows) {
      expect(text(row.pieces)).toBe(row.label)
      expect(row.pieces.filter((x) => 'name' in x)).toHaveLength(2)
    }
  })

  it('a cable row has the cable ID as text and each end as pieces', () => {
    const [row] = searchExplore(items, 'a03').cables.rows
    expect(text(row.pieces)).toBe(row.label)
    expect(row.pieces[0]).toEqual({ text: 'A03 · ' })
    expect(
      row.pieces
        .filter((x) => 'name' in x)
        .map((x) => (x as { name: string }).name),
    ).toEqual(['HDF-01', '3C/5 front', 'HDF-02', '2B/3 front'])
  })
})
