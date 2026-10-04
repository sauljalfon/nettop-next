import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { createMapSession } from './mapSession'
import { boundaryId } from './focus'
import { projectMap, type MapInput } from './mapGraph'

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
    expect(edges.find((e) => e.data.linkIds.length === 3)!.label).toMatch(
      /3 cables/,
    )
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
    expect(edges.find((e) => e.data.linkIds.includes('A01'))!.label).toBe(
      '3 cables',
    )
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
    expect(a.label).toBe('3 cables · Network A')
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

describe('C09/C13 focus view', () => {
  const building = { kind: 'node', id: 'node-a' } as const
  const toSm = boundaryId(building, { kind: 'node', id: 'node-sm' })
  const focused = (expand = false) => {
    const session = createMapSession()
    session.setFocus(building)
    if (expand) session.toggleBundle(toSm)
    return session
  }

  it('shows only focused equipment and one boundary card per outside location', () => {
    const view = projectMap(input({ session: focused() }))
    expect(ids(view.nodes)).toEqual(['EDGE-17', 'PANEL-A'])
    expect(view.boundaries.map((b) => b.id)).toEqual([toSm])
    expect(view.boundaries[0].data.bundle.label).toBe(
      '3 cables to North Sub-main',
    )
  })

  it('draws the boundary as summary edges that keep every cable ID', () => {
    const { edges } = projectMap(input({ session: focused() }))
    const line = edges.find((e) => e.target === toSm || e.source === toSm)!
    expect(line.data.linkIds).toEqual(['A02', 'A06', 'A10'])
    expect(line.sourceHandle).toBe('summary')
    expect(line.targetHandle).toBe('summary')
    // No real edge reaches the hidden neighbor.
    expect(
      edges.some((e) => e.source === 'HDF-01' || e.target === 'HDF-01'),
    ).toBe(false)
  })

  it('expanding shows the real neighbor at its session position with real edges', () => {
    const session = focused()
    const all = projectMap(input({ session: createMapSession() }))
    const before = projectMap(input({ session }))
    session.toggleBundle(toSm)
    const after = projectMap(input({ session }))
    expect(ids(after.nodes)).toEqual(['EDGE-17', 'HDF-01', 'PANEL-A'])
    expect(after.boundaries[0].data.bundle.expanded).toBe(true)
    const hdf = after.nodes.find((n) => n.id === 'HDF-01')!
    // The first layout is deterministic, so the neighbor sits where the full map puts it.
    expect(hdf.position).toEqual(
      all.nodes.find((n) => n.id === 'HDF-01')!.position,
    )
    expect(
      after.edges
        .filter((e) => e.source === 'HDF-01' || e.target === 'HDF-01')
        .flatMap((e) => e.data.linkIds)
        .sort(),
    ).toEqual(['A02', 'A06', 'A10'])
    // The boundary summary lines are replaced by the real edges.
    expect(
      after.edges.some((e) => e.source === toSm || e.target === toSm),
    ).toBe(false)
    for (const n of before.nodes)
      expect(after.nodes.find((m) => m.id === n.id)!.position).toEqual(
        n.position,
      )
  })

  it('never moves a card when focusing, expanding or clearing', () => {
    const session = createMapSession()
    const full = projectMap(input({ session }))
    session.setFocus(building)
    const f = projectMap(input({ session }))
    session.toggleBundle(toSm)
    const e = projectMap(input({ session }))
    session.setFocus(undefined)
    const cleared = projectMap(input({ session }))
    for (const view of [f, e, cleared])
      for (const n of view.nodes)
        expect(n.position).toEqual(
          full.nodes.find((m) => m.id === n.id)!.position,
        )
    expect(cleared.boundaries).toEqual([])
    expect(cleared.nodes).toHaveLength(11)
  })

  it('records a boundary card position once and keeps it', () => {
    const session = focused()
    const first = projectMap(input({ session })).boundaries[0].position
    session.setPosition(toSm, { x: 777, y: 8 })
    expect(projectMap(input({ session })).boundaries[0].position).toEqual({
      x: 777,
      y: 8,
    })
    expect(first).not.toEqual({ x: 777, y: 8 })
  })

  it('gives boundary cards distinct positions', () => {
    const session = createMapSession()
    session.setFocus({ kind: 'node', id: 'node-core' })
    const positions = projectMap(input({ session })).boundaries.map(
      (b) => `${b.position.x},${b.position.y}`,
    )
    expect(positions).toHaveLength(2)
    expect(new Set(positions).size).toBe(2)
  })

  it('combines with the network filter', () => {
    const session = createMapSession()
    session.setFocus({ kind: 'node', id: 'node-core' })
    const view = projectMap(input({ session, networkId: 'A' }))
    expect(ids(view.nodes)).toEqual([
      'AGG-03',
      'AGG-08',
      'AGG-15',
      'BB-01',
      'HDF-02',
    ])
    expect(view.boundaries.map((b) => b.data.bundle.label)).toEqual([
      '4 cables to North Sub-main',
    ])
  })

  it('reveals a selected route outside the focus and hides it again on clear', () => {
    const session = focused()
    const routed = projectMap(input({ session, route: agg03Route() }))
    expect(ids(routed.nodes)).toEqual([
      'AGG-03',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
    expect(routed.boundaries).toEqual([])
    expect(
      routed.edges
        .filter((e) => e.data.highlighted)
        .map((e) => e.id)
        .sort(),
    ).toEqual(['A01', 'A02', 'A03', 'A04'])
    expect(ids(projectMap(input({ session })).nodes)).toEqual([
      'EDGE-17',
      'PANEL-A',
    ])
  })

  it('keeps manual facets working on focused cards', () => {
    const session = focused()
    session.toggleManual('PANEL-A', '2')
    const panel = projectMap(input({ session })).nodes.find(
      (n) => n.id === 'PANEL-A',
    )!
    expect(panel.data.facets.map((f) => f.label)).toEqual(['2'])
  })

  it('lets a card focus its own node from its location label', () => {
    const { nodes } = projectMap(input())
    expect(nodes.find((n) => n.id === 'EDGE-17')!.data.focusNode).toEqual(
      building,
    )
  })

  it('ignores a focus that is not in this snapshot', () => {
    const session = createMapSession()
    session.setFocus({ kind: 'node', id: 'gone' })
    const view = projectMap(input({ session }))
    expect(view.nodes).toHaveLength(11)
    expect(view.boundaries).toEqual([])
  })
})
