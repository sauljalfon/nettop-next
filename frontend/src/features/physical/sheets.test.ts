import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot, withFullHdf } from './testFixture'
import { buildInventory } from './inventory'
import {
  asciiLine,
  equipmentSheetRows,
  rackSheetRows,
  sheetFileName,
  sheetHeader,
  sheetTextLines,
} from './sheets'

const s = withFullHdf(physicalSnapshot(), 'HDF-01', 4)
const index = indexSnapshot(s)
const inv = buildInventory(s, index)

describe('PR-01 the rack sheet table', () => {
  it('lists equipment from the top unit down: unit, name, kind, role, network', () => {
    const rows = rackSheetRows(inv, 'rack-core-01', s.networks)
    expect(rows).toEqual([
      {
        unit: 'U8',
        name: 'AGG-03',
        kind: 'switch',
        role: 'aggregation',
        network: 'Network A',
      },
      {
        unit: 'U4–U6',
        name: 'HDF-02',
        kind: 'hdf',
        role: 'passive',
        network: '',
      },
    ])
  })

  it('an empty rack has no rows', () => {
    expect(rackSheetRows(inv, 'rack-gone', s.networks)).toEqual([])
  })
})

describe('PR-02 the equipment sheet table lists cabled endpoints only', () => {
  const rows = equipmentSheetRows(index, 'HDF-01')

  it('HDF-01 has four cabled positions, eight cabled sides', () => {
    expect(rows).toHaveLength(8)
    expect([...new Set(rows.map((r) => r.label))].sort()).toEqual([
      '1A / 2',
      '2D / 4',
      '3C / 2',
      '3C / 5',
    ])
  })

  it('each row has the label, side, cable, far end and far location', () => {
    const r = rows.find((x) => x.label === '3C / 5' && x.side === 'rear')!
    expect(r).toEqual({
      label: '3C / 5',
      side: 'rear',
      cableId: 'A02',
      farEnd: 'PANEL-A · 1 rear',
      farLocation: 'Main Campus / Building A / Rack A03',
    })
    expect(
      rows.find((x) => x.label === '3C / 5' && x.side === 'front')!.cableId,
    ).toBe('A03')
  })

  it('orders by position, then front before rear', () => {
    expect(rows.map((r) => `${r.label} ${r.side}`).slice(0, 4)).toEqual([
      '1A / 2 front',
      '1A / 2 rear',
      '2D / 4 front',
      '2D / 4 rear',
    ])
  })

  it('a switch lists its cabled ports with no side', () => {
    const edge = equipmentSheetRows(index, 'EDGE-17')
    expect(edge.map((r) => [r.label, r.cableId, r.side])).toEqual([
      ['1', 'A01', ''],
      ['2', 'A05', ''],
      ['3', 'A09', ''],
    ])
  })
})

describe('the sheet header and file names', () => {
  it('name, Site / Node / Rack, then Installed or the plan name and the date', () => {
    expect(
      sheetHeader({
        title: 'HDF-01',
        location: 'Main Campus / North Sub-main / Rack SM01',
        date: '2026-10-08',
      }),
    ).toEqual({
      title: 'HDF-01',
      lines: [
        'Main Campus / North Sub-main / Rack SM01',
        'Installed · 2026-10-08',
      ],
    })
    expect(
      sheetHeader({
        title: 'Rack SM01',
        location: 'Main Campus / North Sub-main',
        plan: 'Expansion',
        date: '2026-10-08',
      }).lines[1],
    ).toBe('Proposed: Expansion · 2026-10-08')
  })

  it('file names use safe characters only', () => {
    expect(sheetFileName('rack', 'Rack SM01')).toBe('rack-Rack-SM01.pdf')
    expect(sheetFileName('equipment', 'HDF-01')).toBe('equipment-HDF-01.pdf')
    expect(sheetFileName('equipment', 'A/B: c')).toBe('equipment-A-B-c.pdf')
  })

  it('the PDF text layer is ASCII: arrows, dots and en dashes are replaced', () => {
    expect(asciiLine('U4–U6 · HDF-01 → x ↔ y')).toBe(
      'U4-U6 - HDF-01 -> x <-> y',
    )
    expect(asciiLine('é')).toBe('?')
  })

  it('the text layer holds the header, then each table row on one line', () => {
    const lines = sheetTextLines(
      {
        title: 'HDF-01',
        lines: [
          'Main Campus / North Sub-main / Rack SM01',
          'Installed · 2026-10-08',
        ],
      },
      ['Position', 'Side'],
      [['3C / 5', 'rear']],
    )
    expect(lines).toEqual([
      'HDF-01',
      'Main Campus / North Sub-main / Rack SM01',
      'Installed - 2026-10-08',
      'Position | Side',
      '3C / 5 | rear',
    ])
  })
})
