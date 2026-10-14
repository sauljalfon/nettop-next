import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { createMapSession } from './mapSession'
import { ROW_HEIGHT } from './layout'
import { projectMap, type MapInput } from './mapGraph'
import { PALETTE, UNRESOLVED_COLOR } from './networkColors'
import { pairKey } from './edges'
import { indexSnapshot } from './snapshotIndex'

function input(over: Partial<MapInput> = {}): MapInput {
  const snapshot = over.snapshot ?? acceptanceSnapshot()
  return {
    snapshot,
    session: createMapSession(),
    installedIDs: new Set(snapshot.equipment.map((e) => e.id)),
    installedLinkIDs: new Set(snapshot.links.map((l) => l.id)),
    ...over,
  }
}
const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id).sort()

describe('C01 default map', () => {
  it('shows one card per equipment with location, summary and role', () => {
    const { nodes } = projectMap(input())
    expect(nodes).toHaveLength(11)
    const edge = nodes.find((n) => n.id === 'EDGE-17')!
    expect(edge.data.location).toBe('Main Campus / Building A / Rack A03')
    expect(edge.data.summary).toEqual({ cabled: 3, total: 24 })
    expect(edge.data.equipment.role).toBe('access')
    expect(edge.data.facets).toEqual([])
  })

  it('draws every actual cable once, directly or inside a bundle', () => {
    const { edges } = projectMap(input())
    const cables = acceptanceSnapshot()
      .links.filter((l) => l.kind === 'cable')
      .map((l) => l.id)
      .sort()
    expect(edges.flatMap((e) => e.data.linkIds).sort()).toEqual(cables)
    expect(
      edges.find((e) => e.data.linkIds.length === 3)!.label,
    ).toBeUndefined()
  })

  it('lays out left to right and orients every edge the same way', () => {
    const { nodes, edges } = projectMap(input())
    const x = new Map(nodes.map((n) => [n.id, n.position.x]))
    for (const e of edges)
      expect(x.get(e.source)!).toBeLessThanOrEqual(x.get(e.target)!)
  })

  it('records first-layout positions so later projections never recompute them', () => {
    const session = createMapSession()
    const first = projectMap(input({ session }))
    const grown = acceptanceSnapshot()
    grown.equipment.push({
      id: 'NEW',
      name: 'NEW',
      kind: 'switch',
      role: 'access',
      networkId: 'A',
      rackId: 'rack-a03',
      unit: 5,
      height: 1,
    })
    const second = projectMap(input({ session, snapshot: grown }))
    for (const n of first.nodes)
      expect(second.nodes.find((m) => m.id === n.id)!.position).toEqual(
        n.position,
      )
    const placed = second.nodes.find((n) => n.id === 'NEW')!.position
    expect(
      second.nodes.filter(
        (n) => n.position.x === placed.x && n.position.y === placed.y,
      ),
    ).toHaveLength(1)
  })

  it('uses a position the user dragged to', () => {
    const session = createMapSession()
    session.setPosition('AGG-03', { x: 1234, y: 56 })
    const { nodes } = projectMap(input({ session }))
    expect(nodes.find((n) => n.id === 'AGG-03')!.position).toEqual({
      x: 1234,
      y: 56,
    })
  })

  it('marks proposed equipment and cables apart from installed ones', () => {
    const base = acceptanceSnapshot()
    const { nodes, edges } = projectMap(
      input({
        snapshot: base,
        installedIDs: new Set(
          base.equipment.filter((e) => e.id !== 'AGG-15').map((e) => e.id),
        ),
        installedLinkIDs: new Set(
          base.links.filter((l) => l.id !== 'B01').map((l) => l.id),
        ),
      }),
    )
    expect(nodes.find((n) => n.id === 'AGG-15')!.data.proposed).toBe(true)
    expect(nodes.find((n) => n.id === 'AGG-03')!.data.proposed).toBe(false)
    expect(edges.find((e) => e.id === 'B01')!.data.proposed).toBe(true)
    expect(edges.find((e) => e.id === 'B04')!.data.proposed).toBe(false)
  })
})

