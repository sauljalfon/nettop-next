import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HDF_NUMBERING_KEY,
  hdfNumbering,
  reloadHdfNumbering,
  setHdfNumbering,
} from './hdfNumbering'

class MemoryStorage {
  data = new Map<string, string>()
  getItem = (k: string) => this.data.get(k) ?? null
  setItem = (k: string, v: string) => void this.data.set(k, v)
}
let localStorage: MemoryStorage

beforeEach(() => {
  localStorage = new MemoryStorage()
  vi.stubGlobal('localStorage', localStorage)
  reloadHdfNumbering()
})
afterEach(() => {
  vi.unstubAllGlobals()
  reloadHdfNumbering()
})

describe('hdfNumbering', () => {
  it('is pairs by default', () => {
    expect(hdfNumbering()).toBe('pairs')
  })

  it('is set and read back, and remembered', () => {
    setHdfNumbering('pigtails')
    expect(hdfNumbering()).toBe('pigtails')
    expect(localStorage.getItem(HDF_NUMBERING_KEY)).toBe('pigtails')
  })

  it('reads a stored pigtails on start', () => {
    localStorage.setItem(HDF_NUMBERING_KEY, 'pigtails')
    reloadHdfNumbering()
    expect(hdfNumbering()).toBe('pigtails')
  })

  it('reads an unknown stored value as pairs', () => {
    localStorage.setItem(HDF_NUMBERING_KEY, 'fibers')
    reloadHdfNumbering()
    expect(hdfNumbering()).toBe('pairs')
  })

  it('lasts for the session when storage throws, and nothing throws', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(() => setHdfNumbering('pigtails')).not.toThrow()
    expect(hdfNumbering()).toBe('pigtails')
    expect(() => reloadHdfNumbering()).not.toThrow()
    expect(hdfNumbering()).toBe('pairs')
  })
})
