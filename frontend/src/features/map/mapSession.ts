import type { ManualFacets } from './facets'
import type { LocationRef } from './highlight'
import type { Position } from './layout'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

/**
 * Session-level map layout state, keyed by equipment ID and shared by Installed
 * and Plan. Positions are recorded at drag stop; the viewport is recorded after
 * pan/zoom. Nothing here is persisted to the server (M6) or fed to traversal.
 */
export interface MapSession {
  position(id: string): Position | undefined
  positions(): ReadonlyMap<string, Position>
  setPosition(id: string, position: Position): void
  /**
   * Gives every ID without a position one from `layout` and records it, so a
   * later call never recomputes it. Returns the IDs that were placed.
   */
  placeMissing(
    ids: readonly string[],
    layout: (missing: string[]) => ReadonlyMap<string, Position>,
  ): string[]
  viewport(): Viewport | undefined
  setViewport(viewport: Viewport): void
  /** True until a viewport has been recorded: the map fits once per session. */
  needsFit(): boolean
  /**
   * Facets the user chose to show, by equipment ID then facet key. Replaced
   * (never mutated) on every change so it works as a store snapshot.
   */
  manualFacets(): ManualFacets
  toggleManual(equipmentId: string, key: string): void
  /**
   * The site or node whose equipment is highlighted on the map, or undefined.
   * Replaced on every change. Independent of the trace.
   */
  highlight(): LocationRef | undefined
  setHighlight(location: LocationRef | undefined): void
  /**
   * Card pairs (per network) whose parallel cables are drawn as separate lines
   * instead of one. Replaced on every change; kept by a layout reset.
   */
  splitPairs(): ReadonlySet<string>
  toggleSplit(pairKey: string): void
  /**
   * The route view: a picture of the active route that covers the map. Session-only;
   * the map underneath is never touched, so turning it off restores it exactly.
   */
  routeView(): boolean
  setRouteView(on: boolean): void
  /**
   * Forgets every recorded card position and the viewport, so the next
   * projection lays everything out again and the map fits once. Pinned facets
   * and the highlight are kept.
   */
  resetLayout(): void
  /**
   * Asks the map to center the view on a card at the current zoom (not a
   * refit). `serial` increases on every request, so repeating one still counts.
   */
  centerRequest(): { id: string; serial: number } | undefined
  requestCenter(id: string): void
  /** Serial of the last request the map has acted on; a remount never replays it. */
  centerHandled(): number
  markCenterHandled(serial: number): void
  /**
   * Asks the map to fit the view once to these cards (the result of choosing a
   * location). `serial` increases on every request.
   */
  fitRequest(): { ids: string[]; serial: number } | undefined
  requestFit(ids: readonly string[]): void
  fitHandled(): number
  markFitHandled(serial: number): void
  /** Incremented by every resetLayout; lets the map tell a reset from a drag. */
  layoutVersion(): number
  /** Notified after manual facets change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export function createMapSession(): MapSession {
  const positions = new Map<string, Position>()
  let viewport: Viewport | undefined
  let manual: ManualFacets = new Map()
  let highlight: LocationRef | undefined
  let split: ReadonlySet<string> = new Set()
  let routeView = false
  let fit: { ids: string[]; serial: number } | undefined
  let fitHandled = 0
  let layoutVersion = 0
  let center: { id: string; serial: number } | undefined
  let centerHandled = 0
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  return {
    position: (id) => positions.get(id),
    positions: () => positions,
    setPosition: (id, p) => void positions.set(id, { x: p.x, y: p.y }),
    placeMissing(ids, layout) {
      const missing = ids.filter((id) => !positions.has(id))
      if (!missing.length) return []
      const placed = layout(missing)
      const result: string[] = []
      for (const id of missing) {
        const p = placed.get(id)
        if (!p) continue
        positions.set(id, { x: p.x, y: p.y })
        result.push(id)
      }
      return result
    },
    viewport: () => viewport,
    setViewport: (v) => void (viewport = { x: v.x, y: v.y, zoom: v.zoom }),
    needsFit: () => viewport === undefined,
    manualFacets: () => manual,
    toggleManual(equipmentId, key) {
      const next = new Map(manual)
      const keys = new Set(next.get(equipmentId))
      if (!keys.delete(key)) keys.add(key)
      if (keys.size) next.set(equipmentId, keys)
      else next.delete(equipmentId)
      manual = next
      notify()
    },
    routeView: () => routeView,
    setRouteView(on) {
      if (on === routeView) return
      routeView = on
      notify()
    },
    splitPairs: () => split,
    toggleSplit(key) {
      const next = new Set(split)
      if (!next.delete(key)) next.add(key)
      split = next
      notify()
    },
    resetLayout() {
      positions.clear()
      viewport = undefined
      layoutVersion++
      notify()
    },
    layoutVersion: () => layoutVersion,
    centerRequest: () => center,
    centerHandled: () => centerHandled,
    markCenterHandled(serial) {
      centerHandled = Math.max(centerHandled, serial)
    },
    requestCenter(id) {
      center = { id, serial: (center?.serial ?? 0) + 1 }
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
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** The one session store for the running app. */
export const mapSession = createMapSession()
