import { describe, expect, it, vi } from 'vitest'
import { chosenUnit, createPhysicalSession } from './physicalSession'
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

describe('D50 the rack level keeps its chosen unit and jack per rack, session-only', () => {
  const rows = [
    { kind: 'equipment' as const, equipmentId: 'rack-item' },
    { kind: 'free' as const, unit: 11 },
    { kind: 'equipment' as const, equipmentId: 'agg-03' },
    { kind: 'equipment' as const, equipmentId: 'hdf-02' },
  ]
  const ports = (id: string) => id !== 'rack-item'

  it('starts empty and notifies when a unit is chosen', () => {
    const s = createPhysicalSession()
    expect(s.rackView('r1')).toEqual({})
    const listener = vi.fn()
    s.subscribe(listener)
    s.chooseUnit('r1', 'agg-03')
    expect(s.rackView('r1')).toEqual({ equipmentId: 'agg-03' })
    expect(listener).toHaveBeenCalledTimes(1)
    s.chooseUnit('r1', 'agg-03')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the choice and the jack per rack, and a new unit drops the jack', () => {
    const s = createPhysicalSession()
    s.chooseUnit('r1', 'agg-03')
    s.selectJack('r1', 'agg-03:p1')
    s.chooseUnit('r2', 'hdf-02')
    expect(s.rackView('r1')).toEqual({
      equipmentId: 'agg-03',
      endpointId: 'agg-03:p1',
    })
    expect(s.rackView('r2')).toEqual({ equipmentId: 'hdf-02' })
    s.chooseUnit('r1', 'agg-03') // the same unit keeps its jack
    expect(s.rackView('r1').endpointId).toBe('agg-03:p1')
    s.chooseUnit('r1', 'hdf-02')
    expect(s.rackView('r1')).toEqual({ equipmentId: 'hdf-02' })
    s.selectJack('r1', undefined)
    expect(s.rackView('r1')).toEqual({ equipmentId: 'hdf-02' })
  })

  it('the default is the topmost equipment with ports; a choice that left the rack falls back', () => {
    expect(chosenUnit({}, rows, ports)).toBe('agg-03')
    expect(chosenUnit({ equipmentId: 'hdf-02' }, rows, ports)).toBe('hdf-02')
    expect(chosenUnit({ equipmentId: 'rack-item' }, rows, ports)).toBe(
      'rack-item',
    )
    expect(chosenUnit({ equipmentId: 'gone' }, rows, ports)).toBe('agg-03')
    expect(
      chosenUnit({}, [{ kind: 'free' as const, unit: 1 }], ports),
    ).toBeUndefined()
  })

  it('a rack with only a rack item defaults to nothing', () => {
    expect(
      chosenUnit(
        {},
        [{ kind: 'equipment' as const, equipmentId: 'rack-item' }],
        ports,
      ),
    ).toBeUndefined()
  })
})
