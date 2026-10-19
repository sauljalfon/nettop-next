import { describe, expect, it } from 'vitest'
import type { Group, QueryResult } from './query'
import type { InventoryRow } from './rows'
import {
  MARGIN_ROWS,
  ROW_HEIGHT,
  barCommands,
  chosenValues,
  groupKey,
  menuCommands,
  metaText,
  networkChange,
  pillText,
  tableItems,
  visibleRange,
} from './model'

const row = (i: number): InventoryRow => ({
  key: `r${i}`,
  equipmentId: `r${i}`,
  proposed: false,
  i,
  values: {},
  raw: {},
  pieces: {},
})
const result = (over: Partial<QueryResult>): QueryResult => ({
  total: 0,
  all: [],
  rows: [],
  page: 1,
  pages: 1,
  ...over,
})

describe('metaText', () => {
  it('says there are no records', () => {
    expect(metaText(result({}))).toBe('No records.')
  })

  it('counts the page', () => {
    expect(
      metaText(result({ total: 120, rows: [row(1)], page: 2, pages: 3 })),
    ).toBe('Showing 51 to 51 of 120 records.')
    const rows = Array.from({ length: 20 }, (_, i) => row(i))
    expect(metaText(result({ total: 120, rows, page: 3, pages: 3 }))).toBe(
      'Showing 101 to 120 of 120 records.',
    )
  })

  it('counts every record when grouped, with thousands separated', () => {
    const groups: Group[] = [{ value: 'a', text: 'a', count: 1500, rows: [] }]
    expect(metaText(result({ total: 1500, groups }))).toBe(
      'Showing 1 to 1,500 of 1,500 records.',
    )
  })
})

describe('tableItems', () => {
  it('lists the page rows when not grouped', () => {
    const rows = [row(0), row(1)]
    expect(tableItems(result({ rows }), undefined, new Set())).toEqual([
      { kind: 'row', row: rows[0] },
      { kind: 'row', row: rows[1] },
    ])
  })

  it('puts a group row before its rows, and none of its rows when folded', () => {
    const groups: Group[] = [
      { value: 'A', text: 'Network A', count: 2, rows: [row(0), row(1)] },
      { value: '', text: 'No network', count: 1, rows: [row(2)] },
    ]
    const r = result({ total: 3, groups })
    const items = tableItems(r, 'net', new Set([groupKey('net', '')]))
    expect(
      items.map((i) =>
        i.kind === 'group'
          ? `g:${i.text}:${i.count}:${i.collapsed}`
          : i.row.key,
      ),
    ).toEqual(['g:Network A:2:false', 'r0', 'r1', 'g:No network:1:true'])
  })
})

describe('visibleRange', () => {
  it('shows the rows in view plus a margin', () => {
    const r = visibleRange(1000, 34 * 100, 340)
    expect(r.from).toBe(100 - MARGIN_ROWS)
    expect(r.to).toBe(100 + 10 + MARGIN_ROWS)
  })

  it('clamps to the list', () => {
    expect(visibleRange(10, 0, 3400)).toEqual({ from: 0, to: 10 })
    expect(visibleRange(0, 0, 340)).toEqual({ from: 0, to: 0 })
    expect(visibleRange(100, 99999, 340).to).toBe(100)
    expect(visibleRange(100, 99999, 340).from).toBeLessThan(100)
  })

  it('uses 34 px rows', () => {
    expect(ROW_HEIGHT).toBe(34)
  })
})

describe('chosenValues', () => {
  it('clears the pill for none or all values', () => {
    expect(chosenValues([], 3)).toEqual([])
    expect(chosenValues(['a', 'b', 'c'], 3)).toEqual([])
    expect(chosenValues(['a', 'b'], 3)).toEqual(['a', 'b'])
  })
})

describe('networkChange (D37)', () => {
  it('follows one network, none, and leaves several to the page', () => {
    expect(networkChange(['A'])).toEqual({ call: true, id: 'A' })
    expect(networkChange([])).toEqual({ call: true, id: undefined })
    expect(networkChange(['A', 'B'])).toEqual({ call: false })
  })
})

describe('pillText', () => {
  const options = [
    { value: 'A', text: 'Network A' },
    { value: '', text: 'No network' },
  ]
  it('says all, the one value, or how many', () => {
    expect(pillText([], options)).toBe('all')
    expect(pillText(['A'], options)).toBe('Network A')
    expect(pillText([''], options)).toBe('No network')
    expect(pillText(['A', ''], options)).toBe('2 selected')
  })
})

