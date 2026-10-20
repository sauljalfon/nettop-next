import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { applyQuery, valueOptions, type Query } from './query'
import { buildRows, type InventoryRow } from './rows'

const snapshot = acceptanceSnapshot()
const ids = new Set(snapshot.equipment.map((e) => e.id))
const linkIds = new Set(snapshot.links.map((l) => l.id))
const rows = buildRows(snapshot, indexSnapshot(snapshot), ids, linkIds)

const query = (over: Partial<Query> = {}): Query => ({
  search: '',
  filters: {},
  sort: { key: 'name', dir: 1 },
  collapsed: new Set(),
  page: 1,
  ...over,
})
const keys = (r: { key: string }[]) => r.map((x) => x.key)

/** A hand-made equipment row, so sorting does not depend on the fixture. */
const row = (
  i: number,
  values: Record<string, string>,
  raw: Record<string, string> = {},
): InventoryRow => ({
  key: `r${i}`,
  equipmentId: `r${i}`,
  proposed: false,
  i,
  values,
  raw,
  pieces: {},
})

describe('applyQuery filters', () => {
  it('keeps every row for no filter and for an empty set', () => {
    expect(applyQuery(rows.equipment, 'equipment', query()).total).toBe(
      rows.equipment.length,
    )
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({ filters: { kind: [] } }),
    )
    expect(r.total).toBe(rows.equipment.length)
  })

  it('matches a pill on the raw network ID, not its name', () => {
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({ filters: { net: ['B'] } }),
    )
    expect(keys(r.rows).sort()).toEqual(['AGG-12', 'EDGE-22'])
  })

  it('matches an empty value (no network)', () => {
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({ filters: { net: [''] } }),
    )
    expect(keys(r.rows).sort()).toEqual([
      'HDF-01',
      'HDF-02',
      'PANEL-A',
      'PANEL-DR',
    ])
  })

  it('matches several values of one pill and all pills together', () => {
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({ filters: { role: ['Access', 'Backbone'], net: ['A'] } }),
    )
    expect(keys(r.rows).sort()).toEqual(['BB-01', 'EDGE-17'])
  })

  it('matches a text pill on the text (ports of one equipment)', () => {
    const r = applyQuery(
      rows.ports,
      'ports',
      query({
        sort: { key: 'equipment', dir: 1 },
        filters: { equipment: ['EDGE-17'] },
      }),
    )
    expect(r.total).toBe(24)
  })

  it('matches a status pill on the status word', () => {
    const a = [
      row(0, { status: 'Active' }, { status: 'active' }),
      row(1, { status: '' }, { status: '' }),
    ]
    expect(
      keys(
        applyQuery(a, 'equipment', query({ filters: { status: ['active'] } }))
          .rows,
      ),
    ).toEqual(['r0'])
    expect(
      keys(
        applyQuery(a, 'equipment', query({ filters: { status: [''] } })).rows,
      ),
    ).toEqual(['r1'])
  })
})

describe('applyQuery search', () => {
  it('is case-insensitive "contains"', () => {
    const r = applyQuery(rows.equipment, 'equipment', query({ search: 'agg-' }))
    expect(keys(r.rows)).toEqual(['AGG-03', 'AGG-08', 'AGG-12', 'AGG-15'])
  })

  it('reads hidden columns too', () => {
    // The IP column is hidden by default; the search still finds it.
    const a = [
      row(0, { name: 'one', ip: '10.1.2.3' }),
      row(1, { name: 'two', ip: '' }),
    ]
    expect(
      keys(applyQuery(a, 'equipment', query({ search: '10.1.2' })).rows),
    ).toEqual(['r0'])
  })

  it('finds a network by its name and a Hebrew name', () => {
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({ search: 'network b' }),
    )
    expect(keys(r.rows).sort()).toEqual(['AGG-12', 'EDGE-22'])
    const h = [row(0, { name: 'מתג-17' }), row(1, { name: 'x' })]
    expect(
      keys(applyQuery(h, 'equipment', query({ search: 'מתג' })).rows),
    ).toEqual(['r0'])
  })

  it('combines with the pills', () => {
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({ search: 'agg', filters: { net: ['B'] } }),
    )
    expect(keys(r.rows)).toEqual(['AGG-12'])
  })
})

