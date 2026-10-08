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
export interface TraceSession {
  get(): StoredTrace | undefined
  /** A new request; the previous route is forgotten. */
  start(request: TraceRequest): void
  /** The route now shown. Ignored when there is no request. */
  selectRoute(route: RouteRef | undefined): void
  clear(): void
}

export function createTraceSession(): TraceSession {
  let stored: StoredTrace | undefined
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
