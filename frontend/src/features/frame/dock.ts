import { useSyncExternalStore } from 'react'

/** The dock's tabs, in the order they are drawn (see `tabsFor`). */
export type DockTab =
  | 'details'
  | 'inspector'
  | 'explore'
  | 'add'
  | 'changes'
  | 'networks'
  | 'history'

export interface DockState {
  open: boolean
  tab: DockTab
  /** Set while the tree has something selected (Node). A jack on an equipment page never adds a tab (D50): its card is on the page. */
  details?: 'Node'
  /** The last tab other than details and networks that was open, for `detailsGone`. */
  last?: DockTab
  /** The equipment whose History tab is open (set while `tab` is `history`). */
  historyFor?: string
}

export const initialDock: DockState = { open: false, tab: 'inspector' }

const remember = (s: DockState, tab: DockTab): DockTab | undefined =>
  tab === 'details' || tab === 'networks' || tab === 'history' ? s.last : tab

/** Opens on that tab. */
export function openTab(s: DockState, tab: DockTab): DockState {
  if (tab === 'details' && !s.details) return s
  return { ...s, open: true, tab, last: remember(s, tab) }
}

/** The History tab of one equipment (the equipment page's ⋯ menu): it exists only while it is open. */
export function openHistory(s: DockState, equipmentId: string): DockState {
  return { ...openTab(s, 'history'), historyFor: equipmentId }
}

/** The same icon again closes; another icon switches the tab. */
export function railClick(s: DockState, tab: DockTab): DockState {
  return s.open && s.tab === tab ? close(s) : openTab(s, tab)
}

export function close(s: DockState): DockState {
  return { ...s, open: false }
}

/** Something was selected: the dock opens on the details tab. */
export function detailsShown(s: DockState, label: 'Node'): DockState {
  return { ...s, open: true, tab: 'details', details: label }
}

/**
 * A selection exists that did not come from a click in the view (Explore, Show on map, a
 * deep link): the details tab is there, but the dock stays on the tab it is on; closed, it
 * opens on the details.
 */
export function detailsAvailable(s: DockState, label: 'Node'): DockState {
  if (!s.open) return detailsShown(s, label)
  if (s.details === label) return s
  if (s.tab === 'details' && s.details) {
    // The other view's details gave way to this one's: back to the tab before them.
    const gone = detailsGone(s)
    return gone.open ? { ...gone, details: label } : detailsShown(s, label)
  }
  return { ...s, details: label }
}

/** The selection is gone: the details tab leaves; on it, the dock goes to the last other tab, else closes. */
export function detailsGone(s: DockState): DockState {
  const { details: _gone, ...rest } = s
  void _gone
  if (s.tab !== 'details') return rest
  if (s.last && s.last !== 'details') return { ...rest, tab: s.last }
  return { ...rest, open: false, tab: initialDock.tab }
}

/** Add exists only in a plan: in Installed it becomes Changes. */
export function forContext(s: DockState, planned: boolean): DockState {
  if (planned) return s
  return {
    ...s,
    tab: s.tab === 'add' ? 'changes' : s.tab,
    last: s.last === 'add' ? 'changes' : s.last,
  }
}

export function tabsFor(s: DockState, planned: boolean): DockTab[] {
  return [
    ...(s.details ? (['details'] as const) : []),
    'inspector',
    'explore',
    ...(planned ? (['add'] as const) : []),
    'changes',
    ...(s.tab === 'networks' ? (['networks'] as const) : []),
    ...(s.tab === 'history' && s.historyFor ? (['history'] as const) : []),
  ]
}

/** The tab's visible label. */
export function tabLabel(s: DockState, tab: DockTab): string {
  const labels: Record<DockTab, string> = {
    details: s.details ?? 'Node',
    inspector: 'Inspector',
    explore: 'Explore',
    add: 'Add',
    changes: 'Changes',
    networks: 'Networks',
    history: 'History',
  }
  return labels[tab]
}

/** The dock's accessible name for the open tab (the old drawers' titles). */
export function tabTitle(s: DockState, tab: DockTab): string {
  const titles: Record<DockTab, string> = {
    details: 'Node details',
    inspector: 'Equipment inspector',
    explore: 'Explore infrastructure',
    add: 'Equipment library',
    changes: 'Changes & plans',
    networks: 'Manage networks',
    history: 'Equipment history',
  }
  return titles[tab]
}

/** The line under the title; none for the details tab, whose body has its own head. */
export const TAB_SUBTITLES: Partial<Record<DockTab, string>> = {
  inspector: 'Select equipment on the map to inspect it',
  explore: 'Site → node → rack → equipment',
  add: 'Drag onto a rack, or add an HDF with its form',
  changes: 'Proposals stay separate from installed infrastructure',
  networks: 'Networks are shared by every view.',
}

type Listener = () => void

/** Session-only store of the dock, outside React like `mapSession`: never persisted, never fed to traversal. */
function createDockSession() {
  let state: DockState = initialDock
  let planned = false
  /** What the feature that shows the details does for the × and Esc (clear its selection). */
  let detailsCloser: (() => void) | undefined
  const listeners = new Set<Listener>()
  const set = (next: DockState) => {
    if (next === state) return
    state = next
    listeners.forEach((l) => l())
  }
  const guard = (tab: DockTab): DockTab =>
    tab === 'add' && !planned ? 'changes' : tab
  return {
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get: () => state,
    rail: (tab: DockTab) => set(railClick(state, guard(tab))),
    open: (tab: DockTab) => set(openTab(state, guard(tab))),
    /** The equipment page's ⋯ History: the tab opens on that equipment. */
    openHistory: (equipmentId: string) => set(openHistory(state, equipmentId)),
    close: () => set(close(state)),
    showDetails: (label: 'Node') => set(detailsShown(state, label)),
    /** Selected from elsewhere: the tab exists, the dock keeps its tab (opens on it when closed). */
    availableDetails: (label: 'Node') => set(detailsAvailable(state, label)),
    hideDetails: () => set(detailsGone(state)),
    /** The feature that shows the details registers its close (the tree's clear, the page's close port); pass undefined to drop it. */
    setDetailsCloser(fn: (() => void) | undefined) {
      detailsCloser = fn
    },
    /** The × (or Esc) on the details tab: the feature's own close; with none registered, the tab just goes. */
    closeDetails() {
      if (detailsCloser) detailsCloser()
      else set(detailsGone(state))
    },
    setPlanned(next: boolean) {
      planned = next
      set(forContext(state, next))
    },
    /** For tests. */
    reset() {
      planned = false
      detailsCloser = undefined
      set(initialDock)
    },
  }
}

export const dockSession = createDockSession()

export function useDock(): DockState {
  return useSyncExternalStore(dockSession.subscribe, dockSession.get)
}
