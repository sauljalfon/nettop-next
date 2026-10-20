import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import {
  LABELS_PER_PAGE,
  buildLabels,
  labelIds,
  labelTextLines,
  labelsHeader,
  labelsFileName,
  newCableIds,
  pages,
} from './labels'
import { buildRows } from './rows'

/** INV-15: cable labels. */
const s: Snapshot = {
  ...acceptanceSnapshot(),
}
s.links = s.links.map((l) => (l.id === 'A01' ? { ...l, label: 'מגירה 4' } : l))
const index = indexSnapshot(s)
const rows = buildRows(
  s,
  index,
  new Set(s.equipment.map((e) => e.id)),
  new Set(),
)
const endpoints = new Map(s.endpoints.map((p) => [p.id, p]))

describe('label sources', () => {
  const cableRows = rows.cables.slice(0, 3)
  it('Selected takes the rows with a cable, each cable once', () => {
    const port = (id: string) => rows.ports.find((r) => r.key === id)!
    // Both ends of A01 are selected: one label.
    const selected = [
      port('EDGE-17:p1'),
      port('PANEL-A:1:f'),
      port('EDGE-17:p9'),
      cableRows[1],
    ]
    expect(
      labelIds('selected', { selected, listed: [], planCableIds: [] }),
    ).toEqual(['A01', cableRows[1].cableId])
  })

  it('Listed takes every listed row with a cable', () => {
    expect(
      labelIds('listed', { selected: [], listed: cableRows, planCableIds: [] }),
    ).toEqual(cableRows.map((r) => r.cableId))
    const free = rows.ports.filter((r) => !r.cableId).slice(0, 3)
    expect(
      labelIds('listed', { selected: [], listed: free, planCableIds: [] }),
    ).toEqual([])
  })

  it('New in this plan takes the cables the plan adds, not its bridges', () => {
    const plan = {
      links: [
        { id: 'c-new', a: 'x', b: 'y', kind: 'cable' as const },
        { id: 'bridge', a: 'x', b: 'z', kind: 'internal' as const },
      ],
    }
    expect(newCableIds(plan)).toEqual(['c-new'])
    expect(
      labelIds('new', { selected: [], listed: [], planCableIds: ['c-new'] }),
    ).toEqual(['c-new'])
  })
})

describe('buildLabels', () => {
  it('holds the cable ID, its label or "No label", and both ends as pieces', () => {
    const [one, two] = buildLabels(['A01', 'A02'], index, (id) =>
      endpoints.get(id),
    )
    expect(one).toEqual({
      cableId: 'A01',
      label: 'מגירה 4',
      a: { equipmentName: 'EDGE-17', label: '1' },
      b: { equipmentName: 'PANEL-A', label: '1 front' },
    })
    expect(two.label).toBe('No label')
  })

  it('skips a cable that is not in the snapshot', () => {
    expect(
      buildLabels(['A01', 'gone'], index, (id) => endpoints.get(id)),
    ).toHaveLength(1)
  })
})

describe('pages', () => {
  const labels = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      cableId: `c${i}`,
      label: 'No label',
      a: { equipmentName: 'A', label: '1' },
      b: { equipmentName: 'B', label: '1' },
    }))

  it('has 16 labels a page (2 × 8 on A4)', () => {
    expect(LABELS_PER_PAGE).toBe(16)
    expect(pages(labels(0))).toEqual([])
    expect(pages(labels(16)).map((p) => p.length)).toEqual([16])
    expect(pages(labels(17)).map((p) => p.length)).toEqual([16, 1])
    expect(pages(labels(40)).map((p) => p.length)).toEqual([16, 16, 8])
  })
})

describe('the file name', () => {
  const day = new Date(2026, 9, 20)
  it('is cable-labels-YYYY-MM-DD.pdf, with the plan’s slug in a plan', () => {
    expect(labelsFileName(undefined, day)).toBe('cable-labels-2026-10-20.pdf')
    expect(labelsFileName('Expansion 2026!', day)).toBe(
      'cable-labels-plan-expansion-2026-2026-10-20.pdf',
    )
    expect(labelsFileName('תוכנית קיץ', day)).toBe(
      'cable-labels-plan-תוכנית-קיץ-2026-10-20.pdf',
    )
  })
})

describe('the PDF text layer', () => {
  const one = (id: string, label: string, a: string) => ({
    cableId: id,
    label,
    a: { equipmentName: a, label: '1' },
    b: { equipmentName: 'B', label: '2' },
  })

  it('has a header and one ASCII line per label, a page at a time', () => {
    const header = labelsHeader(3, 2, undefined, '2026-10-20')
    expect(header).toEqual({
      title: 'Cable labels',
      lines: ['3 labels - 2 pages', 'Installed - 2026-10-20'],
    })
    expect(labelsHeader(1, 1, 'Expansion', '2026-10-20').lines).toEqual([
      '1 label - 1 page',
      'Proposed: Expansion - 2026-10-20',
    ])
    const lines = labelTextLines([one('c1', 'No label', 'A')])
    expect(lines).toEqual(['c1 | No label | A 1 | B 2'])
  })

  it('writes what the font cannot draw as "?", so Hebrew is in the picture only', () => {
    expect(labelTextLines([one('c1', 'קומה', 'מתג')])).toEqual([
      'c1 | ???? | ??? 1 | B 2',
    ])
  })
})
