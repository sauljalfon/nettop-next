import {
  COLUMNS,
  DEFAULT_HIDDEN,
  columnOf,
  defaultSort,
  sortable,
  type InventoryList,
} from './columns'
import type { Query } from './query'
import type { SavedView } from './savedViews'

/** One list's query plus its selected row keys. */
export interface ListState extends Query {
  selected: ReadonlySet<string>
}

export interface InventorySnapshot {
  list: InventoryList
  lists: Record<InventoryList, ListState>
  /** Hidden column keys per list: they stay when the list changes. */
  hidden: Record<InventoryList, ReadonlySet<string>>
}

/**
 * Session-only state of the inventory page: the current list, each list's
 * query and selection, and the hidden columns. It lives outside the Workspace
 * (like physicalSession), so switching view or Installed/Plan keeps it, and
 * nothing here is persisted. `getSnapshot` returns a new object on every
 * change, so it works as a store snapshot.
 */
export interface InventorySession {
  getSnapshot(): InventorySnapshot
  subscribe(listener: () => void): () => void
  /** Shows a list with that list's query reset to its defaults and the header's network. */
  setList(list: InventoryList): void
  /** The Ports list with only this equipment. */
  openPorts(equipmentName: string): void
  setSearch(search: string): void
  /** An empty array removes the pill. */
  setFilter(key: string, values: string[]): void
  /** Sets or clears the Network pill of the current list (D37). */
  setHeaderNetwork(id: string | undefined): void
  /** The single chosen network ID, undefined for none, 'many' for several. */
  networkOfPill(): string | undefined | 'many'
  /** The same key flips the direction; a new key sorts ascending. */
  sortBy(key: string): void
  setGroup(key: string | undefined): void
  toggleCollapsed(value: string): void
  setPage(page: number): void
  toggleSelected(key: string): void
  setSelected(keys: readonly string[], on: boolean): void
  /** How many selected keys of the current list are still among these rows. */
  selectedIn(rows: readonly { key: string }[]): number
  /** Clears the search and every pill, the network included. */
  resetFilters(): void
  /** The first column cannot be hidden. */
  toggleColumn(list: InventoryList, key: string): void
  /**
   * Installed or a plan is shown. The Work list is for a plan: when the
   * context becomes Installed a session on it falls back to Equipment.
   */
  setContext(context: 'installed' | 'planned'): void
  /** The current list's query and the list's hidden columns, as a view to save. */
  viewOf(name: string): SavedView
  /**
   * Shows the view: its list, query and hidden columns, and its Network pill as
   * the header's network (D37; read it with networkOfPill). A view of the Work
   * list cannot be opened in Installed.
   */
  openView(view: SavedView): { ok: true } | { ok: false; reason: string }
}

const LISTS = Object.keys(COLUMNS) as InventoryList[]

const perList = <T>(make: (list: InventoryList) => T) =>
  Object.fromEntries(
    LISTS.map((list) => [list, make(list)]),
  ) as unknown as Record<InventoryList, T>

const WORK_NEEDS_PLAN = 'Switch to a plan to open the Work list'

const fresh = (list: InventoryList): ListState => ({
  search: '',
  filters: {},
  sort: defaultSort(list),
  collapsed: new Set(),
  page: 1,
  selected: new Set(),
})

