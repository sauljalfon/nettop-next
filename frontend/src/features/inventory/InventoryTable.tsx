import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import Name from '../../shared/ui/Name'
import { OPENER } from '../planning/useInlineDialog'
import { colorOf } from '../map/networkColors'
import Cell from './Cell'
import type { Column, InventoryList } from './columns'
import type { TypeIconKind } from './icons'
import { ROW_HEIGHT, visibleRange, type TableItem } from './model'
import type { Sort } from './query'
import type { InventoryRow } from './rows'

const CHECK_WIDTH = 36
/** The last, narrow column of the ⋯ buttons: not one of the list's columns. */
const MORE_WIDTH = 44

interface Props {
  list: InventoryList
  columns: readonly Column[]
  items: readonly TableItem[]
  sort: Sort
  selected: ReadonlySet<string>
  /** Every row of the page (all rows when grouped) is selected. */
  allSelected: boolean
  /** Whether the group column is the network (its groups get a dot). */
  groupIsNetwork: boolean
  colors: ReadonlyMap<string, string>
  emptyMessage: React.ReactNode
  onSort: (key: string) => void
  onToggleRow: (key: string) => void
  onToggleAll: () => void
  onToggleGroup: (key: string) => void
  onOpen: (row: InventoryRow) => void
  /** The row whose ⋯ menu is open. */
  menuKey?: string
  onMenu: (row: InventoryRow, button: HTMLButtonElement) => void
  /** The table scrolled sideways or down: a menu anchored to a row would be left behind. */
  onScrolled: () => void
  /** How many rows are drawn now. */
  onShown: (rows: number) => void
}

const iconOf = (list: InventoryList, row: InventoryRow): TypeIconKind =>
  list === 'ports'
    ? 'port'
    : list === 'cables'
      ? 'cable'
      : ((row.values.kind ?? '').toLowerCase() as TypeIconKind)

/**
 * The table, windowed: only the rows in view (and a margin) are drawn, between
 * two spacer rows. It scrolls inside its own box, header and all.
 */
export default function InventoryTable(props: Props) {
  const { columns, items } = props
  const box = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const frame = useRef(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setHeight(el.clientHeight || 600)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  // A new list or page starts at the top.
  const first = items[0]
  const firstKey = first?.kind === 'row' ? first.row.key : first?.key
  useEffect(() => {
    if (box.current) box.current.scrollTop = 0
    setScrollTop(0)
  }, [props.list, firstKey])

  const { onScrolled } = props
  const onScroll = useCallback(() => {
    onScrolled()
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      setScrollTop(box.current?.scrollTop ?? 0)
    })
  }, [onScrolled])

  const { from, to } = visibleRange(items.length, scrollTop, height)
  const drawn = items.slice(from, to)
  const rowsDrawn = drawn.filter((i) => i.kind === 'row').length
  const { onShown } = props
  useEffect(() => onShown(rowsDrawn), [rowsDrawn, onShown])

  const span = columns.length + 2
  const width =
    CHECK_WIDTH + MORE_WIDTH + columns.reduce((n, c) => n + c.width, 0)
  const spacer = (count: number, key: string) =>
    count > 0 && (
      <tr aria-hidden="true" key={key} className="inv-spacer">
        <td colSpan={span} style={{ height: count * ROW_HEIGHT }} />
      </tr>
    )

  return (
    <div
      className="inv-scroll"
      ref={box}
      onScroll={onScroll}
      tabIndex={0}
      aria-label="Records"
      style={{ '--inv-row-h': `${ROW_HEIGHT}px` } as CSSProperties}
    >
      <table style={{ width }}>
        <colgroup>
          <col style={{ width: CHECK_WIDTH }} />
          {columns.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
          <col style={{ width: MORE_WIDTH }} />
        </colgroup>
        <thead>
          <tr>
            <th className="inv-check">
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={props.allSelected}
                onChange={props.onToggleAll}
              />
            </th>
            {columns.map((c) => {
              const active = props.sort.key === c.key
              return (
                <th
                  key={c.key}
                  aria-sort={
                    active
                      ? props.sort.dir === 1
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button onClick={() => props.onSort(c.key)}>
                    {c.label}
                    <span className="inv-sort" aria-hidden="true">
                      {active ? (props.sort.dir === 1 ? '↑' : '↓') : '↑↓'}
                    </span>
                  </button>
                </th>
              )
            })}
            <th className="inv-more">
              <span className="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={span} className="inv-empty">
                {props.emptyMessage}
              </td>
            </tr>
          ) : (
            <>
              {spacer(from, 'top')}
              {drawn.map((item) =>
                item.kind === 'group' ? (
                  <tr className="group-row" key={`g:${item.key}`}>
                    <td colSpan={span}>
                      <button
                        className="inv-group"
                        aria-expanded={!item.collapsed}
                        onClick={() => props.onToggleGroup(item.key)}
                      >
                        {item.collapsed ? (
                          <ChevronRight size={14} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={14} aria-hidden="true" />
                        )}
                        {props.groupIsNetwork && item.value && (
                          <i
                            className="dot"
                            style={{
                              background: colorOf(props.colors, item.value),
                            }}
                            aria-hidden="true"
                          />
                        )}
                        <Name text={item.text} />
                        <span className="n">
                          ({item.count.toLocaleString('en')})
                        </span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  <Row
                    key={item.row.key}
                    row={item.row}
                    {...props}
                    selectedRow={props.selected.has(item.row.key)}
                  />
                ),
              )}
              {spacer(items.length - to, 'bottom')}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  row,
  list,
  columns,
  colors,
  selectedRow,
  onToggleRow,
  onOpen,
  menuKey,
  onMenu,
}: Props & { row: InventoryRow; selectedRow: boolean }) {
  return (
    <tr className={selectedRow ? 'selected' : undefined}>
      <td className="inv-check">
        <input
          type="checkbox"
          aria-label={`Select ${row.values[columns[0].key]}`}
          checked={selectedRow}
          onChange={() => onToggleRow(row.key)}
        />
      </td>
      {columns.map((column) => (
        <td key={column.key}>
          <Cell
            row={row}
            column={column}
            icon={iconOf(list, row)}
            colors={colors}
            onOpen={onOpen}
          />
        </td>
      ))}
      <td className="inv-more">
        <button
          className="inv-more-btn"
          aria-haspopup="menu"
          aria-expanded={menuKey === row.key}
          aria-label={`More actions for ${row.values[columns[0].key]}`}
          {...{ [OPENER]: `row-menu:${row.key}` }}
          onClick={(event) => onMenu(row, event.currentTarget)}
        >
          ⋯
        </button>
      </td>
    </tr>
  )
}
