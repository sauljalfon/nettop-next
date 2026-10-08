import { describe, expect, it, vi } from 'vitest'
import { createPhysicalSession } from './physicalSession'
import { SITES, type PhysicalLocation } from './location'

const site: PhysicalLocation = { level: 'site', siteId: 'site-main' }
const node: PhysicalLocation = {
  level: 'node',
  siteId: 'site-main',
  nodeId: 'node-sm',
}

describe('PHY-01 the physical session keeps location and history outside the Workspace', () => {
  it('starts at Sites with no history', () => {
    const s = createPhysicalSession()
    expect(s.location()).toEqual(SITES)
    expect(s.history().back).toHaveLength(0)
  })

  it('navigate pushes and back restores the exact location', () => {
    const s = createPhysicalSession()
    s.navigate(site)
    s.navigate(node)
    expect(s.location()).toEqual(node)
    expect(s.history().back).toHaveLength(2)
    s.back()
    expect(s.location()).toEqual(site)
    s.back()
    expect(s.location()).toEqual(SITES)
    s.back()
    expect(s.location()).toEqual(SITES)
  })

  it('replace swaps the location without growing the history', () => {
    const s = createPhysicalSession()
    s.navigate(site)
    s.replace(node)
    expect(s.location()).toEqual(node)
    expect(s.history().back).toHaveLength(1)
    s.back()
    expect(s.location()).toEqual(SITES)
  })

  it('notifies subscribers on a change and not on a no-op', () => {
    const s = createPhysicalSession()
    const listener = vi.fn()
    const off = s.subscribe(listener)
    s.navigate(site)
    expect(listener).toHaveBeenCalledTimes(1)
    s.navigate({ ...site })
    s.back()
    s.back() // nothing left to go back to
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    s.navigate(node)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('returns a new history object on each change (a store snapshot)', () => {
    const s = createPhysicalSession()
    const before = s.history()
    expect(s.history()).toBe(before)
    s.navigate(site)
    expect(s.history()).not.toBe(before)
  })

  it('keeps separate sessions apart', () => {
    const a = createPhysicalSession()
    const b = createPhysicalSession()
    a.navigate(site)
    expect(b.location()).toEqual(SITES)
  })
})

describe('a site screen fits once per site per session', () => {
  it('needs a fit until it is marked, per site', () => {
    const s = createPhysicalSession()
    expect(s.needsFit('site-main')).toBe(true)
    s.markFitted('site-main')
    expect(s.needsFit('site-main')).toBe(false)
    expect(s.needsFit('site-dr')).toBe(true)
  })

  it('a layout reset asks for one more fit of that site only', () => {
    const s = createPhysicalSession()
    s.markFitted('site-main')
    s.markFitted('site-dr')
    s.requestRefit('site-main')
    expect(s.needsFit('site-main')).toBe(true)
    expect(s.needsFit('site-dr')).toBe(false)
  })
})

describe('a site screen remembers its viewport for the session', () => {
  it('keeps one viewport per site, never persisted', () => {
    const s = createPhysicalSession()
    expect(s.viewport('site-main')).toBeUndefined()
    s.setViewport('site-main', { x: 1, y: 2, zoom: 0.5 })
    expect(s.viewport('site-main')).toEqual({ x: 1, y: 2, zoom: 0.5 })
    expect(s.viewport('site-dr')).toBeUndefined()
  })

  it('a refit request forgets that site’s viewport only', () => {
    const s = createPhysicalSession()
    s.setViewport('site-main', { x: 1, y: 2, zoom: 1 })
    s.setViewport('site-dr', { x: 3, y: 4, zoom: 1 })
    s.requestRefit('site-main')
    expect(s.viewport('site-main')).toBeUndefined()
    expect(s.viewport('site-dr')).toEqual({ x: 3, y: 4, zoom: 1 })
  })
})