describe('applyQuery sort', () => {
  it('sorts numerically in text, not alphabetically', () => {
    const a = ['AGG-10', 'AGG-9', 'AGG-1'].map((n, i) => row(i, { name: n }))
    expect(
      applyQuery(a, 'equipment', query()).rows.map((r) => r.values.name),
    ).toEqual(['AGG-1', 'AGG-9', 'AGG-10'])
  })

  it('compares the U column as a number', () => {
    const a = ['10', '9', '100', '2'].map((u, i) =>
      row(i, { name: 'x', unit: u }),
    )
    const r = applyQuery(
      a,
      'equipment',
      query({ sort: { key: 'unit', dir: 1 } }),
    )
    expect(r.rows.map((x) => x.values.unit)).toEqual(['2', '9', '10', '100'])
  })

  it('breaks ties by the natural index, in both directions', () => {
    const a = [
      row(0, { name: 'b', role: 'Access' }),
      row(1, { name: 'a', role: 'Access' }),
      row(2, { name: 'c', role: 'Backbone' }),
    ]
    const up = applyQuery(
      a,
      'equipment',
      query({ sort: { key: 'role', dir: 1 } }),
    )
    expect(keys(up.rows)).toEqual(['r0', 'r1', 'r2'])
    const down = applyQuery(
      a,
      'equipment',
      query({ sort: { key: 'role', dir: -1 } }),
    )
    expect(keys(down.rows)).toEqual(['r2', 'r0', 'r1'])
  })

  it('flips the order with dir -1', () => {
    const up = applyQuery(rows.equipment, 'equipment', query())
    const down = applyQuery(
      rows.equipment,
      'equipment',
      query({ sort: { key: 'name', dir: -1 } }),
    )
    expect(keys(down.rows)).toEqual(keys(up.rows).reverse())
  })

  it('does not change the rows it is given', () => {
    const before = keys(rows.equipment)
    applyQuery(
      rows.equipment,
      'equipment',
      query({ sort: { key: 'role', dir: -1 } }),
    )
    expect(keys(rows.equipment)).toEqual(before)
  })
})

describe('applyQuery groups', () => {
  const grouped = applyQuery(
    rows.equipment,
    'equipment',
    query({ group: 'net' }),
  )

  it('returns groups with counts and all their rows, no page', () => {
    expect(grouped.total).toBe(rows.equipment.length)
    expect(grouped.rows).toEqual([])
    expect(grouped.pages).toBe(1)
    expect(grouped.groups!.map((g) => [g.text, g.count])).toEqual([
      ['Network A', 5],
      ['Network B', 2],
      ['No network', 4],
    ])
    expect(grouped.groups![0].value).toBe('A')
    expect(grouped.groups![2].value).toBe('')
    for (const g of grouped.groups!) expect(g.rows).toHaveLength(g.count)
  })

  it('orders groups by text with the empty group last', () => {
    const a = [
      row(0, { name: 'a', role: '' }),
      row(1, { name: 'b', role: 'Zeta' }),
      row(2, { name: 'c', role: 'Alpha' }),
    ]
    const r = applyQuery(a, 'equipment', query({ group: 'role' }))
    expect(r.groups!.map((g) => g.text)).toEqual(['Alpha', 'Zeta', '(empty)'])
  })

  it('keeps the sort inside a group and reads the collapsed set as data only', () => {
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({
        group: 'net',
        sort: { key: 'name', dir: -1 },
        collapsed: new Set(['A']),
      }),
    )
    const a = r.groups!.find((g) => g.value === 'A')!
    expect(a.rows.map((x) => x.key)).toEqual([
      'EDGE-17',
      'BB-01',
      'AGG-15',
      'AGG-08',
      'AGG-03',
    ])
    expect(a.count).toBe(5)
  })

  it('groups only the filtered rows', () => {
    const r = applyQuery(
      rows.equipment,
      'equipment',
      query({ group: 'net', search: 'agg' }),
    )
    expect(r.total).toBe(4)
    expect(r.groups!.map((g) => [g.value, g.count])).toEqual([
      ['A', 3],
      ['B', 1],
    ])
  })
})

describe('applyQuery paging', () => {
  const many = Array.from({ length: 120 }, (_, i) =>
    row(i, { name: `n${String(i).padStart(3, '0')}` }),
  )

  it('shows 50 rows a page', () => {
    const r = applyQuery(many, 'equipment', query())
    expect(r.total).toBe(120)
    expect(r.pages).toBe(3)
    expect(r.page).toBe(1)
    expect(r.rows).toHaveLength(50)
    const last = applyQuery(many, 'equipment', query({ page: 3 }))
    expect(last.rows).toHaveLength(20)
    expect(last.rows[0].values.name).toBe('n100')
  })

  it('clamps the page to 1..pages', () => {
    expect(applyQuery(many, 'equipment', query({ page: 9 })).page).toBe(3)
    expect(applyQuery(many, 'equipment', query({ page: 0 })).page).toBe(1)
    const few = applyQuery(many, 'equipment', query({ page: 3, search: 'n01' }))
    expect(few.total).toBe(10)
    expect(few.page).toBe(1)
    expect(few.rows).toHaveLength(10)
  })

  it('has one empty page for no rows', () => {
    const r = applyQuery(many, 'equipment', query({ search: 'zzz' }))
    expect(r).toMatchObject({ total: 0, page: 1, pages: 1, rows: [] })
  })

  it('lists every filtered record, for the CSV', () => {
    expect(applyQuery(many, 'equipment', query()).all).toHaveLength(120)
  })
})

