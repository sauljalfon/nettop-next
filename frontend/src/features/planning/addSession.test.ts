import { afterEach, describe, expect, it, vi } from 'vitest'
import { addSession, sameItem } from './addSession'

afterEach(() => addSession.clear())

describe('sameItem', () => {
  it('matches the same entry and nothing else', () => {
    expect(sameItem(undefined, { type: 'panel' })).toBe(false)
    expect(sameItem({ type: 'panel' }, { type: 'panel' })).toBe(true)
    expect(sameItem({ type: 'panel' }, { type: 'hdf' })).toBe(false)
    const a = { type: 'model', modelId: 'model-a' } as const
    expect(sameItem(a, { type: 'model', modelId: 'model-a' })).toBe(true)
    expect(sameItem(a, { type: 'model', modelId: 'model-b' })).toBe(false)
    const ups = { type: 'rack_item', itemType: 'ups' } as const
    expect(sameItem(ups, { type: 'rack_item', itemType: 'ups' })).toBe(true)
    expect(sameItem(ups, { type: 'rack_item', itemType: 'pdu' })).toBe(false)
  })
})

describe('addSession', () => {
  it('a pick and a box, and clear empties both', () => {
    const heard = vi.fn()
    const stop = addSession.subscribe(heard)
    addSession.pick({ type: 'hdf' })
    expect(addSession.get().picked).toEqual({ type: 'hdf' })
    addSession.openBox({ item: { type: 'hdf' }, rackId: 'rack-a', unit: 10 })
    expect(addSession.get().box).toMatchObject({ rackId: 'rack-a', unit: 10 })
    addSession.clear()
    expect(addSession.get()).toEqual({})
    expect(heard).toHaveBeenCalledTimes(3)
    stop()
  })

  it('opening the box again on the same unit gives a new token', () => {
    const req = { item: { type: 'panel' } as const, rackId: 'rack-a', unit: 4 }
    addSession.openBox(req)
    const first = addSession.get().box!.token
    addSession.openBox(req)
    expect(addSession.get().box!.token).not.toBe(first)
  })

  it('opening the box ends the pick; closeBox is quiet when no box is open', () => {
    addSession.pick({ type: 'panel' })
    addSession.openBox({ item: { type: 'panel' }, rackId: 'rack-a' })
    expect(addSession.get().picked).toBeUndefined()
    addSession.closeBox()
    expect(addSession.get()).toEqual({})
    const heard = vi.fn()
    const stop = addSession.subscribe(heard)
    addSession.closeBox()
    expect(heard).not.toHaveBeenCalled()
    stop()
  })

  it('remembers the last panel and HDF', () => {
    addSession.rememberPanel(12)
    addSession.rememberHdf(8, 3)
    expect(addSession.lastPanel()).toBe(12)
    expect(addSession.lastHdf()).toEqual({ rows: 8, height: 3 })
  })
})
