import { describe, expect, it, vi } from 'vitest'
import { createLazy, whenIdle } from './lazy'

describe('SC-03 per-snapshot lists are built once, off the open path', () => {
  it('createLazy computes on first use and never again', () => {
    const compute = vi.fn(() => [1, 2, 3])
    const lazy = createLazy(compute)
    expect(compute).not.toHaveBeenCalled()
    expect(lazy.ready()).toBe(false)
    const first = lazy.get()
    expect(lazy.get()).toBe(first)
    expect(lazy.ready()).toBe(true)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('whenIdle runs later (a timer without requestIdleCallback) and can be cancelled', async () => {
    const ran = vi.fn()
    whenIdle(ran)
    expect(ran).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 120))
    expect(ran).toHaveBeenCalledTimes(1)
    const cancelled = vi.fn()
    whenIdle(cancelled)()
    await new Promise((r) => setTimeout(r, 120))
    expect(cancelled).not.toHaveBeenCalled()
  })
})
