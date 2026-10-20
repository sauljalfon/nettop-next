import {
  GROUPS,
  PILLS,
  COLUMNS,
  columnOf,
  defaultSort,
  sortable,
  type InventoryList,
} from './columns'
import type { Sort } from './query'

/** A list with its search, pills, sort, group and hidden columns, under a name. */
export interface SavedView {
  name: string
  list: InventoryList
  search: string
  filters: Record<string, string[]>
  sort: Sort
  group?: string
  hidden: string[]
}

/** The one localStorage key the views live under. */
export const VIEWS_KEY = 'net-top-next.inventory-views'
const LISTS = Object.keys(COLUMNS) as InventoryList[]

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/** A stored entry of the right shape, else undefined. */
function parse(raw: unknown): SavedView | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const v = raw as Record<string, unknown>
  const sort = v.sort as Partial<Sort> | undefined
  const filters = v.filters as Record<string, unknown> | undefined
  if (
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    !LISTS.includes(v.list as InventoryList) ||
    typeof v.search !== 'string' ||
    !filters ||
    typeof filters !== 'object' ||
    !Object.values(filters).every(isStrings) ||
    typeof sort?.key !== 'string' ||
    (sort.dir !== 1 && sort.dir !== -1) ||
    !isStrings(v.hidden) ||
    (v.group !== undefined && typeof v.group !== 'string')
  )
    return undefined
  return {
    name: v.name,
    list: v.list as InventoryList,
    search: v.search,
    filters: filters as Record<string, string[]>,
    sort: { key: sort.key, dir: sort.dir },
    ...(v.group === undefined ? {} : { group: v.group }),
    hidden: v.hidden,
  }
}

export interface SavedViews {
  /** The views in the order saved; the same array until something changes. */
  list(): readonly SavedView[]
  /** Replaces a view of the same name. Returns why it could not save, if so. */
  save(view: SavedView): string | undefined
  remove(name: string): void
  subscribe(listener: () => void): () => void
}

/**
 * The views kept in this browser. Every storage read and write is guarded: when
 * the storage is blocked or full the views live for the session only.
 */
export function createSavedViews(
  getStorage: () => Storage = () => localStorage,
): SavedViews {
  let views: readonly SavedView[] = (() => {
    try {
      const data: unknown = JSON.parse(getStorage().getItem(VIEWS_KEY) ?? '[]')
      return Array.isArray(data)
        ? data.flatMap((x) => {
            const v = parse(x)
            return v ? [v] : []
          })
        : []
    } catch {
      return []
    }
  })()
  const listeners = new Set<() => void>()
  const set = (next: readonly SavedView[]) => {
    views = next
    try {
      getStorage().setItem(VIEWS_KEY, JSON.stringify(next))
    } catch {
      // Blocked or full: the views stay for this session.
    }
    for (const l of listeners) l()
  }
  return {
    list: () => views,
    save(view) {
      const name = view.name.trim()
      if (!name) return 'Name the view'
      const saved = { ...view, name }
      set(
        views.some((v) => v.name === name)
          ? views.map((v) => (v.name === name ? saved : v))
          : [...views, saved],
      )
      return undefined
    },
    remove: (name) => set(views.filter((v) => v.name !== name)),
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** The views of the running app. */
export const savedViews = createSavedViews()

/**
 * A view as it can be opened now: columns, pills, values, sort and group that
 * no longer exist are dropped (and named in `dropped`). `valuesOf` gives a
 * pill's current values for the view's list.
 */
export function resolveView(
  view: SavedView,
  valuesOf: (key: string) => readonly string[] | undefined,
): { view: SavedView; dropped: string[] } {
  const { list } = view
  const dropped: string[] = []
  const hidden = view.hidden.filter((key) => {
    const ok = !!columnOf(list, key) && !columnOf(list, key)?.first
    if (!ok) dropped.push(`column ${key}`)
    return ok
  })
  const pills = new Set(PILLS[list].map(([key]) => key))
  const filters: Record<string, string[]> = {}
  for (const [key, chosen] of Object.entries(view.filters)) {
    if (!pills.has(key)) {
      dropped.push(`filter ${key}`)
      continue
    }
    const known = new Set(valuesOf(key) ?? [])
    const kept = chosen.filter((v) => known.has(v))
    for (const v of chosen)
      if (!known.has(v)) dropped.push(`${key} ${v || '(empty)'}`)
    if (kept.length > 0) filters[key] = kept
  }
  const sortOk =
    !!columnOf(list, view.sort.key) && sortable(list, view.sort.key)
  if (!sortOk) dropped.push(`sort ${view.sort.key}`)
  const groupOk =
    view.group === undefined || GROUPS[list].some(([key]) => key === view.group)
  if (!groupOk) dropped.push(`group ${view.group}`)
  return {
    view: {
      ...view,
      filters,
      hidden,
      sort: sortOk ? view.sort : defaultSort(list),
      ...(groupOk ? {} : { group: undefined }),
    },
    dropped,
  }
}