describe('C07 Network A filter', () => {
  const view = () => projectMap(input({ networkId: 'A' }))

  it('shows A devices and the passive equipment carrying A circuits', () => {
    expect(ids(view().nodes)).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
  })

  it('badges shared HDFs with both networks and keeps B circuits distinguishable', () => {
    const { nodes, edges } = view()
    expect(nodes.find((n) => n.id === 'HDF-01')!.data.badges).toEqual([
      'Network A',
      'Network B',
    ])
    expect(nodes.find((n) => n.id === 'PANEL-A')!.data.badges).toEqual([
      'Network A',
    ])
    const b = edges.find((e) => e.id === 'B03')!
    expect(b.label).toBe('Network B')
    expect(b.data.networkId).toBe('B')
    expect(
      edges.find((e) => e.data.linkIds.includes('A01'))!.label,
    ).toBeUndefined()
  })

  it('keeps positions identical to the unfiltered map', () => {
    const session = createMapSession()
    const all = projectMap(input({ session }))
    const filtered = projectMap(input({ session, networkId: 'A' }))
    for (const n of filtered.nodes)
      expect(n.position).toEqual(all.nodes.find((m) => m.id === n.id)!.position)
  })

  it('does not change what is cabled', () => {
    const s = acceptanceSnapshot()
    const before = JSON.stringify(s)
    projectMap(input({ snapshot: s, networkId: 'A' }))
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('C08 Network B filter', () => {
  it('shows the same shared chassis and none of the A devices', () => {
    const { nodes, edges } = projectMap(input({ networkId: 'B' }))
    expect(ids(nodes)).toEqual([
      'AGG-12',
      'EDGE-22',
      'HDF-01',
      'HDF-02',
      'PANEL-DR',
    ])
    const a = edges.find((e) => e.data.linkIds.includes('A03'))!
    expect(a.label).toBe('Network A')
    expect(a.data.networkId).toBe('A')
  })

  it('shows a selected route even when the filter would hide it', () => {
    const { nodes } = projectMap(input({ networkId: 'B', route: agg03Route() }))
    expect(ids(nodes)).toEqual(
      expect.arrayContaining([
        'AGG-03',
        'EDGE-17',
        'PANEL-A',
        'AGG-12',
        'EDGE-22',
      ]),
    )
  })
})

describe('C04/C06 route highlight and automatic facets', () => {
  const view = () => projectMap(input({ route: agg03Route() }))

  it('reveals only the route positions on each card', () => {
    const { nodes } = view()
    const labels = (id: string) =>
      nodes.find((n) => n.id === id)!.data.facets.map((f) => f.label)
    expect(labels('HDF-01')).toEqual(['3C / 5'])
    expect(labels('HDF-02')).toEqual(['2B / 3'])
    expect(labels('PANEL-A')).toEqual(['1'])
    expect(labels('BB-01')).toEqual([])
  })

  it('highlights exactly the route cables and attaches them to facet handles', () => {
    const { edges } = view()
    const lit = edges.filter((e) => e.data.highlighted)
    expect(lit.map((e) => e.id).sort()).toEqual(['A01', 'A02', 'A03', 'A04'])
    const a03 = edges.find((e) => e.id === 'A03')!
    expect(a03.sourceHandle).toBe('HDF-01:3C/5:f')
    expect(a03.targetHandle).toBe('HDF-02:2B/3:f')
    expect(
      edges.find((e) => e.data.linkIds.includes('A05'))!.data.highlighted,
    ).toBe(false)
  })

  it('does not move any card when the route changes or clears', () => {
    const session = createMapSession()
    const none = projectMap(input({ session }))
    const routed = projectMap(input({ session, route: agg03Route() }))
    const cleared = projectMap(input({ session }))
    for (const n of none.nodes) {
      expect(routed.nodes.find((m) => m.id === n.id)!.position).toEqual(
        n.position,
      )
      expect(cleared.nodes.find((m) => m.id === n.id)!.position).toEqual(
        n.position,
      )
    }
    expect(cleared.nodes.every((n) => n.data.facets.length === 0)).toBe(true)
  })
})

describe('C05 manual facets survive route selection, change and clear', () => {
  const withManual = () => {
    const session = createMapSession()
    session.toggleManual('HDF-01', '1A/2')
    return session
  }
  const hdf01 = (view: ReturnType<typeof projectMap>) =>
    view.nodes.find((n) => n.id === 'HDF-01')!.data

  it('shows a manual position with no route', () => {
    const data = hdf01(projectMap(input({ session: withManual() })))
    expect(data.facets.map((f) => f.label)).toEqual(['1A / 2'])
    expect(data.facets[0]).toMatchObject({ manual: true, automatic: false })
    expect(data.manualKeys).toEqual(['1A/2'])
  })

  it('keeps the manual facet while the automatic one follows the route', () => {
    const session = withManual()
    const labels = (route?: ReturnType<typeof agg03Route>) =>
      hdf01(projectMap(input({ session, route }))).facets.map((f) => f.label)
    expect(labels(agg03Route())).toEqual(['1A / 2', '3C / 5'])
    expect(labels(undefined)).toEqual(['1A / 2']) // Clear trace
  })

  it('shows a position that is both once, marked both ways', () => {
    const session = createMapSession()
    session.toggleManual('HDF-01', '3C/5')
    const facets = hdf01(
      projectMap(input({ session, route: agg03Route() })),
    ).facets
    expect(facets).toHaveLength(1)
    expect(facets[0]).toMatchObject({ manual: true, automatic: true })
  })

  it('attaches the cables of a manual facet to its handles without a route', () => {
    const { edges } = projectMap(input({ session: withManual() }))
    const a06 = edges.find((e) => e.id === 'A06')!
    expect(a06.targetHandle).toBe('HDF-01:1A/2:r')
  })

  it('does not move any card', () => {
    const session = createMapSession()
    const before = projectMap(input({ session }))
    session.toggleManual('HDF-01', '1A/2')
    const after = projectMap(input({ session }))
    for (const n of before.nodes)
      expect(after.nodes.find((m) => m.id === n.id)!.position).toEqual(
        n.position,
      )
  })
})

describe('POL-03 reset recomputes the first layered layout', () => {
  it('puts every card back where a fresh session lays it out', () => {
    const fresh = projectMap(input({ session: createMapSession() }))
    const session = createMapSession()
    projectMap(input({ session }))
    for (const n of fresh.nodes) session.setPosition(n.id, { x: 5000, y: 5000 }) // dragged away
    session.resetLayout()
    const after = projectMap(input({ session }))
    for (const n of fresh.nodes)
      expect(after.nodes.find((m) => m.id === n.id)!.position).toEqual(
        n.position,
      )
  })

  it('keeps pinned facets, the highlight, the network filter and the route', () => {
    const session = createMapSession()
    session.setHighlight({ kind: 'node', id: 'node-a' })
    session.toggleManual('PANEL-A', '2')
    const view = () =>
      projectMap(input({ session, networkId: 'A', route: agg03Route() }))
    const before = view()
    session.resetLayout()
    const after = view()
    expect(after.marks).toEqual(before.marks)
    expect(after.marks.highlightCards).toEqual(['EDGE-17', 'PANEL-A'])
    expect(after.marks.routeLinks).toEqual(['A01', 'A02', 'A03', 'A04'])
    const panel = after.nodes.find((n) => n.id === 'PANEL-A')!
    expect(panel.data.facets.map((f) => f.label).sort()).toEqual(['1', '2'])
  })
})

describe('POL-14 a location highlight: amber, neighbors lighter, the rest dimmed', () => {
  const node = (id: string) => {
    const session = createMapSession()
    session.setHighlight({ kind: 'node', id })
    return session
  }
  const role = (view: ReturnType<typeof projectMap>, id: string) =>
    view.nodes.find((n) => n.id === id)?.data.highlightRole
  const dimmed = (view: ReturnType<typeof projectMap>, id: string) =>
    view.nodes.find((n) => n.id === id)!.data.dimmed

  it("highlights Building A's equipment, the cables leaving it, and its neighbor", () => {
    const view = projectMap(input({ session: node('node-a') }))
    expect(role(view, 'EDGE-17')).toBe('card')
    expect(role(view, 'PANEL-A')).toBe('card')
    expect(role(view, 'HDF-01')).toBe('neighbor')
    expect(role(view, 'EDGE-22')).toBeUndefined()
    expect(view.marks).toMatchObject({
      highlightCards: ['EDGE-17', 'PANEL-A'],
      highlightNeighbors: ['HDF-01'],
      highlightLinks: ['A01', 'A02', 'A05', 'A06', 'A09', 'A10'],
    })
  })

  it('dims every other card and line, but keeps every card where it is', () => {
    const none = projectMap(input({ session: createMapSession() }))
    const view = projectMap(input({ session: node('node-a') }))
    expect(view.marks.dimmedCards).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-12',
      'AGG-15',
      'BB-01',
      'EDGE-22',
      'HDF-02',
      'PANEL-DR',
    ])
    expect(dimmed(view, 'EDGE-17')).toBe(false)
    expect(dimmed(view, 'HDF-01')).toBe(false) // the neighbor is not dimmed
    expect(dimmed(view, 'AGG-03')).toBe(true)
    for (const e of view.edges)
      expect(e.data.dimmed).toBe(!e.data.highlight && !e.data.highlighted)
    // The line between two dimmed cards is dimmed; the highlighted lines are not.
    expect(
      view.edges.find((e) => e.data.linkIds.includes('A03'))!.data.dimmed,
    ).toBe(true)
    expect(
      view.edges.find((e) => e.data.linkIds.includes('A01'))!.data,
    ).toMatchObject({
      highlight: true,
      dimmed: false,
    })
    for (const n of none.nodes)
      expect(view.nodes.find((m) => m.id === n.id)!.position).toEqual(
        n.position,
      )
  })

  it('dims nothing without a highlight', () => {
    const view = projectMap(input())
    expect(view.marks.dimmedCards).toEqual([])
    expect(view.marks.highlightCards).toEqual([])
    expect(
      view.nodes.every((n) => !n.data.dimmed && !n.data.highlightRole),
    ).toBe(true)
    expect(view.edges.every((e) => !e.data.dimmed && !e.data.highlight)).toBe(
      true,
    )
  })

  it('highlights a whole site', () => {
    const session = createMapSession()
    session.setHighlight({ kind: 'site', id: 'site-main' })
    const { marks } = projectMap(input({ session }))
    expect(marks.highlightCards).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
    expect(marks.highlightNeighbors).toEqual(['AGG-12', 'PANEL-DR'])
    expect(marks.dimmedCards).toEqual(['EDGE-22'])
  })

  it('ignores a location that is not in this snapshot', () => {
    const session = createMapSession()
    session.setHighlight({ kind: 'node', id: 'gone' })
    const view = projectMap(input({ session }))
    expect(view.marks.dimmedCards).toEqual([])
    expect(view.nodes).toHaveLength(11)
  })
})

describe('POL-16 highlight, route and network filter combine and clear independently', () => {
  const highlighted = () => {
    const session = createMapSession()
    session.setHighlight({ kind: 'node', id: 'node-a' })
    return session
  }

  it('shows the highlighted part even where the network filter would hide it', () => {
    const session = highlighted()
    const hidden = projectMap(
      input({ session: createMapSession(), networkId: 'B' }),
    )
    expect(ids(hidden.nodes)).not.toContain('EDGE-17')
    const view = projectMap(input({ session, networkId: 'B' }))
    expect(ids(view.nodes)).toEqual(
      expect.arrayContaining([
        'EDGE-17',
        'PANEL-A',
        'HDF-01',
        'EDGE-22',
        'AGG-12',
      ]),
    )
    expect(view.marks.highlightCards).toEqual(['EDGE-17', 'PANEL-A'])
    // The Network A device AGG-03 stays hidden: it is neither highlighted nor a neighbor.
    expect(ids(view.nodes)).not.toContain('AGG-03')
    session.setHighlight(undefined)
    expect(
      ids(projectMap(input({ session, networkId: 'B' })).nodes),
    ).not.toContain('EDGE-17')
  })

  it('keeps route cards and lines teal and never dims them', () => {
    const view = projectMap(
      input({ session: highlighted(), route: agg03Route() }),
    )
    // HDF-02 and AGG-03 are outside Building A, so they would be dimmed if they were not on the route.
    for (const id of ['AGG-03', 'HDF-01', 'HDF-02'])
      expect(view.nodes.find((n) => n.id === id)!.data).toMatchObject({
        highlighted: true,
        dimmed: false,
      })
    // Everything else outside Building A is dimmed, but no route card is.
    expect(view.marks.dimmedCards).toEqual([
      'AGG-08',
      'AGG-12',
      'AGG-15',
      'BB-01',
      'EDGE-22',
      'PANEL-DR',
    ])
    const a03 = view.edges.find((e) => e.id === 'A03')!
    expect(a03.data).toMatchObject({ highlighted: true, dimmed: false })
    const a04 = view.edges.find((e) => e.id === 'A04')!
    expect(a04.data).toMatchObject({ highlighted: true, dimmed: false })
  })

  it('draws a cable that is both on the route and highlighted as route, with the highlight beneath', () => {
    const view = projectMap(
      input({ session: highlighted(), route: agg03Route() }),
    )
    const a01 = view.edges.find((e) => e.data.linkIds.includes('A01'))!
    expect(a01.data).toMatchObject({
      highlighted: true,
      highlight: true,
      dimmed: false,
    })
  })

  it('clears independently: the route keeps the highlight and the highlight keeps the route', () => {
    const session = highlighted()
    const both = projectMap(input({ session, route: agg03Route() })).marks
    expect(both.routeLinks).toEqual(['A01', 'A02', 'A03', 'A04'])
    expect(both.highlightLinks).toEqual([
      'A01',
      'A02',
      'A05',
      'A06',
      'A09',
      'A10',
    ])

    const noRoute = projectMap(input({ session })).marks
    expect(noRoute.routeLinks).toEqual([])
    expect(noRoute.highlightLinks).toEqual(both.highlightLinks)
    expect(noRoute.dimmedCards.length).toBeGreaterThan(0)

    session.setHighlight(undefined)
    const noHighlight = projectMap(
      input({ session, route: agg03Route() }),
    ).marks
    expect(noHighlight.routeLinks).toEqual(both.routeLinks)
    expect(noHighlight.highlightCards).toEqual([])
    expect(noHighlight.dimmedCards).toEqual([])
  })

  it('combines all three: filter, highlight and route', () => {
    const view = projectMap(
      input({ session: highlighted(), networkId: 'B', route: agg03Route() }),
    )
    expect(view.marks.routeCards).toEqual([
      'AGG-03',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
    expect(view.marks.highlightCards).toEqual(['EDGE-17', 'PANEL-A'])
    // Network B's own cards are dimmed, since a highlight is on and they are not part of it.
    expect(view.marks.dimmedCards).toEqual(['AGG-12', 'EDGE-22', 'PANEL-DR'])
  })

  it('shows a highlighted card with its manual facets', () => {
    const session = highlighted()
    session.toggleManual('PANEL-A', '2')
    const panel = projectMap(input({ session })).nodes.find(
      (n) => n.id === 'PANEL-A',
    )!
    expect(panel.data.facets.map((f) => f.label)).toEqual(['2'])
  })
})

describe("marks: the projection's route and highlight IDs, for tests and tools", () => {
  it('has no marks without a route or a highlight', () => {
    expect(projectMap(input()).marks).toEqual({
      routeLinks: [],
      routeCards: [],
      highlightLinks: [],
      highlightCards: [],
      highlightNeighbors: [],
      dimmedCards: [],
      splitPairs: [],
      cards: expect.any(Array),
    })
  })

  it("lists the route's cables and cards, whatever is on screen", () => {
    const { marks } = projectMap(input({ route: agg03Route() }))
    expect(marks.routeLinks).toEqual(['A01', 'A02', 'A03', 'A04'])
    expect(marks.routeCards).toEqual([
      'AGG-03',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
  })

  it('lists only the cables of a bundle that are on the route', () => {
    // A01, A05 and A09 share a bundle between EDGE-17 and PANEL-A: only A01 is on this route.
    const { marks, edges } = projectMap(input({ route: agg03Route() }))
    expect(
      edges.some(
        (e) => e.data.linkIds.length > 1 && e.data.linkIds.includes('A05'),
      ),
    ).toBe(true)
    expect(marks.routeLinks).not.toContain('A05')
  })

  it('lists the shown cards, so a test can tell shown from drawn', () => {
    const { marks } = projectMap(input({ networkId: 'B' }))
    expect(marks.cards).toEqual([
      'AGG-12',
      'EDGE-22',
      'HDF-01',
      'HDF-02',
      'PANEL-DR',
    ])
  })
})

describe('POL-17/18 cable lines', () => {
  const bundle = (e: { data: { linkIds: string[] } }) =>
    e.data.linkIds.includes('A01')

  it('draws parallel cables as one line in the network color, widened by count', () => {
    const { edges } = projectMap(input())
    const line = edges.find(bundle)!
    expect(line.data.linkIds).toEqual(['A01', 'A05', 'A09'])
    expect(line.data.count).toBe(3)
    expect(line.data.color).toBe(PALETTE[0])
    expect(line.data.width).toBe(3.5)
    expect(line.data.split).toBe(false)
    const single = edges.find((e) => e.id === 'B03')!
    expect(single.data.count).toBe(1)
    expect(single.data.color).toBe(PALETTE[1])
    expect(single.data.width).toBe(1.5)
  })

  it('draws a cable with an unresolved network in grey', () => {
    const s = acceptanceSnapshot()
    s.networks = []
    const { edges } = projectMap(input({ snapshot: s }))
    expect(edges.every((e) => e.data.color === UNRESOLVED_COLOR)).toBe(true)
  })

  it('splits a pair into one offset line per cable, each keeping its ID', () => {
    const session = createMapSession()
    const key = pairKey('EDGE-17', 'PANEL-A', 'A')
    session.toggleSplit(key)
    const { edges, marks } = projectMap(input({ session }))
    const lines = edges.filter((e) => ['A01', 'A05', 'A09'].includes(e.id))
    expect(lines.map((e) => e.data.linkIds)).toEqual([
      ['A01'],
      ['A05'],
      ['A09'],
    ])
    expect(lines.map((e) => e.data.splitIndex)).toEqual([0, 1, 2])
    expect(lines.every((e) => e.data.splitCount === 3 && e.data.split)).toBe(
      true,
    )
    expect(lines.every((e) => e.data.pairKey === key)).toBe(true)
    expect(lines.every((e) => e.data.width === 1.5)).toBe(true)
    expect(marks.splitPairs).toEqual([key])
  })

  it('draws a joined pair again once toggled back', () => {
    const session = createMapSession()
    const key = pairKey('EDGE-17', 'PANEL-A', 'A')
    session.toggleSplit(key)
    session.toggleSplit(key)
    const { edges, marks } = projectMap(input({ session }))
    expect(edges.find(bundle)!.data.count).toBe(3)
    expect(marks.splitPairs).toEqual([])
  })

  it('keeps the route and highlight colors over the network color, joined and split', () => {
    const route = agg03Route()
    const session = createMapSession()
    const onRoute = (edges: ReturnType<typeof projectMap>['edges']) =>
      edges.filter((e) => e.data.highlighted)
    const joined = projectMap(input({ session, route }))
    expect(onRoute(joined.edges).length).toBeGreaterThan(0)
    session.toggleSplit(pairKey('EDGE-17', 'PANEL-A', 'A'))
    const split = projectMap(input({ session, route }))
    // Only A01 of the three split lines is on the route.
    expect(split.edges.find((e) => e.id === 'A01')!.data.highlighted).toBe(true)
    expect(split.edges.find((e) => e.id === 'A05')!.data.highlighted).toBe(
      false,
    )
  })

  it('gives card badges the same colors as the lines', () => {
    const { nodes } = projectMap(input())
    expect(nodes.find((n) => n.id === 'HDF-01')!.data.badgeColors).toEqual([
      PALETTE[0],
      PALETTE[1],
    ])
  })
})
