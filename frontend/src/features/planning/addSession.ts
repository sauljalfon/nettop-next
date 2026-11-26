import { useSyncExternalStore } from 'react'
import type { NewItem } from './boxModel'

/**
 * The library's session-only state (D51): the entry picked by a click (waiting
 * for a free unit), the open box (the item, the rack and the unit it was
 * opened at) and what the last panel and HDF were, so the box starts there.
 * Outside the Workspace like `physicalSession`; nothing is persisted.
 */
export interface BoxRequest {
  /** A new one opens the box again (a drop on the same unit twice). */
  token: number
  item: NewItem
  rackId: string
  /** The highest unit of the first device; absent when dropped on a rack: the first that fits. */
  unit?: number
}

interface State {
  picked?: NewItem
  box?: BoxRequest
}

let state: State = {}
let nextToken = 1
let lastPanel: number | undefined
let lastHdf: { rows: number; height: number } | undefined
const listeners = new Set<() => void>()
const set = (next: State) => {
  state = next
  listeners.forEach((l) => l())
}

export const addSession = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
  get: () => state,
  /** A click on a library entry, or undefined to let the pick go (the caller compares with `sameItem`). */
  pick(item: NewItem | undefined) {
    set({ picked: item })
  },
  openBox(request: Omit<BoxRequest, 'token'>) {
    set({ box: { ...request, token: nextToken++ } })
  },
  closeBox() {
    if (state.box) set({ ...state, box: undefined })
  },
  /** Nothing picked, no box. */
  clear() {
    if (state.picked || state.box) set({})
  },
  lastPanel: () => lastPanel,
  lastHdf: () => lastHdf,
  rememberPanel(positions: number) {
    lastPanel = positions
  },
  rememberHdf(rows: number, height: number) {
    lastHdf = { rows, height }
  },
}

export const useAddSession = () =>
  useSyncExternalStore(addSession.subscribe, addSession.get)

export const sameItem = (a: NewItem | undefined, b: NewItem): boolean =>
  !!a &&
  a.type === b.type &&
  (a.type !== 'model' || a.modelId === (b as typeof a).modelId) &&
  (a.type !== 'rack_item' || a.itemType === (b as typeof a).itemType)
