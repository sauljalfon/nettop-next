import type { LocationRef } from './highlight'
import type { Network } from '../../shared/types'
import type { Selection } from './hierarchySelection'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

/**
 * Session-only state of the conceptual map: the hierarchy's viewport, the shown
 * network, Only problems, open nodes, the selection, the highlight and the route view. Nothing here is persisted to the server or fed to traversal.
 */
export interface MapSession {
  /**
   * The site or node whose equipment is highlighted on the map, or undefined.
   * Replaced on every change. Independent of the trace.
   */
  highlight(): LocationRef | undefined
  setHighlight(location: LocationRef | undefined): void
  /**
   * The route view: a picture of the active route that covers the map. Session-only;
   * the map underneath is never touched, so turning it off restores it exactly.
   */
  routeView(): boolean
  setRouteView(on: boolean): void
  /**
   * Asks the map to fit the view once to these cards (the result of choosing a
   * location). `serial` increases on every request.
   */
  fitRequest(): { ids: string[]; serial: number } | undefined
  requestFit(ids: readonly string[]): void
  fitHandled(): number
  markFitHandled(serial: number): void
  /** The hierarchy's viewport; it fits once per session. */
  hierarchyViewport(): Viewport | undefined
  setHierarchyViewport(viewport: Viewport): void
  /** True until a hierarchy viewport has been recorded. */
  hierarchyNeedsFit(): boolean
  /**
   * The network IDs the map was told to show, first choice first; empty until
   * one is chosen. Read through `shownNetworks`, which falls back.
   */
  networks(): readonly string[]
  /** Phase 1 shows one network: the list becomes `[id]`. */
  showNetwork(id: string): void
  /** Only nodes with problems are drawn. */
  onlyProblems(): boolean
  setOnlyProblems(on: boolean): void
  /** Node cards that are open (listing their equipment). Replaced on every change. */
  openNodes(): ReadonlySet<string>
  toggleNode(id: string): void
  /**
   * What Show on map or a card click selected on the tree; undefined when
   * nothing is. It opens nothing and changes no network by itself.
   */
  selection(): Selection | undefined
  select(selection: Selection): void
  clear(): void
  /** Notified after any change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

/**
 * The network the map shows: the first chosen one that exists in the snapshot,
 * else the snapshot's first, else none (a plan or another context may not have
 * the chosen one).
 */
export function shownNetworks(
  chosen: readonly string[],
  networks: readonly Network[],
): string[] {
  const first = chosen.find((id) => networks.some((n) => n.id === id))
  const id = first ?? networks[0]?.id
  return id === undefined ? [] : [id]
}

export function createMapSession(): MapSession {
  let highlight: LocationRef | undefined
  let routeView = false
  let fit: { ids: string[]; serial: number } | undefined
  let fitHandled = 0
  let hierarchyViewport: Viewport | undefined
  let networks: readonly string[] = []
  let onlyProblems = false
  let openNodes: ReadonlySet<string> = new Set()
  let selection: Selection | undefined
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  return {
    routeView: () => routeView,
    setRouteView(on) {
      if (on === routeView) return
      routeView = on
      notify()
    },
    highlight: () => highlight,
    setHighlight(next) {
      highlight = next && { kind: next.kind, id: next.id }
      notify()
    },
    fitRequest: () => fit,
    fitHandled: () => fitHandled,
    markFitHandled(serial) {
      fitHandled = Math.max(fitHandled, serial)
    },
    requestFit(ids) {
      fit = { ids: [...ids], serial: (fit?.serial ?? 0) + 1 }
      notify()
    },
    hierarchyViewport: () => hierarchyViewport,
    setHierarchyViewport: (v) =>
      void (hierarchyViewport = { x: v.x, y: v.y, zoom: v.zoom }),
    hierarchyNeedsFit: () => hierarchyViewport === undefined,
    networks: () => networks,
    showNetwork(id) {
      if (networks.length === 1 && networks[0] === id) return
      networks = [id]
      notify()
    },
    onlyProblems: () => onlyProblems,
    setOnlyProblems(on) {
      if (on === onlyProblems) return
      onlyProblems = on
      notify()
    },
    openNodes: () => openNodes,
    toggleNode(id) {
      const next = new Set(openNodes)
      if (!next.delete(id)) next.add(id)
      openNodes = next
      notify()
    },
    selection: () => selection,
    select(next) {
      selection = { ...next }
      notify()
    },
    clear() {
      selection = undefined
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** The one session store for the running app. */
export const mapSession = createMapSession()
