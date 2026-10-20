import { describe, expect, it } from 'vitest'
import type { Group, QueryResult } from './query'
import type { InventoryRow } from './rows'
import {
  MARGIN_ROWS,
  ROW_HEIGHT,
  barCommands,
  chosenValues,
  deleteBatch,
  disconnectBatch,
  groupSummary,
  manyCommands,
  showsAdd,
  type ManyCommand,
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

/** A row with the fields the new commands read. */
const made = (
  over: Partial<InventoryRow>,
  values: Record<string, string> = {},
): InventoryRow => ({
  ...row(0),
  values,
  ...over,
})

describe('INV-10 group counts', () => {
  const ports = [made({ cableId: 'c1' }), made({ cableId: 'c2' }), made({})]

  it('says "N used · M free" on Ports, counted over the rows listed', () => {
    expect(groupSummary('ports', ports)).toBe('2 used · 1 free')
    expect(groupSummary('ports', [])).toBe('0 used · 0 free')
  })

  it('says "N ports used · M free" on Equipment', () => {
    const eq = [
      made({}, { used: '3', free: '21' }),
      made({}, { used: '0', free: '24' }),
    ]
    expect(groupSummary('equipment', eq)).toBe('3 ports used · 45 free')
  })

  it('says "NU free" on Racks and nothing on the other lists', () => {
    const racks = [made({}, { free: '7' }), made({}, { free: '12' })]
    expect(groupSummary('racks', racks)).toBe('19U free')
    for (const list of ['cables', 'problems', 'work'] as const)
      expect(groupSummary(list, ports)).toBeUndefined()
  })

  it('puts the summary on each group row of the table', () => {
    const groups: Group[] = [
      { value: 'a', text: 'AGG-03', count: 2, rows: [ports[0], ports[2]] },
    ]
    const items = tableItems(
      result({ total: 2, groups }),
      'equipment',
      new Set(),
      'ports',
    )
    expect(items[0]).toMatchObject({
      kind: 'group',
      summary: '1 used · 1 free',
    })
    const plain = tableItems(
      result({ total: 2, groups }),
      'equipment',
      new Set(),
    )
    expect(plain[0]).not.toHaveProperty('summary')
  })
})

describe('INV-08 INV-09 INV-11 the command bar of the new lists', () => {
  const plan = { installed: false, canEdit: true }
  const ids = (cs: { id: string }[]) => cs.map((c) => c.id)

  it('Racks has Show in Physical only', () => {
    const rack = made({ rackId: 'rack-1', equipmentId: '' })
    expect(barCommands({ list: 'racks', ...plan }, rack)).toEqual([
      { id: 'phys', label: 'Show in Physical' },
    ])
    expect(barCommands({ list: 'racks', ...plan }, undefined)[0].disabled).toBe(
      'Select one row',
    )
  })

  it('Problems and the Work list have Open details and Show in Physical, and nothing that edits', () => {
    const row1 = made({ equipmentId: 'e1' })
    for (const list of ['problems', 'work'] as const) {
      const cs = barCommands({ list, ...plan }, row1)
      expect(cs.map((c) => [c.id, c.label, c.disabled])).toEqual([
        ['open', 'Open details', undefined],
        ['phys', 'Show in Physical', undefined],
      ])
    }
  })

  it('has nothing to open for a change with no equipment (a container)', () => {
    const [open, phys] = barCommands(
      { list: 'work', ...plan },
      made({ equipmentId: '' }), // no place either
    )
    expect(open.disabled).toBe('Nothing to open for this row')
    expect(phys.disabled).toBe('Nothing to open for this row')
  })

  it('turns off what a removed object cannot open, with the reason', () => {
    const gone = made({ equipmentId: 'e1', gone: true })
    for (const list of ['problems', 'work'] as const)
      for (const c of barCommands({ list, ...plan }, gone))
        expect(c.disabled).toBe('Removed in this plan: nothing to open')
    for (const item of menuCommands({ list: 'work', ...plan }, gone))
      expect(item.disabled).toBe('Removed in this plan: nothing to open')
  })

  it('opens the place of an added container', () => {
    const container = made({ equipmentId: '', place: { siteId: 's' } })
    for (const c of barCommands({ list: 'work', ...plan }, container))
      expect(c.disabled).toBeUndefined()
    for (const item of menuCommands({ list: 'work', ...plan }, container))
      expect(item.disabled).toBeUndefined()
  })

  it('offers Add in a plan on every list but Problems and the Work list', () => {
    expect(
      (
        ['equipment', 'ports', 'cables', 'racks', 'problems', 'work'] as const
      ).map(showsAdd),
    ).toEqual([true, true, true, true, false, false])
  })

  it('the ⋯ menu of the new lists', () => {
    const labels = (cs: { label: string }[]) => cs.map((c) => c.label)
    expect(
      labels(menuCommands({ list: 'racks', ...plan }, made({ rackId: 'r' }))),
    ).toEqual(['Show in Physical'])
    for (const list of ['problems', 'work'] as const)
      expect(
        labels(menuCommands({ list, ...plan }, made({ equipmentId: 'e' }))),
      ).toEqual(['Open details', 'Show in Physical'])
  })

  it('offers Connect… on a free port in a plan, not on a cabled one or in Installed', () => {
    const free = made({ equipmentId: 'e', endpointId: 'e:p1' })
    const cabled = made({ equipmentId: 'e', endpointId: 'e:p2', cableId: 'c' })
    expect(ids(menuCommands({ list: 'ports', ...plan }, free))).toContain(
      'connect',
    )
    expect(ids(menuCommands({ list: 'ports', ...plan }, cabled))).not.toContain(
      'connect',
    )
    expect(
      ids(
        menuCommands({ list: 'ports', installed: true, canEdit: false }, free),
      ),
    ).not.toContain('connect')
    expect(
      ids(menuCommands({ list: 'cables', ...plan }, cabled)),
    ).not.toContain('connect')
    const connect = menuCommands({ list: 'ports', ...plan }, free).find(
      (c) => c.id === 'connect',
    )
    expect(connect?.label).toBe('Connect…')
  })
})

describe('INV-12 INV-13 INV-15 the many-row commands', () => {
  const plan = { installed: false, canEdit: true }
  const installed = { installed: true, canEdit: false }
  const find = (cs: ManyCommand[], id: string) => cs.find((c) => c.id === id)
  const installedRow = made({
    proposed: false,
    equipmentId: 'a',
    cableId: 'c1',
  })
  const proposedRow = made({ proposed: true, equipmentId: 'b', cableId: 'c2' })

  it('Edit details… is for Equipment and Ports, on Installed and in a plan', () => {
    for (const list of ['equipment', 'ports'] as const) {
      expect(
        find(manyCommands({ list, ...installed }, [installedRow]), 'edit'),
      ).toEqual({
        id: 'edit',
        label: 'Edit details…',
      })
    }
    for (const list of ['cables', 'racks', 'problems', 'work'] as const)
      expect(
        find(manyCommands({ list, ...plan }, [installedRow]), 'edit'),
      ).toBeUndefined()
  })

  it('Edit details… says why it is off', () => {
    const edit = (ctx: object, rows: InventoryRow[]) =>
      find(
        manyCommands({ list: 'equipment', ...(ctx as typeof plan) }, rows),
        'edit',
      )!
    expect(edit(installed, []).disabled).toBe('Select rows to edit')
    const many = Array.from({ length: 501 }, () => installedRow)
    expect(edit(installed, many).disabled).toBe('Select at most 500 rows')
    expect(edit(plan, [proposedRow, installedRow]).disabled).toBe(
      'In a plan only what it adds is edited; installed details are fixed on Installed',
    )
    expect(edit(plan, [proposedRow]).disabled).toBeUndefined()
  })

  it('Delete N… is for Equipment in a plan, off when a proposed row is selected', () => {
    const del = (rows: InventoryRow[]) =>
      find(manyCommands({ list: 'equipment', ...plan }, rows), 'deleteMany')!
    expect(del([installedRow, installedRow])).toEqual({
      id: 'deleteMany',
      label: 'Delete 2…',
      danger: true,
    })
    expect(del([installedRow, proposedRow]).disabled).toBe(
      'Use Changes to undo a proposed item',
    )
    expect(del([]).disabled).toBe('Select rows')
    expect(del([]).label).toBe('Delete…')
    expect(
      find(
        manyCommands({ list: 'equipment', ...installed }, [installedRow]),
        'deleteMany',
      ),
    ).toBeUndefined()
    expect(
      find(
        manyCommands({ list: 'ports', ...plan }, [installedRow]),
        'deleteMany',
      ),
    ).toBeUndefined()
  })

  it('Disconnect N… counts the distinct cables, on Ports and Cables in a plan', () => {
    const two = made({ cableId: 'c1' })
    const free = made({})
    const dis = (list: 'ports' | 'cables', rows: InventoryRow[]) =>
      find(manyCommands({ list, ...plan }, rows), 'disconnectMany')!
    expect(dis('ports', [installedRow, two, proposedRow, free])).toEqual({
      id: 'disconnectMany',
      label: 'Disconnect 2…',
      danger: true,
    })
    expect(dis('ports', [free]).disabled).toBe('Select rows with a cable')
    expect(dis('cables', []).disabled).toBe('Select rows with a cable')
    expect(
      find(
        manyCommands({ list: 'ports', ...installed }, [installedRow]),
        'disconnectMany',
      ),
    ).toBeUndefined()
    expect(
      find(
        manyCommands({ list: 'equipment', ...plan }, [installedRow]),
        'disconnectMany',
      ),
    ).toBeUndefined()
    const over = Array.from({ length: 501 }, (_, i) =>
      made({ cableId: `c${i}` }),
    )
    expect(dis('cables', over).disabled).toBe('Select at most 500 rows')
  })

  it('Print labels… is for Cables and the Work list, always on', () => {
    for (const list of ['cables', 'work'] as const)
      expect(find(manyCommands({ list, ...installed }, []), 'labels')).toEqual({
        id: 'labels',
        label: 'Print labels…',
      })
    expect(
      find(manyCommands({ list: 'ports', ...plan }, []), 'labels'),
    ).toBeUndefined()
  })

  it('builds one batch of delete_equipment, one per equipment', () => {
    const a = made({ equipmentId: 'a' })
    const b = made({ equipmentId: 'b' })
    expect(deleteBatch([a, b, a])).toEqual({
      type: 'batch',
      batch: {
        commands: [
          { type: 'delete_equipment', target: { id: 'a' } },
          { type: 'delete_equipment', target: { id: 'b' } },
        ],
      },
    })
  })

  it('builds one batch of disconnect_cable, one per cable, skipping rows without one', () => {
    const rows = [
      made({ cableId: 'c1' }),
      made({}),
      made({ cableId: 'c2' }),
      made({ cableId: 'c1' }),
    ]
    expect(disconnectBatch(rows)).toEqual({
      type: 'batch',
      batch: {
        commands: [
          { type: 'disconnect_cable', target: { id: 'c1' } },
          { type: 'disconnect_cable', target: { id: 'c2' } },
        ],
      },
    })
  })
})
