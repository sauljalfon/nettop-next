import type { ManualFacets } from './facets'
import type { Focus } from './focus'
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
  /** The location focus, or undefined. Replaced on every change. */
  focus(): Focus | undefined
  setFocus(focus: Focus | undefined): void
  /** IDs of expanded boundary bundles. Replaced on every change. */
  expandedBundles(): ReadonlySet<string>
  toggleBundle(id: string): void
  /** Notified after manual facets change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export function createMapSession(): MapSession {
  const positions = new Map<string, Position>()
  let viewport: Viewport | undefined
  let manual: ManualFacets = new Map()
  let focus: Focus | undefined
  let expanded: ReadonlySet<string> = new Set()
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
    focus: () => focus,
    setFocus(next) {
      focus = next && { kind: next.kind, id: next.id }
      notify()
    },
    expandedBundles: () => expanded,
    toggleBundle(id) {
      const next = new Set(expanded)
      if (!next.delete(id)) next.add(id)
      expanded = next
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
