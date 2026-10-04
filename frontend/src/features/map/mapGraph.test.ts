import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { createMapSession } from './mapSession'
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
