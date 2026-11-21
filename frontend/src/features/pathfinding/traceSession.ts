import type { TraceRequest, TraceResult } from '../../shared/types'

/** The selected route, identified by its two endpoints (never by its position in a list). */
export interface RouteRef {
  start: string
  end: string
}

export interface StoredTrace {
  request: TraceRequest
  route?: RouteRef
}

/**
 * The last trace the user ran, outside the Workspace (like `mapSession`), so a
 * context switch, which remounts the Workspace, can run it again in the new
 * context. Session-only. Clearing the trace forgets it, so nothing reruns.
 */
/** One route at a time, or every route stacked (the Trace page's choice). */
export type TracePageView = 'one' | 'all'

export interface TraceSession {
  get(): StoredTrace | undefined
  /** A new request; the previous route is forgotten. */
  start(request: TraceRequest): void
  /** The route now shown. Ignored when there is no request. */
  selectRoute(route: RouteRef | undefined): void
  clear(): void
  /** The Trace page's One route | All routes; survives a clear and a remount. */
  pageView(): TracePageView
  setPageView(view: TracePageView): void
  /** The Trace page's Picture only. */
  picture(): boolean
  setPicture(on: boolean): void
  /** Called after pageView or picture changes. */
  subscribe(listener: () => void): () => void
}

export function createTraceSession(): TraceSession {
  let stored: StoredTrace | undefined
  let pageView: TracePageView = 'one'
  let picture = false
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  return {
    get: () => stored,
    start(request) {
      stored = { request, route: undefined }
    },
    selectRoute(route) {
      if (stored) stored = { ...stored, route }
    },
    clear() {
      stored = undefined
    },
    pageView: () => pageView,
    setPageView(view) {
      if (view === pageView) return
      pageView = view
      emit()
    },
    picture: () => picture,
    setPicture(on) {
      if (on === picture) return
      picture = on
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The one session store for the running app. */
export const traceSession = createTraceSession()

/**
 * Which route to select in a result: the one with the same start and end
 * endpoints as before, else the first. `fellBack` is true only when a route had
 * been selected and could not be found among routes that exist.
 */
export function chooseRoute(
  result: Pick<TraceResult, 'routes'>,
  wanted: RouteRef | undefined,
): { index: number; fellBack: boolean } {
  if (!wanted) return { index: 0, fellBack: false }
  const index = result.routes.findIndex(
    (r) => r.start === wanted.start && r.end === wanted.end,
  )
  if (index >= 0) return { index, fellBack: false }
  return { index: 0, fellBack: result.routes.length > 0 }
}
