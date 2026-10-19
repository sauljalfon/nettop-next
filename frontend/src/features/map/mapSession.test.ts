import { describe, expect, it } from 'vitest'
import { createMapSession, type MapMode } from './mapSession'

describe('POL-14 the location highlight lives in the session', () => {
  const building = { kind: 'node', id: 'node-a' } as const

  it('sets, replaces and clears the highlight', () => {
    const session = createMapSession()
    expect(session.highlight()).toBeUndefined()
    session.setHighlight(building)
    expect(session.highlight()).toEqual(building)
    session.setHighlight({ kind: 'site', id: 'site-dr' })
    expect(session.highlight()).toEqual({ kind: 'site', id: 'site-dr' })
    session.setHighlight(undefined)
    expect(session.highlight()).toBeUndefined()
  })

  it('replaces the highlight object so subscribers can compare references', () => {
    const session = createMapSession()
    session.setHighlight(building)
    const before = session.highlight()
    session.setHighlight({ ...building })
    expect(session.highlight()).not.toBe(before)
  })

  it('does not alias the object it was given', () => {
    const session = createMapSession()
    const given = { kind: 'node' as const, id: 'node-a' }
    session.setHighlight(given)
    given.id = 'changed'
    expect(session.highlight()).toEqual(building)
  })

  it('notifies subscribers, and leaves the overview viewport alone', () => {
    const session = createMapSession()
    session.setOverviewViewport({ x: 1, y: 2, zoom: 0.5 })
    let calls = 0
    session.subscribe(() => calls++)
    session.setHighlight(building)
    session.setHighlight(undefined)
    expect(calls).toBe(2)
    expect(session.overviewViewport()).toEqual({ x: 1, y: 2, zoom: 0.5 })
  })
})

describe('POL-14 a fit request is handled once', () => {
  it('numbers requests and carries the cards to fit', () => {
    const session = createMapSession()
    expect(session.fitRequest()).toBeUndefined()
    session.requestFit(['EDGE-17', 'PANEL-A'])
    expect(session.fitRequest()).toEqual({
      ids: ['EDGE-17', 'PANEL-A'],
      serial: 1,
    })
    session.requestFit(['EDGE-17', 'PANEL-A'])
    expect(session.fitRequest()!.serial).toBe(2)
  })

  it('marks a request handled, never backwards', () => {
    const session = createMapSession()
    session.requestFit(['a'])
    session.requestFit(['b'])
    expect(session.fitHandled()).toBe(0)
    session.markFitHandled(2)
    session.markFitHandled(1)
    expect(session.fitHandled()).toBe(2)
  })

  it('does not change the overview viewport by itself', () => {
    const session = createMapSession()
    session.setOverviewViewport({ x: 3, y: 4, zoom: 0.5 })
    session.requestFit(['EDGE-17'])
    expect(session.overviewViewport()).toEqual({ x: 3, y: 4, zoom: 0.5 })
  })

  it('does not alias the list it was given', () => {
    const session = createMapSession()
    const ids = ['a']
    session.requestFit(ids)
    ids.push('b')
    expect(session.fitRequest()!.ids).toEqual(['a'])
  })
})

describe('POL-22 route view state', () => {
  it('is off by default and toggles', () => {
    const session = createMapSession()
    expect(session.routeView()).toBe(false)
    session.setRouteView(true)
    expect(session.routeView()).toBe(true)
    session.setRouteView(false)
    expect(session.routeView()).toBe(false)
  })

  it('leaves the map exactly as it was: viewport, open cards and highlight', () => {
    const session = createMapSession()
    session.setOverviewViewport({ x: 10, y: 20, zoom: 0.7 })
    session.toggleNode('n1')
    session.setHighlight({ kind: 'node', id: 'node-a' })
    const before = {
      viewport: session.overviewViewport(),
      open: session.openNodes(),
      highlight: session.highlight(),
    }
    session.setRouteView(true)
    session.setRouteView(false)
    expect(session.overviewViewport()).toEqual(before.viewport)
    expect(session.openNodes()).toBe(before.open)
    expect(session.highlight()).toEqual(before.highlight)
  })

  it('notifies subscribers when toggled', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    session.setRouteView(true)
    expect(calls).toBe(1)
  })
})

