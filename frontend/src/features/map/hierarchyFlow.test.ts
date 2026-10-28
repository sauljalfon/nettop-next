import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { routeMarks } from '../physical/inventory'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { buildHierarchies, type InstalledSets } from './hierarchy'
import { hierarchyFixture } from './hierarchyFixture'
import {
  highlightedCards,
  hotCards,
  projectHierarchy,
  type HierarchyFlowNode,
} from './hierarchyFlow'
import { hierarchyLayout } from './hierarchyLayout'
import { networkColors } from './networkColors'
import { indexSnapshot } from './snapshotIndex'

const none = routeMarks(indexSnapshot(acceptanceSnapshot()), undefined)

function project(
  s: Snapshot,
  opts: {
    net?: string
    route?: boolean
    highlighted?: ReadonlySet<string>
    hot?: ReadonlySet<string>
    onlyProblems?: boolean
    installed?: InstalledSets
  } = {},
) {
  const index = indexSnapshot(s)
  const h = buildHierarchies(index, opts.installed).get(opts.net ?? 'A')!
  const layout = hierarchyLayout(h, { onlyProblems: !!opts.onlyProblems })
  const out = projectHierarchy({
    h,
    layout,
    index,
    colors: networkColors(s.networks),
    marks: opts.route ? routeMarks(index, agg03Route()) : none,
    highlighted: opts.highlighted ?? new Set(),
    hot: opts.hot ?? new Set(),
  })
  return { h, layout, index, ...out }
}
const node = (nodes: HierarchyFlowNode[], id: string) =>
  nodes.find((n) => n.id === id)!
const classes = (e: { className?: string }) =>
  (e.className ?? '').split(' ').filter(Boolean)

/** Two BBs, two AGGs (AGG2 reaches only BB1), one switch under both. */
function twoTops() {
  const f = hierarchyFixture()
    .site('s1', 'Main')
    .node('n1', 's1', 'Hall 1')
    .sw('BB1', 'backbone', 'A')
    .sw('BB2', 'backbone', 'A')
    .sw('AGG1', 'aggregation', 'A')
    .sw('AGG2', 'aggregation', 'A')
    .sw('S', 'access', 'A', 'n1')
  f.run('BB1', 'AGG1')
  f.run('BB2', 'AGG1')
  f.run('BB1', 'AGG2')
  f.run('S', 'AGG1')
  f.run('S', 'AGG2')
  return f.snapshot()
}

