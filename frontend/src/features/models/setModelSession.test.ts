import { describe, expect, it, vi } from 'vitest'
import { setModelSession } from './setModelSession'

describe('setModelSession', () => {
  it('opens for some switches and closes once', () => {
    const heard = vi.fn()
    const stop = setModelSession.subscribe(heard)
    setModelSession.open(['sw-1', 'sw-2'], 'inventory:set-model')
    expect(setModelSession.get()).toEqual({
      equipmentIds: ['sw-1', 'sw-2'],
      opener: 'inventory:set-model',
    })
    setModelSession.close()
    setModelSession.close()
    expect(setModelSession.get()).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(2)
    stop()
  })
})
