import { useSyncExternalStore } from 'react'

/** How an HDF jack is numbered: by fiber pair (5) or by its two pigtails (9, 10). */
export type HdfNumbering = 'pairs' | 'pigtails'

/** The one localStorage key the choice lives under. */
export const HDF_NUMBERING_KEY = 'net-top-next.hdf-numbering'

const read = (): HdfNumbering => {
  try {
    return localStorage.getItem(HDF_NUMBERING_KEY) === 'pigtails'
      ? 'pigtails'
      : 'pairs'
  } catch {
    return 'pairs'
  }
}

let current: HdfNumbering = read()
const listeners = new Set<() => void>()

export const hdfNumbering = (): HdfNumbering => current

/** Remembered in localStorage; with storage blocked it lasts for the session. */
export function setHdfNumbering(n: HdfNumbering): void {
  current = n
  try {
    localStorage.setItem(HDF_NUMBERING_KEY, n)
  } catch {
    // The choice still holds for this session.
  }
  listeners.forEach((l) => l())
}

/** Re-reads the stored choice (tests simulate a fresh start with it). */
export function reloadHdfNumbering(): void {
  current = read()
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useHdfNumbering = (): HdfNumbering =>
  useSyncExternalStore(subscribe, hdfNumbering)
