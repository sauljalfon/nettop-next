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
}

export function createMapSession(): MapSession {
  const positions = new Map<string, Position>()
  let viewport: Viewport | undefined
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
  }
}

/** The one session store for the running app. */
export const mapSession = createMapSession()