export function createInventorySession(): InventorySession {
  let state: InventorySnapshot = {
    list: 'equipment',
    lists: Object.fromEntries(
      LISTS.map((list) => [list, fresh(list)]),
    ) as Record<InventoryList, ListState>,
    hidden: perList((list) => new Set(DEFAULT_HIDDEN[list])),
  }
  let installed = false
  /** The header's network: a list shown afresh starts with it (D37). */
  let header: string | undefined
  const listeners = new Set<() => void>()
  const set = (next: InventorySnapshot) => {
    state = next
    for (const listener of listeners) listener()
  }
  /** Changes the current list's state. */
  const edit = (change: (q: ListState) => ListState) =>
    set({
      ...state,
      lists: { ...state.lists, [state.list]: change(state.lists[state.list]) },
    })
  /** A change to what is listed starts again at page 1. */
  const filtered = (q: ListState, filters: Record<string, string[]>) => ({
    ...q,
    filters,
    page: 1,
  })
  const withFilter = (q: ListState, key: string, values: string[]) => {
    const { [key]: _old, ...rest } = q.filters
    return filtered(q, values.length ? { ...rest, [key]: values } : rest)
  }
  const toggled = (set_: ReadonlySet<string>, value: string) => {
    const next = new Set(set_)
    if (!next.delete(value)) next.add(value)
    return next
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    setList(list) {
      if (list === 'work' && installed) return
      set({
        ...state,
        list,
        lists: {
          ...state.lists,
          [list]: {
            ...fresh(list),
            filters: header === undefined ? {} : { net: [header] },
          },
        },
      })
    },
    openPorts: (equipmentName) =>
      set({
        ...state,
        list: 'ports',
        lists: {
          ...state.lists,
          ports: { ...fresh('ports'), filters: { equipment: [equipmentName] } },
        },
      }),
    setSearch: (search) => edit((q) => ({ ...q, search, page: 1 })),
    setFilter: (key, values) => edit((q) => withFilter(q, key, values)),
    setHeaderNetwork(id) {
      header = id
      edit((q) => withFilter(q, 'net', id === undefined ? [] : [id]))
    },
    networkOfPill() {
      const net = state.lists[state.list].filters.net ?? []
      return net.length === 0 ? undefined : net.length === 1 ? net[0] : 'many'
    },
    sortBy: (key) => {
      if (!sortable(state.list, key)) return
      edit((q) => ({
        ...q,
        sort:
          q.sort.key === key
            ? { key, dir: q.sort.dir === 1 ? -1 : 1 }
            : { key, dir: 1 },
      }))
    },
    setGroup(group) {
      if (group !== undefined && !sortable(state.list, group)) return
      edit((q) => ({ ...q, group, page: 1 }))
    },
    toggleCollapsed: (value) =>
      edit((q) => ({ ...q, collapsed: toggled(q.collapsed, value) })),
    setPage: (page) => edit((q) => ({ ...q, page })),
    toggleSelected: (key) =>
      edit((q) => ({ ...q, selected: toggled(q.selected, key) })),
    setSelected: (keys, on) =>
      edit((q) => {
        const selected = new Set(q.selected)
        for (const k of keys)
          if (on) selected.add(k)
          else selected.delete(k)
        return { ...q, selected }
      }),
    selectedIn(rows) {
      const { selected } = state.lists[state.list]
      let n = 0
      for (const r of rows) if (selected.has(r.key)) n++
      return n
    },
    resetFilters: () => edit((q) => ({ ...filtered(q, {}), search: '' })),
    toggleColumn(list, key) {
      if (
        !LISTS.includes(list) ||
        !columnOf(list, key) ||
        columnOf(list, key)?.first
      )
        return
      const hidden = toggled(state.hidden[list], key)
      const q = state.lists[list]
      const hiding = hidden.has(key)
      set({
        ...state,
        hidden: { ...state.hidden, [list]: hidden },
        lists:
          hiding && (q.sort.key === key || q.group === key)
            ? {
                ...state.lists,
                [list]: {
                  ...q,
                  sort: q.sort.key === key ? defaultSort(list) : q.sort,
                  group: q.group === key ? undefined : q.group,
                },
              }
            : state.lists,
      })
    },
    setContext(context) {
      installed = context === 'installed'
      if (installed && state.list === 'work')
        set({ ...state, list: 'equipment' })
    },
    viewOf(name) {
      const q = state.lists[state.list]
      return {
        name: name.trim(),
        list: state.list,
        search: q.search,
        filters: Object.fromEntries(
          Object.entries(q.filters).map(([k, v]) => [k, [...v]]),
        ),
        sort: { ...q.sort },
        ...(q.group === undefined ? {} : { group: q.group }),
        hidden: [...state.hidden[state.list]],
      }
    },
    openView(view) {
      if (view.list === 'work' && installed)
        return { ok: false, reason: WORK_NEEDS_PLAN }
      const net = view.filters.net ?? []
      header = net.length === 1 ? net[0] : undefined
      set({
        ...state,
        list: view.list,
        lists: {
          ...state.lists,
          [view.list]: {
            ...fresh(view.list),
            search: view.search,
            filters: Object.fromEntries(
              Object.entries(view.filters).map(([k, v]) => [k, [...v]]),
            ),
            sort: { ...view.sort },
            group: view.group,
          },
        },
        hidden: { ...state.hidden, [view.list]: new Set(view.hidden) },
      })
      return { ok: true }
    },
  }
}

/** The one session store for the running app. */
export const inventorySession = createInventorySession()
