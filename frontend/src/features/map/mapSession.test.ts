import { describe, expect, it } from 'vitest'
import { createMapSession, shownNetworks } from './mapSession'

describe('D47 nothing of the node/site highlight is left in the session', () => {
  it('has no highlight and no fit request', () => {
    const session = createMapSession() as unknown as Record<string, unknown>
    for (const gone of [
      'highlight',
      'setHighlight',
      'fitRequest',
      'requestFit',
      'fitHandled',
      'markFitHandled',
    ])
      expect(session[gone]).toBeUndefined()
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

  it('remembers whether the Key is shown, hidden at first, and notifies on a change only', () => {
    const session = createMapSession()
    expect(session.keyShown()).toBe(false)
    let calls = 0
    session.subscribe(() => calls++)
    session.setKeyShown(true)
    session.setKeyShown(true)
    expect(session.keyShown()).toBe(true)
    session.setKeyShown(false)
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
