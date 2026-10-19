import type { LocationRef } from './highlight'
import type { Position } from '../physical/layout'

/** Which conceptual map is drawn. */
export type MapMode = 'overview' | 'focus'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

/**
 * Session-only state of the conceptual map: the view, the overview's viewport,
 * open cards, proposed node positions, the focus, the highlight and the route
 * view. Nothing here is persisted to the server or fed to traversal.
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
  /** The map drawn under the Conceptual header; session-only. */
  view(): MapMode
  setView(view: MapMode): void
  /** The overview's viewport; Focus has none of its own. */
  overviewViewport(): Viewport | undefined
  setOverviewViewport(viewport: Viewport): void
  /** True until an overview viewport has been recorded: it fits once per session. */
  overviewNeedsFit(): boolean
  /** Node cards that are open (listing their equipment). Replaced on every change. */
  openNodes(): ReadonlySet<string>
  toggleNode(id: string): void
  /**
   * Positions of nodes that exist only in the plan (the server does not know
   * them). Replaced on every change; never sent to the server.
   */
  proposedPositions(): ReadonlyMap<string, Position>
  proposedPosition(id: string): Position | undefined
  setProposedPosition(id: string, position: Position): void
  /**
   * Forgets the proposed positions and the overview viewport, so the next
   * render fits once. Open cards are kept.
   */
  resetOverview(): void
  /** Incremented by every resetOverview; lets the overview tell a reset from a drag. */
  overviewVersion(): number
  /** The equipment Focus is on; undefined until the first focusOn. */
  focusId(): string | undefined
  /** Rings shown around the focus, 1–3. Kept across focus changes. */
  hops(): number
  setHops(hops: number): void
  /**
   * Opens Focus on this equipment; the hops are kept and any opened group
   * cards are closed.
   */
  focusOn(id: string): void
  /** Leaves Focus for the overview; its viewport is untouched. */
  back(): void
  /** Group cards that are open (by their key). Replaced on every change. */
  openGroups(): ReadonlySet<string>
  toggleGroup(key: string): void
  /** Notified after any change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export function createMapSession(): MapSession {
  let highlight: LocationRef | undefined
  let routeView = false
  let fit: { ids: string[]; serial: number } | undefined
  let fitHandled = 0
  let view: MapMode = 'overview'
  let overviewViewport: Viewport | undefined
  let openNodes: ReadonlySet<string> = new Set()
  let proposed: ReadonlyMap<string, Position> = new Map()
  let overviewVersion = 0
  let focusId: string | undefined
  let hops = 1
  let openGroups: ReadonlySet<string> = new Set()
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
    view: () => view,
    setView(next) {
      if (next === view) return
      view = next
      notify()
    },
    overviewViewport: () => overviewViewport,
    setOverviewViewport: (v) =>
      void (overviewViewport = { x: v.x, y: v.y, zoom: v.zoom }),
    overviewNeedsFit: () => overviewViewport === undefined,
    openNodes: () => openNodes,
    toggleNode(id) {
      const next = new Set(openNodes)
      if (!next.delete(id)) next.add(id)
      openNodes = next
      notify()
    },
    proposedPositions: () => proposed,
    proposedPosition: (id) => proposed.get(id),
    setProposedPosition(id, p) {
      proposed = new Map(proposed).set(id, { x: p.x, y: p.y })
      notify()
    },
    resetOverview() {
      proposed = new Map()
      overviewViewport = undefined
      overviewVersion++
      notify()
    },
    overviewVersion: () => overviewVersion,
    focusId: () => focusId,
    hops: () => hops,
    setHops(n) {
      const next = Math.min(3, Math.max(1, Math.floor(n)))
      if (next === hops) return
      hops = next
      notify()
    },
    focusOn(id) {
      view = 'focus'
      focusId = id
      openGroups = new Set()
      notify()
    },
    back() {
      if (view !== 'focus') return
      view = 'overview'
      notify()
    },
    openGroups: () => openGroups,
    toggleGroup(key) {
      const next = new Set(openGroups)
      if (!next.delete(key)) next.add(key)
      openGroups = next
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
