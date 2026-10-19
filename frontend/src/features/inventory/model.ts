import type { InventoryList } from './columns'
import { PAGE_SIZE, type QueryResult } from './query'
import type { InventoryRow } from './rows'

/** One row of the table is 34 px tall: the CSS and the window both read this. */
export const ROW_HEIGHT = 34
/** Rows drawn beyond the visible ones, above and below. */
export const MARGIN_ROWS = 8

export type TableItem =
  | { kind: 'row'; row: InventoryRow }
  | {
      kind: 'group'
      key: string
      value: string
      text: string
      count: number
      collapsed: boolean
    }

/** The key under which a folded group is remembered. */
export const groupKey = (group: string, value: string) => `${group}:${value}`

/** What the table lists: the page, or every group with its rows unless folded. */
export function tableItems(
  result: QueryResult,
  group: string | undefined,
  collapsed: ReadonlySet<string>,
): TableItem[] {
  if (!result.groups || !group)
    return result.rows.map((row) => ({ kind: 'row', row }))
  const items: TableItem[] = []
  for (const g of result.groups) {
    const key = groupKey(group, g.value)
    const folded = collapsed.has(key)
    items.push({
      kind: 'group',
      key,
      value: g.value,
      text: g.text,
      count: g.count,
      collapsed: folded,
    })
    if (!folded) for (const row of g.rows) items.push({ kind: 'row', row })
  }
  return items
}

/** The items to draw for a scroll position: those in view and a margin. */
export function visibleRange(
  count: number,
  scrollTop: number,
  viewportHeight: number,
): { from: number; to: number } {
  const first = Math.min(
    Math.floor(scrollTop / ROW_HEIGHT),
    Math.max(0, count - 1),
  )
  const from = Math.max(0, Math.min(count, first - MARGIN_ROWS))
  const to = Math.min(
    count,
    first + Math.ceil(viewportHeight / ROW_HEIGHT) + MARGIN_ROWS,
  )
  return { from: Math.min(from, to), to }
}

const number = (n: number) => n.toLocaleString('en')

/** "Showing A to B of N records." (the meta line, without the selection count). */
export function metaText(result: QueryResult): string {
  if (result.total === 0) return 'No records.'
  if (result.groups)
    return `Showing 1 to ${number(result.total)} of ${number(result.total)} records.`
  const start = (result.page - 1) * PAGE_SIZE
  return `Showing ${number(start + 1)} to ${number(start + result.rows.length)} of ${number(result.total)} records.`
}

/** The values a picker applies: none or all of them is no filter. */
export const chosenValues = (picked: string[], optionCount: number) =>
  picked.length === 0 || picked.length === optionCount ? [] : picked

/** What the Network pill asks of the header (D37): one or none is followed; several are not. */
export function networkChange(
  values: readonly string[],
): { call: true; id: string | undefined } | { call: false } {
  if (values.length === 0) return { call: true, id: undefined }
  if (values.length === 1) return { call: true, id: values[0] }
  return { call: false }
}

/** The pill's value text: all, the one value's text, or how many. */
export function pillText(
  values: readonly string[],
  options: readonly { value: string; text: string }[],
): string {
  if (values.length === 0) return 'all'
  if (values.length > 1) return `${values.length} selected`
  return options.find((o) => o.value === values[0])?.text ?? values[0]
}

export type RowCommandId =
  'open' | 'focus' | 'phys' | 'ports' | 'editport' | 'delete' | 'disconnect'

/** Where the page is: the list, Installed or a plan, and whether the plan can be edited. */
export interface CommandContext {
  list: InventoryList
  installed: boolean
  canEdit: boolean
}

type CommandRow = Pick<InventoryRow, 'proposed' | 'cableId'>

export interface BarCommand {
  id: RowCommandId
  label: string
  danger?: boolean
  /** Why it is off; this is also the button's title. */
  disabled?: string
}

/**
 * The command bar's one-row commands. They act on `row`, the one selected row
 * that is still listed (none when zero or several are selected).
 */
export function barCommands(
  ctx: CommandContext,
  row: CommandRow | undefined,
): BarCommand[] {
  const none = row ? undefined : 'Select one row'
  const commands: BarCommand[] = [
    { id: 'open', label: 'Open details', disabled: none },
    { id: 'focus', label: 'Show on map', disabled: none },
    { id: 'phys', label: 'Show in Physical', disabled: none },
  ]
  if (ctx.canEdit && ctx.list === 'equipment')
    commands.push({
      id: 'delete',
      label: 'Delete…',
      danger: true,
      disabled:
        none ??
        (row?.proposed ? 'Use Changes to undo a proposed item' : undefined),
    })
  if (ctx.canEdit && ctx.list !== 'equipment')
    commands.push({
      id: 'disconnect',
      label: 'Disconnect…',
      danger: true,
      disabled: none ?? (row?.cableId ? undefined : 'Select one connected row'),
    })
  return commands
}

export interface MenuCommand {
  id: RowCommandId
  label: string
  danger?: boolean
  separatorBefore?: boolean
}

/** The ⋯ menu of one row. */
export function menuCommands(
  ctx: CommandContext,
  row: CommandRow,
): MenuCommand[] {
  if (ctx.list === 'equipment') {
    const items: MenuCommand[] = [
      { id: 'open', label: 'Open details' },
      { id: 'focus', label: 'Show on map' },
      { id: 'phys', label: 'Show in Physical' },
      { id: 'ports', label: 'View its ports' },
    ]
    if (ctx.canEdit && !row.proposed)
      items.push({
        id: 'delete',
        label: 'Delete…',
        danger: true,
        separatorBefore: true,
      })
    return items
  }
  const items: MenuCommand[] = [
    {
      id: 'phys',
      label:
        ctx.list === 'ports' ? 'Show in Physical' : 'Show A end in Physical',
    },
    { id: 'open', label: 'Open equipment details' },
    { id: 'focus', label: 'Show equipment on map' },
  ]
  if (ctx.list === 'ports' && ctx.installed)
    items.push({ id: 'editport', label: 'Edit port details' })
  if (ctx.canEdit && row.cableId)
    items.push({
      id: 'disconnect',
      label: 'Disconnect…',
      danger: true,
      separatorBefore: true,
    })
  return items
}
