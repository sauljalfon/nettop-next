import type { Column, InventoryList } from './columns'
import type { InventoryRow } from './rows'

const cell = (v: string) =>
  /["\r\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

/**
 * The CSV of the rows as given (never grouped) in the columns as given. The
 * leading byte order mark makes Excel read the UTF-8 (Hebrew) correctly.
 */
export function toCsv(
  rows: readonly InventoryRow[],
  columns: readonly Column[],
): string {
  const lines = [
    columns.map((c) => cell(c.label)).join(','),
    ...rows.map((r) =>
      columns.map((c) => cell(r.values[c.key] ?? '')).join(','),
    ),
  ]
  return '\uFEFF' + lines.join('\r\n')
}

const two = (n: number) => String(n).padStart(2, '0')

/** A plan's name as it goes into a file name (Hebrew letters stay). */
export const fileSlug = (planName: string) =>
  planName
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** The date as YYYY-MM-DD, in local time. */
export const fileDay = (date: Date) =>
  `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`

export function csvFileName(
  list: InventoryList,
  planName: string | undefined,
  date: Date,
): string {
  return `inventory-${list}${planName === undefined ? '' : `-plan-${fileSlug(planName)}`}-${fileDay(date)}.csv`
}