describe('HI-06 the hierarchy projection', () => {
  it('projects frames first and behind, then labels, tier cards and node cards, with the four node types', () => {
    const { nodes } = project(acceptanceSnapshot())
    expect(nodes.map((n) => n.type)).toEqual([
      'hierarchyFrame',
      'hierarchyFrame',
      'hierarchyLabel',
      'hierarchyLabel',
      'hierarchyLabel',
      'hierarchyTier',
      'hierarchyTier',
      'hierarchyTier',
      'hierarchyTier',
      'hierarchyNode',
    ])
    for (const n of nodes) {
      expect(n.draggable).toBe(false)
      expect(n.connectable).toBe(false)
    }
    expect(node(nodes, 'frame:AGG-03+AGG-08').zIndex).toBeLessThan(0)
  })

  it('puts every box where the layout says, at its size', () => {
    const { nodes, layout } = project(acceptanceSnapshot())
    for (const [id, b] of layout.boxes) {
      const n = node(nodes, id)
      expect(n.position).toEqual({ x: b.x, y: b.y })
      expect(n.style).toMatchObject({ width: b.w, height: b.h })
    }
    for (const [key, b] of layout.frames) {
      const n = node(nodes, `frame:${key}`)
      expect(n.position).toEqual({ x: b.x, y: b.y })
      expect(n.style).toMatchObject({ width: b.w, height: b.h })
    }
  })

  it('carries what the cards show: names as plain values, counts and the network colour', () => {
    const s = acceptanceSnapshot()
    const { nodes } = project(s)
    expect(node(nodes, 'AGG-03').data).toMatchObject({
      id: 'AGG-03',
      name: 'AGG-03',
      role: 'aggregation',
      color: networkColors(s.networks).get('A'),
      uplinkText: undefined,
    })
    const card = node(nodes, 'AGG-03+AGG-08|node-a').data
    expect(card).toMatchObject({
      key: 'AGG-03+AGG-08|node-a',
      name: 'Building A',
      siteName: 'Main Campus',
      switches: 1,
      twoUplinks: 1,
      chained: 0,
      problem: false,
    })
    expect(node(nodes, 'frame:AGG-03+AGG-08').data).toMatchObject({
      groupKey: 'AGG-03+AGG-08',
      kind: 'aggs',
      nodes: 1,
      switches: 1,
      withProblems: 0,
      onlyProblems: false,
      empty: false,
    })
    expect(node(nodes, 'frame:AGG-15').data).toMatchObject({
      nodes: 0,
      switches: 0,
    })
  })

  it('says "N uplink to the top" on an AGG that reaches fewer tops than there are, and draws no line weak', () => {
    const { nodes, edges } = project(twoTops())
    expect(node(nodes, 'AGG2').data.uplinkText).toBe('1 uplink to the top')
    expect(node(nodes, 'AGG1').data.uplinkText).toBeUndefined()
    expect(edges.filter((e) => classes(e).includes('weak'))).toEqual([])
    expect(edges.every((e) => !('weak' in (e.data ?? {})))).toBe(true)
  })

  it('carries an AGG’s noTop: true for an AGG with no cable to a BB, false for the rest', () => {
    const { nodes } = project(acceptanceSnapshot())
    expect(node(nodes, 'AGG-03').data.noTop).toBe(true)
    expect(node(nodes, 'BB-01').data.noTop).toBe(false)
    const reached = project(twoTops()).nodes
    expect(node(reached, 'AGG1').data.noTop).toBe(false)
    expect(node(reached, 'BB1').data.noTop).toBe(false)
  })

  it('draws one line per tier line: an uplink from the top’s bottom to the AGG’s top, with its links', () => {
    const { edges, h } = project(twoTops())
    const lines = edges.filter(
      (e) => e.type === 'hierarchyLine' && e.id.startsWith('line:'),
    )
    expect(lines.map((e) => e.id)).toEqual(h.lines.map((l) => `line:${l.key}`))
    const e = edges.find((x) => x.id === 'line:uplink:BB1|AGG1')!
    expect(e).toMatchObject({
      source: 'BB1',
      target: 'AGG1',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })
    expect(e.data).toMatchObject({
      kind: 'uplink',
      proposed: false,
      onRoute: false,
      hot: false,
    })
    expect(e.data!.linkIds).toEqual(
      h.lines
        .find((l) => l.key === 'uplink:BB1|AGG1')!
        .circuits.flatMap((c) => c.linkIds),
    )
  })

  it('draws a peer link straight from one card’s side to the other’s, with the class peer', () => {
    const f = hierarchyFixture()
      .node('n1', 's1')
      .sw('AGG1', 'aggregation', 'A')
      .sw('AGG2', 'aggregation', 'A')
      .sw('S', 'access', 'A', 'n1')
      .sw('T', 'access', 'A', 'n1')
    f.run('AGG1', 'AGG2')
    f.run('S', 'AGG1')
    f.run('T', 'AGG2')
    const { edges, layout } = project(f.snapshot())
    const e = edges.find((x) => x.id === 'line:peer:AGG1|AGG2')!
    expect(classes(e)).toContain('peer')
    expect(e.data).toMatchObject({ kind: 'peer' })
    const left = layout.boxes.get(e.source)!
    const right = layout.boxes.get(e.target)!
    expect(left.x).toBeLessThan(right.x)
    expect([e.sourceHandle, e.targetHandle]).toEqual(['right', 'left'])
  })

  it('draws one group line from each AGG to its frame’s top', () => {
    const { edges } = project(acceptanceSnapshot())
    const g = edges.filter((e) => e.id.startsWith('group:'))
    expect(
      g.map((e) => [e.source, e.target, e.sourceHandle, e.targetHandle]),
    ).toEqual([
      ['AGG-03', 'frame:AGG-03+AGG-08', 'bottom', 'top'],
      ['AGG-08', 'frame:AGG-03+AGG-08', 'bottom', 'top'],
      ['AGG-15', 'frame:AGG-15', 'bottom', 'top'],
    ])
    expect(g.every((e) => e.type === 'hierarchyLine')).toBe(true)
  })

  it('draws the Under the top group’s lines from each top it reaches', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1')
      .sw('BB1', 'backbone', 'A')
      .sw('S', 'access', 'A', 'n1')
    f.run('S', 'BB1')
    const { edges } = project(f.snapshot())
    expect(
      edges
        .filter((e) => e.id.startsWith('group:'))
        .map((e) => [e.source, e.target]),
    ).toEqual([['BB1', 'frame:top']])
  })

  it('has no group line for No AGG', () => {
    const f = hierarchyFixture().node('n1', 's1').sw('S', 'access', 'A', 'n1')
    const { edges, nodes } = project(f.snapshot())
    expect(edges).toEqual([])
    expect(node(nodes, 'none').type).toBe('hierarchyTier')
    expect(node(nodes, 'none').data).toMatchObject({ kind: 'none' })
  })

  it('marks proposed cards and lines: tier cards, node cards, lines, group lines', () => {
    const s = acceptanceSnapshot()
    const installed: InstalledSets = {
      equipment: new Set(
        s.equipment.map((e) => e.id).filter((id) => id !== 'AGG-15'),
      ),
      links: new Set(s.links.map((l) => l.id)),
      containers: new Set([
        ...s.sites.map((x) => x.id),
        ...s.nodes.map((x) => x.id),
        ...s.racks.map((x) => x.id),
      ]),
    }
    const { nodes, edges, h } = project(s, { installed })
    expect(h.proposed.has('AGG-15')).toBe(true)
    expect(node(nodes, 'AGG-15').data.proposed).toBe(true)
    expect(node(nodes, 'AGG-03').data.proposed).toBe(false)
    expect(node(nodes, 'AGG-03+AGG-08|node-a').data.proposed).toBe(false)
    // A group line is proposed when its group says so.
    for (const e of edges.filter((x) => x.id.startsWith('group:'))) {
      const g = h.groups.find((x) => `frame:${x.key}` === e.target)!
      expect(classes(e).includes('proposed')).toBe(
        g.proposedFrom.includes(e.source),
      )
    }
  })

  it('marks a proposed tier line and node card in the Expansion shape', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall')
      .sw('BB1', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .sw('S', 'access', 'A', 'n1')
    f.run('S', 'AGG1')
    const installed = f.snapshot()
    f.run('BB1', 'AGG1')
    const planned = f.snapshot()
    const set: InstalledSets = {
      equipment: new Set(installed.equipment.map((e) => e.id)),
      links: new Set(installed.links.map((l) => l.id)),
      containers: new Set(['s1', 'n1', 'rack-n1']),
    }
    const { edges } = project(planned, { installed: set })
    const line = edges.find((e) => e.id === 'line:uplink:BB1|AGG1')!
    expect(classes(line)).toContain('proposed')
    expect(line.data).toMatchObject({ proposed: true })
  })

  it('lights, on a route, the tier cards, node cards and lines it touches, and the group line whose AGG and a card are lit', () => {
    const { nodes, edges } = project(acceptanceSnapshot(), { route: true })
    expect(node(nodes, 'AGG-03').data.onRoute).toBe(true)
    expect(node(nodes, 'AGG-08').data.onRoute).toBe(false)
    expect(node(nodes, 'BB-01').data.onRoute).toBe(false)
    expect(node(nodes, 'AGG-03+AGG-08|node-a').data.onRoute).toBe(true)
    const group = edges.filter((e) => e.id.startsWith('group:'))
    expect(
      group.map((e) => [e.source, classes(e).includes('on-route')]),
    ).toEqual([
      ['AGG-03', true],
      ['AGG-08', false],
      ['AGG-15', false],
    ])
  })

  it('lights a tier line that shares a link with the route', () => {
    const s = twoTops()
    const index = indexSnapshot(s)
    const h = buildHierarchies(index).get('A')!
    const link = h.lines.find((l) => l.key === 'uplink:BB1|AGG1')!.circuits[0]
      .linkIds[0]
    const marks = routeMarks(index, {
      start: 'x',
      end: 'y',
      destinationEquipmentId: 'AGG1',
      destinationRole: 'aggregation',
      destinationNetworkId: 'A',
      sourceNetworkId: 'A',
      hops: [{ linkId: link, from: 'BB1:p1', to: 'AGG1:p1', kind: 'cable' }],
    })
    const layout = hierarchyLayout(h, { onlyProblems: false })
    const { edges } = projectHierarchy({
      h,
      layout,
      index,
      colors: networkColors(s.networks),
      marks,
      highlighted: new Set(),
      hot: new Set(),
    })
    const lit = edges.filter((e) => classes(e).includes('on-route'))
    expect(lit.map((e) => e.id)).toContain('line:uplink:BB1|AGG1')
    expect(lit.map((e) => e.id)).not.toContain('line:uplink:BB2|AGG1')
  })

  it('leaves every box where it was when the route, the highlight or the hot set changes', () => {
    const s = acceptanceSnapshot()
    const before = project(s)
    const after = project(s, {
      route: true,
      highlighted: new Set(['AGG-03+AGG-08|node-a']),
      hot: new Set(['AGG-03']),
    })
    const at = (r: typeof before) =>
      r.nodes.map((n) => [n.id, n.position, n.style])
    expect(at(after)).toEqual(at(before))
    expect(after.edges.map((e) => e.id)).toEqual(before.edges.map((e) => e.id))
  })

  it('never dims: the route leaves every card undimmed, and no class named dimmed exists', () => {
    const { nodes, edges } = project(acceptanceSnapshot(), { route: true })
    for (const n of nodes) expect(n.data).not.toHaveProperty('dimmed')
    for (const e of edges) expect(classes(e)).not.toContain('dimmed')
  })

  it('marks highlighted and hot cards, and the lines of hot AGGs', () => {
    const { nodes, edges } = project(twoTops(), {
      highlighted: new Set(['AGG1']),
      hot: new Set(['AGG1']),
    })
    expect(node(nodes, 'AGG1').data).toMatchObject({
      highlighted: true,
      hot: true,
    })
    expect(node(nodes, 'AGG2').data).toMatchObject({
      highlighted: false,
      hot: false,
    })
    const hot = edges.filter((e) => classes(e).includes('hot')).map((e) => e.id)
    expect(hot).toEqual(
      expect.arrayContaining(['line:uplink:BB1|AGG1', 'line:uplink:BB2|AGG1']),
    )
    expect(hot).not.toContain('line:uplink:BB1|AGG2')
  })

  it('with Only problems tells each frame, and says "No problems here" when none shows', () => {
    const s = acceptanceSnapshot()
    const { nodes } = project(s, { onlyProblems: true })
    const frame = node(nodes, 'frame:AGG-03+AGG-08').data
    expect(frame).toMatchObject({ onlyProblems: true, empty: true, nodes: 1 })
    expect(nodes.some((n) => n.id === 'AGG-03+AGG-08|node-a')).toBe(false)
  })

  it('projects nothing for a network with nothing in it', () => {
    const s = acceptanceSnapshot()
    const index = indexSnapshot(s)
    const h = buildHierarchies(index).get('A')!
    const empty = {
      ...h,
      topIds: [],
      aggIds: [],
      lines: [],
      groups: [],
      topKind: 'none' as const,
    }
    const layout = hierarchyLayout(empty, { onlyProblems: false })
    const out = projectHierarchy({
      h: empty,
      layout,
      index,
      colors: networkColors(s.networks),
      marks: none,
      highlighted: new Set(),
      hot: new Set(),
    })
    expect(out).toEqual({ nodes: [], edges: [] })
  })
})