describe('CM-09 overview session state', () => {
  it('defaults: the overview is the default view, nothing open, nothing proposed', () => {
    const session = createMapSession()
    expect(session.view()).toBe('overview')
    expect(session.overviewViewport()).toBeUndefined()
    expect(session.overviewNeedsFit()).toBe(true)
    expect(session.openNodes().size).toBe(0)
    expect(session.proposedPosition('n1')).toBeUndefined()
    expect(session.proposedPositions().size).toBe(0)
  })

  it('has only the overview and Focus', () => {
    const views: MapMode[] = ['overview', 'focus']
    // @ts-expect-error the device map is gone
    const gone: MapMode = 'devices'
    expect(views).not.toContain(gone)
  })

  it('switches the view and notifies', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    session.setView('focus')
    expect(session.view()).toBe('focus')
    expect(calls).toBe(1)
    session.setView('focus')
    expect(calls).toBe(1)
    session.setView('overview')
    expect(session.view()).toBe('overview')
  })

  it('records its viewport and fits once until it has one', () => {
    const session = createMapSession()
    expect(session.overviewNeedsFit()).toBe(true)
    session.setOverviewViewport({ x: 5, y: 6, zoom: 0.5 })
    expect(session.overviewNeedsFit()).toBe(false)
    expect(session.overviewViewport()).toEqual({ x: 5, y: 6, zoom: 0.5 })
  })

  it('toggles open nodes by replacing the set', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    const empty = session.openNodes()
    session.toggleNode('a')
    const one = session.openNodes()
    expect(one).not.toBe(empty)
    expect([...one]).toEqual(['a'])
    expect(empty.size).toBe(0)
    session.toggleNode('b')
    session.toggleNode('a')
    expect([...session.openNodes()]).toEqual(['b'])
    expect(calls).toBe(3)
  })

  it('records proposed positions by node ID without sharing the caller object', () => {
    const session = createMapSession()
    const p = { x: 3, y: 4 }
    const before = session.proposedPositions()
    session.setProposedPosition('n9', p)
    p.x = 99
    expect(session.proposedPosition('n9')).toEqual({ x: 3, y: 4 })
    expect(session.proposedPositions()).not.toBe(before)
    expect(session.proposedPositions().get('n9')).toEqual({ x: 3, y: 4 })
  })

  it('resetOverview clears proposed positions and the viewport and bumps the version', () => {
    const session = createMapSession()
    session.setOverviewViewport({ x: 1, y: 1, zoom: 1 })
    session.setProposedPosition('n9', { x: 1, y: 1 })
    session.toggleNode('a')
    const version = session.overviewVersion()
    let calls = 0
    session.subscribe(() => calls++)
    session.resetOverview()
    expect(session.proposedPositions().size).toBe(0)
    expect(session.overviewNeedsFit()).toBe(true)
    expect(session.overviewVersion()).toBe(version + 1)
    expect(calls).toBe(1)
    // What is not the arrangement stays: open cards.
    expect([...session.openNodes()]).toEqual(['a'])
  })
})

describe('CM-10 focus session state', () => {
  it('defaults: no focus, one hop, nothing open', () => {
    const session = createMapSession()
    expect(session.focusId()).toBeUndefined()
    expect(session.hops()).toBe(1)
    expect(session.openGroups().size).toBe(0)
  })

  it('back from Focus returns to the overview, its viewport untouched', () => {
    const session = createMapSession()
    session.setView('overview')
    session.setOverviewViewport({ x: 1, y: 2, zoom: 0.7 })
    session.focusOn('a')
    expect(session.view()).toBe('focus')
    expect(session.focusId()).toBe('a')
    session.focusOn('b')
    expect(session.focusId()).toBe('b')
    session.back()
    expect(session.view()).toBe('overview')
    expect(session.overviewViewport()).toEqual({ x: 1, y: 2, zoom: 0.7 })
  })

  it('keeps the hops, clamped to 1–3', () => {
    const session = createMapSession()
    session.setHops(2)
    session.focusOn('a')
    expect(session.hops()).toBe(2)
    session.setHops(9)
    expect(session.hops()).toBe(3)
    session.setHops(0)
    expect(session.hops()).toBe(1)
    session.setHops(2.7)
    expect(session.hops()).toBe(2)
  })

  it('toggles open groups by replacing the set; focusOn clears them', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    const empty = session.openGroups()
    session.toggleGroup('g1')
    expect(session.openGroups()).not.toBe(empty)
    expect([...session.openGroups()]).toEqual(['g1'])
    session.toggleGroup('g1')
    expect(session.openGroups().size).toBe(0)
    session.toggleGroup('g2')
    session.focusOn('x')
    expect(session.openGroups().size).toBe(0)
    expect(calls).toBeGreaterThanOrEqual(4)
  })
})
