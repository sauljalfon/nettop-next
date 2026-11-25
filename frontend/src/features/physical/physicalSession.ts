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
  /** The rack level's chosen unit and its selected jack; replaced on every change (a store snapshot). */
  rackView(rackId: string): RackView
  /** Choosing another unit drops the jack; the same unit keeps it. */
  chooseUnit(rackId: string, equipmentId: string): void
  selectJack(rackId: string, endpointId: string | undefined): void
  subscribe(listener: () => void): () => void
}

/** What the rack level shows beside the rack: absent until something is chosen. */
export interface RackView {
  equipmentId?: string
  endpointId?: string
}

const NO_VIEW: RackView = {}

/**
 * The unit the rack level shows: the chosen one while it is still in the rack,
 * else the topmost equipment that has ports, else none. A rack item can be
 * chosen (it shows "No ports") but is never the default.
 */
export function chosenUnit(
  view: RackView,
  rows: readonly { kind: string; [key: string]: unknown }[],
  hasPorts: (equipmentId: string) => boolean,
): string | undefined {
  const ids = rows.flatMap((r) =>
    r.kind === 'equipment' && 'equipmentId' in r ? [String(r.equipmentId)] : [],
  )
  if (view.equipmentId && ids.includes(view.equipmentId))
    return view.equipmentId
  return ids.find(hasPorts)
}

export function createPhysicalSession(): PhysicalSession {
  let history = initialHistory()
  const fitted = new Set<string>()
  const viewports = new Map<string, Viewport>()
  const racks = new Map<string, RackView>()
  const listeners = new Set<() => void>()
  const setRack = (rackId: string, next: RackView) => {
    racks.set(rackId, next)
    for (const listener of listeners) listener()
  }
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
    rackView: (rackId) => racks.get(rackId) ?? NO_VIEW,
    chooseUnit(rackId, equipmentId) {
      const now = racks.get(rackId)
      if (now?.equipmentId === equipmentId) return
      setRack(rackId, { equipmentId })
    },
    selectJack(rackId, endpointId) {
      const now = racks.get(rackId)
      if (!now?.equipmentId || now.endpointId === endpointId) return
      setRack(
        rackId,
        endpointId
          ? { equipmentId: now.equipmentId, endpointId }
          : { equipmentId: now.equipmentId },
      )
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** The one session store for the running app. */
export const physicalSession = createPhysicalSession()