describe('HI-06 highlightedCards', () => {
  const s = acceptanceSnapshot()
  const index = indexSnapshot(s)
  const h = buildHierarchies(index).get('A')!

  it('is empty with no location, or a location the snapshot does not have', () => {
    expect(highlightedCards(h, index, undefined).size).toBe(0)
    expect(highlightedCards(h, index, { kind: 'node', id: 'gone' }).size).toBe(
      0,
    )
  })

  it('marks the node cards of a node, and the tier cards placed there', () => {
    const got = highlightedCards(h, index, { kind: 'node', id: 'node-a' })
    expect(got.has('AGG-03+AGG-08|node-a')).toBe(true)
    for (const id of [...h.topIds, ...h.aggIds])
      expect(got.has(id)).toBe(index.places.get(id)?.nodeId === 'node-a')
  })

  it('marks every card of a site', () => {
    const site = index.places.get('EDGE-17')!.siteId!
    const got = highlightedCards(h, index, { kind: 'site', id: site })
    expect(got.has('AGG-03+AGG-08|node-a')).toBe(true)
    for (const id of [...h.topIds, ...h.aggIds])
      expect(got.has(id)).toBe(index.places.get(id)?.siteId === site)
  })
})

describe('HI-06 hotCards', () => {
  const index = indexSnapshot(acceptanceSnapshot())
  const h = buildHierarchies(index).get('A')!

  it('is empty with nothing selected, or a card the hierarchy does not have', () => {
    expect(hotCards(h, undefined).size).toBe(0)
    expect(hotCards(h, 'gone').size).toBe(0)
  })

  it('is the selected tier card alone', () => {
    expect([...hotCards(h, 'AGG-03')]).toEqual(['AGG-03'])
    expect([...hotCards(h, 'BB-01')]).toEqual(['BB-01'])
  })

  it('is a selected node card and the AGGs of its switches', () => {
    expect([...hotCards(h, 'AGG-03+AGG-08|node-a')].sort()).toEqual([
      'AGG-03',
      'AGG-03+AGG-08|node-a',
      'AGG-08',
    ])
  })
})
