import type { PlanConflict } from '../../shared/types'

/**
 * The conflicts Update draft found, per draft, shared by the stale card in the
 * main area and the Changes drawer (session only; never persisted).
 */
export interface RebaseSession {
  subscribe(listener: () => void): () => void
  conflicts(planId: string): readonly PlanConflict[] | undefined
  set(planId: string, conflicts: readonly PlanConflict[]): void
  clear(planId: string): void
}

export function createRebaseSession(): RebaseSession {
  let map = new Map<string, readonly PlanConflict[]>()
  const listeners = new Set<() => void>()
  const change = (next: Map<string, readonly PlanConflict[]>) => {
    map = next
    listeners.forEach((l) => l())
  }
  return {
    subscribe: (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    conflicts: (id) => map.get(id),
    set: (id, conflicts) => change(new Map(map).set(id, conflicts)),
    clear: (id) => {
      if (!map.has(id)) return
      const next = new Map(map)
      next.delete(id)
      change(next)
    },
  }
}

export const rebaseSession = createRebaseSession()
