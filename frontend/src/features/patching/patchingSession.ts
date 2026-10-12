import type { FarTarget, Side } from './patching'

/** What opens the patching screen: the near jack, and one cable or a range. */
export interface PatchRequest {
  nearEndpointId: string
  mode: 'one' | 'range'
  /** The range's pair count (1–500); ignored for one cable. */
  count: number
  /** The far end to start on; the screen picks one when absent. */
  far?: FarTarget
  /** A CSS selector for what gets focus back when the screen closes (the opener). */
  returnTo?: string
}

const RECENT = 4

/**
 * Session-only state of the patching screen, outside the Workspace like
 * mapSession: the open request, the latest far targets (for the popover's
 * one-click chips), and the side last used per equipment. Nothing is saved.
 */
export interface PatchingSession {
  subscribe(listener: () => void): () => void
  request(): PatchRequest | undefined
  open(request: PatchRequest): void
  close(): void
  /** Newest first. Replaced on every change, so it works as a store snapshot. */
  recent(): readonly FarTarget[]
  remember(target: FarTarget): void
  sides(): ReadonlyMap<string, Side>
}

export function createPatchingSession(): PatchingSession {
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }
  let current: PatchRequest | undefined
  let recent: FarTarget[] = []
  let sides = new Map<string, Side>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    request: () => current,
    open(request) {
      current = request
      changed()
    },
    close() {
      if (!current) return
      current = undefined
      changed()
    },
    recent: () => recent,
    remember(target) {
      recent = [
        target,
        ...recent.filter(
          (t) => t.equipmentId !== target.equipmentId || t.side !== target.side,
        ),
      ].slice(0, RECENT)
      if (target.side)
        sides = new Map(sides).set(target.equipmentId, target.side)
      changed()
    },
    sides: () => sides,
  }
}

export const patchingSession = createPatchingSession()
