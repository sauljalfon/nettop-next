import { useEffect, useMemo, useState, type DependencyList } from 'react'

/** A value computed on first use, then kept. */
export interface Lazy<T> {
  get(): T
  ready(): boolean
}

export function createLazy<T>(compute: () => T): Lazy<T> {
  let done = false
  let value: T
  return {
    get() {
      if (!done) {
        value = compute()
        done = true
      }
      return value
    },
    ready: () => done,
  }
}

/** Runs `task` when the browser is idle (a short timer where there is no requestIdleCallback). Returns its canceller. */
export function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(task, { timeout: 5000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(task, 50)
  return () => clearTimeout(id)
}

/**
 * A per-input list built once for the current inputs. It is computed when the
 * browser is idle after they change, never when something opens; a reader that
 * comes first simply computes it then (same result, just sooner).
 */
export function useIdleLazy<T>(
  compute: () => T,
  deps: DependencyList,
): Lazy<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lazy = useMemo(() => createLazy(compute), deps)
  useEffect(() => whenIdle(() => void lazy.get()), [lazy])
  return lazy
}

/** The value, once it has stopped changing for `ms` (150 ms for search boxes). */
export function useDebounced<T>(value: T, ms = 150): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
}