describe('valueOptions', () => {
  it('gives each distinct value once, sorted by text, empty last', () => {
    expect(valueOptions(rows.equipment, 'equipment', 'net')).toEqual([
      { value: 'A', text: 'Network A' },
      { value: 'B', text: 'Network B' },
      { value: '', text: 'No network' },
    ])
  })

  it('sorts numbers in text numerically and names the empty value', () => {
    const a = ['Rack 10', 'Rack 2', '', 'Rack 2'].map((n, i) =>
      row(i, { rack: n }),
    )
    expect(valueOptions(a, 'equipment', 'rack')).toEqual([
      { value: 'Rack 2', text: 'Rack 2' },
      { value: 'Rack 10', text: 'Rack 10' },
      { value: '', text: '(empty)' },
    ])
  })

  it('offers the status words', () => {
    const a = [
      row(0, { status: 'Maintenance' }, { status: 'maintenance' }),
      row(1, { status: '' }, { status: '' }),
      row(2, { status: 'Active' }, { status: 'active' }),
    ]
    expect(valueOptions(a, 'equipment', 'status')).toEqual([
      { value: 'active', text: 'Active' },
      { value: 'maintenance', text: 'Maintenance' },
      { value: '', text: 'Not set' },
    ])
  })
})

describe('INV-12 list-valued fields (Missing, Fits)', () => {
  const listed = (i: number, values: string[]): InventoryRow => ({
    ...row(i, { name: `E${i}`, missing: values.join(', ') }),
    lists: { missing: values },
  })
  const data = [
    listed(1, ['Model', 'Serial number']),
    listed(2, ['Model']),
    listed(3, []),
    listed(4, ['IP address']),
  ]
  const run = (filters: Record<string, string[]>, search = '') =>
    keys(applyQuery(data, 'equipment', query({ filters, search })).all)

  it('keeps a row when any of its values is chosen', () => {
    expect(run({ missing: ['Model'] })).toEqual(['r1', 'r2'])
    expect(run({ missing: ['Serial number', 'IP address'] })).toEqual([
      'r1',
      'r4',
    ])
  })

  it('matches an empty list with the empty value (Nothing missing)', () => {
    expect(run({ missing: [''] })).toEqual(['r3'])
    expect(run({ missing: ['', 'IP address'] })).toEqual(['r3', 'r4'])
  })

  it('searches the values joined with ", "', () => {
    expect(run({}, 'model, serial')).toEqual(['r1'])
    expect(run({}, 'ip addr')).toEqual(['r4'])
  })

  it('offers each distinct value once, and Nothing missing for an empty list', () => {
    expect(valueOptions(data, 'equipment', 'missing')).toEqual([
      { value: 'IP address', text: 'IP address' },
      { value: 'Model', text: 'Model' },
      { value: 'Serial number', text: 'Serial number' },
      { value: '', text: 'Nothing missing' },
    ])
  })

  it('offers Full for a rack that fits nothing', () => {
    const rack = (i: number, fits: string[]): InventoryRow => ({
      ...row(i, { rack: `R${i}`, fits: fits.join(', ') }),
      lists: { fits },
    })
    const racks = [rack(1, ['1U', '2U']), rack(2, [])]
    expect(valueOptions(racks, 'racks', 'fits')).toEqual([
      { value: '1U', text: '1U' },
      { value: '2U', text: '2U' },
      { value: '', text: 'Full' },
    ])
    expect(
      keys(
        applyQuery(
          racks,
          'racks',
          query({ filters: { fits: [''] }, sort: { key: 'rack', dir: 1 } }),
        ).all,
      ),
    ).toEqual(['r2'])
  })

  it('does not group by a list-valued field', () => {
    const r = applyQuery(data, 'equipment', query({ group: 'missing' }))
    expect(r.groups).toBeUndefined()
    expect(r.rows).toHaveLength(4)
  })
})

describe('numeric sorting from the raw value', () => {
  it('sorts the largest free block by its size, not its text', () => {
    const rack = (i: number, gap: string, size: string) => ({
      ...row(i, { rack: `R${i}`, gap }, { gap: size }),
    })
    const data = [
      rack(1, 'U1–U3 (3U)', '3'),
      rack(2, 'U20–U40 (21U)', '21'),
      rack(3, 'Full', '0'),
      rack(4, 'U9–U10 (2U)', '2'),
    ]
    const r = applyQuery(data, 'racks', query({ sort: { key: 'gap', dir: 1 } }))
    expect(keys(r.all)).toEqual(['r3', 'r4', 'r1', 'r2'])
  })
})