describe('barCommands', () => {
  const installed = { installed: true, canEdit: false }
  const plan = { installed: false, canEdit: true }
  const ids = (cs: { id: string }[]) => cs.map((c) => c.id)
  const cabled = { proposed: false, cableId: 'L1' }
  const free = { proposed: false }

  it('offers only the three views in Installed, and nothing that edits', () => {
    for (const list of ['equipment', 'ports', 'cables'] as const)
      expect(ids(barCommands({ list, ...installed }, cabled))).toEqual([
        'open',
        'focus',
        'phys',
      ])
  })

  it('adds Delete… on Equipment and Disconnect… on Ports and Cables in a plan', () => {
    expect(ids(barCommands({ list: 'equipment', ...plan }, free))).toEqual([
      'open',
      'focus',
      'phys',
      'delete',
    ])
    for (const list of ['ports', 'cables'] as const)
      expect(ids(barCommands({ list, ...plan }, cabled))).toEqual([
        'open',
        'focus',
        'phys',
        'disconnect',
      ])
  })

  it('disables everything with the title "Select one row" when no row is chosen', () => {
    for (const c of barCommands({ list: 'equipment', ...plan }, undefined))
      expect(c.disabled).toBe('Select one row')
    for (const c of barCommands({ list: 'ports', ...plan }, undefined))
      expect(c.disabled).toBe('Select one row')
  })

  it('enables the views for a chosen row', () => {
    const [open, focus, phys] = barCommands(
      { list: 'ports', ...installed },
      free,
    )
    expect([open.disabled, focus.disabled, phys.disabled]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('disables Delete… for a proposed row, with the reason', () => {
    const del = barCommands(
      { list: 'equipment', ...plan },
      { proposed: true },
    ).find((c) => c.id === 'delete')
    expect(del?.disabled).toBe('Use Changes to undo a proposed item')
    expect(del?.danger).toBe(true)
    const ok = barCommands({ list: 'equipment', ...plan }, free).find(
      (c) => c.id === 'delete',
    )
    expect(ok?.disabled).toBeUndefined()
  })

  it('disables Disconnect… for a row without a cable', () => {
    const find = (row: { proposed: boolean; cableId?: string }) =>
      barCommands({ list: 'ports', ...plan }, row).find(
        (c) => c.id === 'disconnect',
      )
    expect(find(free)?.disabled).toBe('Select one connected row')
    expect(find(cabled)?.disabled).toBeUndefined()
    expect(find({ proposed: true, cableId: 'L9' })?.disabled).toBeUndefined()
  })
})

describe('menuCommands', () => {
  const installed = { installed: true, canEdit: false }
  const plan = { installed: false, canEdit: true }
  const labels = (cs: { label: string }[]) => cs.map((c) => c.label)
  const cabled = { proposed: false, cableId: 'L1' }

  it('lists the Equipment items, with Delete… after a separator in a plan', () => {
    expect(
      labels(menuCommands({ list: 'equipment', ...installed }, cabled)),
    ).toEqual([
      'Open details',
      'Show on map',
      'Show in Physical',
      'View its ports',
    ])
    const inPlan = menuCommands({ list: 'equipment', ...plan }, cabled)
    expect(labels(inPlan).at(-1)).toBe('Delete…')
    expect(inPlan.at(-1)).toMatchObject({ separatorBefore: true, danger: true })
  })

  it('leaves Delete… off a proposed equipment row', () => {
    expect(
      labels(menuCommands({ list: 'equipment', ...plan }, { proposed: true })),
    ).not.toContain('Delete…')
  })

  it('lists the Ports items; Edit port details is for Installed only', () => {
    expect(
      labels(menuCommands({ list: 'ports', ...installed }, cabled)),
    ).toEqual([
      'Show in Physical',
      'Open equipment details',
      'Show equipment on map',
      'Edit port details',
    ])
    expect(labels(menuCommands({ list: 'ports', ...plan }, cabled))).toEqual([
      'Show in Physical',
      'Open equipment details',
      'Show equipment on map',
      'Disconnect…',
    ])
  })

  it('words the Cables item for its A end, and offers Disconnect… only with a cable', () => {
    expect(
      labels(menuCommands({ list: 'cables', ...installed }, cabled)),
    ).toEqual([
      'Show A end in Physical',
      'Open equipment details',
      'Show equipment on map',
    ])
    expect(
      labels(menuCommands({ list: 'ports', ...plan }, { proposed: false })),
    ).not.toContain('Disconnect…')
  })
})
