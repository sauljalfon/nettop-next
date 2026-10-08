import { historyReducer, initialHistory, type PhysicalHistory } from './history'
import type { PhysicalLocation } from './location'
import type { Viewport } from '../map/mapSession'

/**
 * Session-only state of the physical explorer: where it is, where Back goes,
 * and which site screens have been fitted. It lives outside the Workspace (like
 * mapSession), so switching Installed/Plan or the view keeps it, and nothing
 * here is persisted: a reload starts at Sites.
 */
export interface PhysicalSession {
  /** Replaced on every change, so it works as a store snapshot. */
  history(): PhysicalHistory
  location(): PhysicalLocation
  navigate(to: PhysicalLocation): void
  /** Replaces the current location without a history entry. */
  replace(to: PhysicalLocation): void
  back(): void
  /** True until the site's screen has been fitted: it fits once per session. */
  needsFit(siteId: string): boolean
  markFitted(siteId: string): void
  /** A layout reset asks for one more fit of that site. */
  requestRefit(siteId: string): void
  /** The pan and zoom last used on a site's screen; absent until recorded. */
  viewport(siteId: string): Viewport | undefined
  setViewport(siteId: string, viewport: Viewport): void
  subscribe(listener: () => void): () => void
}

export function createPhysicalSession(): PhysicalSession {
  let history = initialHistory()
  const fitted = new Set<string>()
  const viewports = new Map<string, Viewport>()
  const listeners = new Set<() => void>()
  const set = (next: PhysicalHistory) => {
    if (next === history) return
    history = next
    for (const listener of listeners) listener()
  }
  return {
    history: () => history,
    location: () => history.current,
    navigate: (to) => set(historyReducer(history, { type: 'navigate', to })),
    replace: (to) => set(historyReducer(history, { type: 'replace', to })),
    back: () => set(historyReducer(history, { type: 'back' })),
    needsFit: (siteId) => !fitted.has(siteId),
    markFitted: (siteId) => void fitted.add(siteId),
    requestRefit(siteId) {
      fitted.delete(siteId)
      viewports.delete(siteId)
    },
    viewport: (siteId) => viewports.get(siteId),
    setViewport: (siteId, v) =>
      void viewports.set(siteId, { x: v.x, y: v.y, zoom: v.zoom }),
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** The one session store for the running app. */
export const physicalSession = createPhysicalSession()
