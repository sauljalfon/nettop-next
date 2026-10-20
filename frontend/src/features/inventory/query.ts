import {
  COLUMNS,
  columnOf,
  emptyText,
  sortable,
  type InventoryList,
} from './columns'
import type { InventoryRow } from './rows'

export const PAGE_SIZE = 50

export interface Sort {
  key: string
  dir: 1 | -1
}

export interface Query {
  search: string
  /** Column key to the chosen values; an empty array means all. */
  filters: Record<string, string[]>
  sort: Sort
  group?: string
  /** Collapsed group values: shown by the page, not used here. */
  collapsed: ReadonlySet<string>
  page: number
}

export interface Group {
  /** The raw value: the network ID, the status word, or the text. */
  value: string
  /** The group's name; the empty group says what empty means. */
  text: string
  count: number
  rows: InventoryRow[]
}

export interface QueryResult {
  /** Rows after the search and the pills, before paging. */
  total: number
  /** Every one of them, sorted: what the CSV writes. */
  all: InventoryRow[]
  /** The current page; empty when grouped. */
  rows: InventoryRow[]
  /** Set when grouped: all the rows, in groups. */
  groups?: Group[]
  page: number
  pages: number
}

const collator = new Intl.Collator(undefined, { numeric: true })

/** What a pill matches: the network ID or status word, else the text. */
const rawOf = (row: InventoryRow, key: string) =>
  row.raw[key] ?? row.values[key] ?? ''

/**
 * What a pill matches, as a list: a list-valued field (Missing, Fits) has its
 * several values, and an empty list matches the empty value.
 */
function matchValues(row: InventoryRow, key: string): readonly string[] {
  const list = row.lists?.[key]
  if (!list) return [rawOf(row, key)]
  return list.length === 0 ? [''] : list
}

export function applyQuery(
  rows: readonly InventoryRow[],
  list: InventoryList,
  query: Query,
): QueryResult {
  const columns = COLUMNS[list]
  const needle = query.search.trim().toLowerCase()
  const chosen = Object.entries(query.filters)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => [key, new Set(values)] as const)

  const kept = rows.filter((row) => {
    for (const [key, values] of chosen)
      if (!matchValues(row, key).some((v) => values.has(v))) return false
    if (!needle) return true
    return columns.some((c) =>
      (row.values[c.key] ?? '').toLowerCase().includes(needle),
    )
  })

  const { key, dir } = query.sort
  const numeric = !!columnOf(list, key)?.numeric
  const all = kept.sort((a, b) => {
    // A numeric column may keep its number apart from its text (a free block).
    const x = numeric
      ? (a.raw[key] ?? a.values[key] ?? '')
      : (a.values[key] ?? '')
    const y = numeric
      ? (b.raw[key] ?? b.values[key] ?? '')
      : (b.values[key] ?? '')
    const d = numeric ? Number(x) - Number(y) : collator.compare(x, y)
    return d * dir || a.i - b.i
  })

  if (query.group && sortable(list, query.group)) {
    const by = new Map<string, InventoryRow[]>()
    for (const row of all) {
      const v = rawOf(row, query.group)
      const g = by.get(v)
      if (g) g.push(row)
      else by.set(v, [row])
    }
    const groups = [...by].map(([value, members]): Group => ({
      value,
      text:
        value === ''
          ? emptyText(list, query.group!)
          : (members[0].values[query.group!] ?? value),
      count: members.length,
      rows: members,
    }))
    groups.sort(
      (a, b) =>
        Number(a.value === '') - Number(b.value === '') ||
        collator.compare(a.text, b.text),
    )
    return { total: all.length, all, rows: [], groups, page: 1, pages: 1 }
  }

  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, query.page))
  return {
    total: all.length,
    all,
    rows: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pages,
  }
}

/** A pill's distinct values with their text, sorted like the table, empty last. */
export function valueOptions(
  rows: readonly InventoryRow[],
  list: InventoryList,
  key: string,
): { value: string; text: string }[] {
  const seen = new Map<string, string>()
  for (const row of rows)
    for (const value of matchValues(row, key))
      if (!seen.has(value))
        seen.set(
          value,
          value === ''
            ? emptyText(list, key)
            : row.lists?.[key]
              ? value
              : (row.values[key] ?? value),
        )
  return [...seen]
    .map(([value, text]) => ({ value, text }))
    .sort(
      (a, b) =>
        Number(a.value === '') - Number(b.value === '') ||
        collator.compare(a.text, b.text),
    )
}
