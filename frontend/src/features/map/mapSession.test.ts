import { describe, expect, it } from 'vitest'
import { createMapSession, shownNetworks } from './mapSession'

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

  it('notifies subscribers, and leaves the hierarchy viewport alone', () => {
    const session = createMapSession()
    session.setHierarchyViewport({ x: 1, y: 2, zoom: 0.5 })
    let calls = 0
    session.subscribe(() => calls++)
    session.setHighlight(building)
    session.setHighlight(undefined)
    expect(calls).toBe(2)
    expect(session.hierarchyViewport()).toEqual({ x: 1, y: 2, zoom: 0.5 })
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

  it('does not change the hierarchy viewport by itself', () => {
    const session = createMapSession()
    session.setHierarchyViewport({ x: 3, y: 4, zoom: 0.5 })
    session.requestFit(['EDGE-17'])
    expect(session.hierarchyViewport()).toEqual({ x: 3, y: 4, zoom: 0.5 })
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
    session.setHierarchyViewport({ x: 10, y: 20, zoom: 0.7 })
    session.toggleNode('n1')
    session.setHighlight({ kind: 'node', id: 'node-a' })
    const before = {
      viewport: session.hierarchyViewport(),
      open: session.openNodes(),
      highlight: session.highlight(),
    }
    session.setRouteView(true)
    session.setRouteView(false)
    expect(session.hierarchyViewport()).toEqual(before.viewport)
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

describe('HI-07 hierarchy session state', () => {
  it('defaults: nothing open and no viewport', () => {
    const session = createMapSession()
    expect(session.hierarchyViewport()).toBeUndefined()
    expect(session.hierarchyNeedsFit()).toBe(true)
    expect(session.openNodes().size).toBe(0)
  })

  it('records its viewport and fits once until it has one', () => {
    const session = createMapSession()
    expect(session.hierarchyNeedsFit()).toBe(true)
    session.setHierarchyViewport({ x: 5, y: 6, zoom: 0.5 })
    expect(session.hierarchyNeedsFit()).toBe(false)
    expect(session.hierarchyViewport()).toEqual({ x: 5, y: 6, zoom: 0.5 })
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

  it('has no dragged-position state any more', () => {
    const session = createMapSession() as unknown as Record<string, unknown>
    for (const gone of [
      'proposedPositions',
      'proposedPosition',
      'setProposedPosition',
      'resetOverview',
      'overviewVersion',
      'overviewViewport',
      'setOverviewViewport',
      'overviewNeedsFit',
    ])
      expect(session[gone]).toBeUndefined()
  })
})

describe('OV-06 nothing of the retired Focus is left in the session', () => {
  it('has none of the view, the focus, the hops, back or the open groups', () => {
    const session = createMapSession() as unknown as Record<string, unknown>
    for (const gone of [
      'view',
      'setView',
      'focusId',
      'focusOn',
      'hops',
      'setHops',
      'back',
      'openGroups',
      'toggleGroup',
    ])
      expect(session[gone]).toBeUndefined()
  })
})

describe('HI-07 the hierarchy in the session', () => {
  const nets = (...ids: string[]) =>
    ids.map((id) => ({ id, name: `Network ${id}` }))

  it('shows the first chosen network that exists, else the snapshot’s first, else none', () => {
    expect(shownNetworks(['B'], nets('A', 'B'))).toEqual(['B'])
    expect(shownNetworks(['X', 'B'], nets('A', 'B'))).toEqual(['B'])
    expect(shownNetworks(['X'], nets('A', 'B'))).toEqual(['A'])
    expect(shownNetworks([], nets('A', 'B'))).toEqual(['A'])
    expect(shownNetworks(['A'], [])).toEqual([])
    expect(shownNetworks([], [])).toEqual([])
  })

  it('keeps the map’s own choice of network, replaced by showNetwork, and notifies', () => {
    const session = createMapSession()
    expect(session.networks()).toEqual([])
    let calls = 0
    session.subscribe(() => calls++)
    session.showNetwork('B')
    expect(session.networks()).toEqual(['B'])
    session.showNetwork('B')
    session.showNetwork('A')
    expect(session.networks()).toEqual(['A'])
    expect(calls).toBe(2)
  })

  it('remembers Only problems, off at first, and notifies on a change only', () => {
    const session = createMapSession()
    expect(session.onlyProblems()).toBe(false)
    let calls = 0
    session.subscribe(() => calls++)
    session.setOnlyProblems(true)
    session.setOnlyProblems(true)
    expect(session.onlyProblems()).toBe(true)
    session.setOnlyProblems(false)
    expect(calls).toBe(2)
  })

  it('records the hierarchy’s viewport, which needs a fit until one is recorded', () => {
    const session = createMapSession()
    expect(session.hierarchyViewport()).toBeUndefined()
    expect(session.hierarchyNeedsFit()).toBe(true)
    const v = { x: 1, y: 2, zoom: 0.5 }
    session.setHierarchyViewport(v)
    v.x = 99
    expect(session.hierarchyViewport()).toEqual({ x: 1, y: 2, zoom: 0.5 })
    expect(session.hierarchyNeedsFit()).toBe(false)
  })
})

describe('OV-06 the selection lives in the session', () => {
  it('reads back what was selected and clears it', () => {
    const session = createMapSession()
    expect(session.selection()).toBeUndefined()
    session.select({ kind: 'equipment', id: 'EDGE-17' })
    expect(session.selection()).toEqual({ kind: 'equipment', id: 'EDGE-17' })
    session.select({ kind: 'card', networkId: 'A', key: 'AGG1|n1' })
    expect(session.selection()).toEqual({
      kind: 'card',
      networkId: 'A',
      key: 'AGG1|n1',
    })
    session.clear()
    expect(session.selection()).toBeUndefined()
  })

  it('notifies on select and on clear, and on nothing else', () => {
    const session = createMapSession()
    let calls = 0
    session.subscribe(() => calls++)
    session.select({ kind: 'equipment', id: 'a' })
    session.clear()
    expect(calls).toBe(2)
  })

  it('opens nothing and changes no network and opens no node', () => {
    const session = createMapSession()
    session.showNetwork('B')
    session.toggleNode('x')
    const before = {
      networks: session.networks(),
      nodes: session.openNodes(),
    }
    session.select({ kind: 'card', networkId: 'A', key: 'AGG1|n1' })
    session.clear()
    expect({
      networks: session.networks(),
      nodes: session.openNodes(),
    }).toEqual(before)
  })
})
