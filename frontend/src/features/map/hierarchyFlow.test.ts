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
import { litBy, type Selection } from './hierarchySelection'
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
    open?: ReadonlySet<string>
    installed?: InstalledSets
    selection?: Selection
  } = {},
) {
  const index = indexSnapshot(s)
  const h = buildHierarchies(index, opts.installed).get(opts.net ?? 'A')!
  const open = opts.open ?? new Set<string>()
  const layout = hierarchyLayout(h, { onlyProblems: !!opts.onlyProblems, open })
  const hs = buildHierarchies(index, opts.installed)
  const out = projectHierarchy({
    selection: opts.selection,
    lit: opts.selection && litBy(hs, index, opts.selection),
    h,
    layout,
    index,
    colors: networkColors(s.networks),
    marks: opts.route ? routeMarks(index, agg03Route()) : none,
    open,
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

describe('OV-02 the hierarchy projection', () => {
  it('projects the frames, the column heads, the tops, then the node cards, with the four node types', () => {
    const { nodes } = project(acceptanceSnapshot())
    expect(nodes.map((n) => n.type)).toEqual([
      'hierarchyFrame',
      'hierarchyFrame',
      'hierarchyLabel',
      'hierarchyLabel',
      'hierarchyLabel',
      'hierarchyTier',
      'hierarchyNode',
    ])
    for (const n of nodes) {
      expect(n.draggable).toBe(false)
      expect(n.connectable).toBe(false)
    }
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

  it('carries what a top shows: its name as a plain value, the role and the network colour', () => {
    const s = acceptanceSnapshot()
    const { nodes } = project(s)
    expect(node(nodes, 'BB-01').data).toMatchObject({
      id: 'BB-01',
      name: 'BB-01',
      role: 'backbone',
      color: networkColors(s.networks).get('A'),
      proposed: false,
    })
  })

  it('carries a frame: its AGGs by name, with "no BB" on one that reaches no top', () => {
    const { nodes } = project(acceptanceSnapshot())
    const frame = node(nodes, 'frame:AGG-03+AGG-08').data
    expect(frame).toMatchObject({
      groupKey: 'AGG-03+AGG-08',
      kind: 'aggs',
      nodes: 1,
      switches: 1,
    })
    expect(frame.aggs).toEqual([
      expect.objectContaining({ id: 'AGG-03', name: 'AGG-03', noTop: true }),
      expect.objectContaining({ id: 'AGG-08', name: 'AGG-08', noTop: true }),
    ])
    expect(node(nodes, 'frame:AGG-15').data).toMatchObject({
      nodes: 0,
      switches: 0,
    })
    const reached = project(twoTops()).nodes
    for (const a of node(reached, 'frame:AGG1+AGG2').data.aggs as {
      noTop: boolean
    }[])
      expect(a.noTop).toBe(false)
  })

  it('gives "Direct to BB" and "No AGG" frames no AGGs and their kind', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1')
      .sw('BB1', 'backbone', 'A')
      .sw('S', 'access', 'A', 'n1')
      .sw('LOST', 'access', 'A', 'n1')
    f.run('S', 'BB1')
    const { nodes } = project(f.snapshot())
    expect(node(nodes, 'frame:top').data).toMatchObject({
      kind: 'top',
      aggs: [],
      topKind: 'backbone',
    })
    expect(node(nodes, 'frame:none').data).toMatchObject({
      kind: 'none',
      aggs: [],
    })
  })

  it('says "N uplink to the top" in the title of an AGG that reaches fewer tops than there are', () => {
    const { nodes, edges } = project(twoTops())
    const aggs = node(nodes, 'frame:AGG1+AGG2').data.aggs as {
      id: string
      title?: string
    }[]
    expect(aggs.find((a) => a.id === 'AGG2')!.title).toBe('1 uplink to the top')
    expect(aggs.find((a) => a.id === 'AGG1')!.title).toBeUndefined()
    expect(edges.filter((e) => classes(e).includes('weak'))).toEqual([])
    expect(edges.every((e) => !('weak' in (e.data ?? {})))).toBe(true)
  })

  it('draws a line from each top to every frame whose AGGs it is cabled to, with their links', () => {
    const { edges, h } = project(twoTops())
    const lines = edges.filter((e) => e.id.startsWith('line:uplink:'))
    expect(lines.map((e) => e.id)).toEqual([
      'line:uplink:BB1|AGG1+AGG2',
      'line:uplink:BB2|AGG1+AGG2',
    ])
    const e = lines[0]
    expect(e).toMatchObject({
      source: 'BB1',
      target: 'frame:AGG1+AGG2',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'hierarchyLine',
    })
    expect(e.data).toMatchObject({
      kind: 'uplink',
      proposed: false,
      onRoute: false,
      hot: false,
    })
    // BB1 is cabled to both AGGs of the frame: both circuits' links, one line.
    const links = h.lines
      .filter((l) => l.a === 'BB1')
      .flatMap((l) => l.circuits.flatMap((c) => c.linkIds))
    expect(e.data!.linkIds).toEqual(links)
    expect(e.data!.count).toBe(2)
    expect(h.lines.some((l) => l.kind === 'peer')).toBe(false)
  })

  it('draws no line to a frame whose AGGs no top reaches', () => {
    const { edges } = project(acceptanceSnapshot())
    expect(edges.filter((e) => e.id.startsWith('line:uplink:'))).toEqual([])
  })

  it('draws a line from a frame to each of its cards, from the frame’s right to the card’s left', () => {
    const { edges } = project(acceptanceSnapshot())
    const g = edges.filter((e) => e.id.startsWith('group:'))
    expect(
      g.map((e) => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle]),
    ).toEqual([
      [
        'group:AGG-03+AGG-08|node-a',
        'frame:AGG-03+AGG-08',
        'AGG-03+AGG-08|node-a',
        'right',
        'left',
      ],
    ])
    expect(g.every((e) => e.type === 'hierarchyLine')).toBe(true)
  })

  it('draws the Direct to BB frame’s line from each top its switches reach, and none for No AGG', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1')
      .sw('BB1', 'backbone', 'A')
      .sw('S', 'access', 'A', 'n1')
    f.run('S', 'BB1')
    const { edges } = project(f.snapshot())
    expect(
      edges
        .filter((e) => e.id.startsWith('line:uplink:'))
        .map((e) => [e.source, e.target]),
    ).toEqual([['BB1', 'frame:top']])
    const lone = hierarchyFixture()
      .node('n1', 's1')
      .sw('S', 'access', 'A', 'n1')
    const { edges: e2, nodes } = project(lone.snapshot())
    expect(e2.filter((e) => e.id.startsWith('line:'))).toEqual([])
    expect(e2.map((e) => e.source)).toEqual(['frame:none'])
    expect(node(nodes, 'frame:none').type).toBe('hierarchyFrame')
  })

  it('carries a card: the fault count, the 2↑ count, and the rows of an open one', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall')
      .sw('BB1', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .sw('AGG2', 'aggregation', 'A')
      .sw('TWO', 'access', 'A', 'n1')
      .sw('UP', 'access', 'A', 'n1', 'Alpha')
      .sw('KID', 'access', 'A', 'n1', 'Beta')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('TWO', 'AGG1')
    f.run('TWO', 'AGG2')
    f.run('UP', 'AGG1')
    f.run('KID', 'UP')
    const s = f.snapshot()
    const card = (open: string[]) =>
      node(project(s, { open: new Set(open) }).nodes, 'AGG1+AGG2|n1').data
    expect(card([])).toMatchObject({
      key: 'AGG1+AGG2|n1',
      name: 'Hall',
      siteName: 'Main',
      switches: 3,
      faults: 1,
      twoUplinks: 1,
      open: false,
    })
    const open = card(['AGG1+AGG2|n1'])
    expect(open).toMatchObject({ open: true, faults: 1, twoUplinks: 1 })
    expect(open.rows).toMatchObject([
      { id: 'UP', name: 'Alpha', twoUplinks: false },
      { id: 'KID', name: 'Beta', twoUplinks: false, mark: 'chained' },
      { id: 'TWO', name: 'TWO', twoUplinks: true },
    ])
    expect(open.elsewhere).toEqual([])
  })

  it('carries the quiet line as parts: another card of this network, and other networks by their names', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall')
      .sw('AGG1', 'aggregation', 'A')
      .sw('AGG2', 'aggregation', 'A')
      .sw('S1', 'access', 'A', 'n1')
      .sw('S2', 'access', 'A', 'n1')
      .sw('B1', 'access', 'B', 'n1')
    f.run('S1', 'AGG1')
    f.run('S2', 'AGG2')
    const { nodes } = project(f.snapshot(), { open: new Set(['AGG1|n1']) })
    expect(node(nodes, 'AGG1|n1').data.elsewhere).toEqual([
      { own: true, networkName: 'Network A', count: 1 },
      { own: false, networkName: 'Network B', count: 1 },
    ])
  })

  it('marks proposed AGGs and node cards', () => {
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
    const { nodes, h } = project(s, { installed })
    expect(h.proposed.has('AGG-15')).toBe(true)
    const aggs = (key: string) =>
      node(nodes, `frame:${key}`).data.aggs as {
        id: string
        proposed: boolean
      }[]
    expect(aggs('AGG-15')[0].proposed).toBe(true)
    expect(aggs('AGG-03+AGG-08').map((a) => a.proposed)).toEqual([false, false])
    expect(node(nodes, 'AGG-03+AGG-08|node-a').data.proposed).toBe(false)
  })

  it('marks a proposed top line and node line in the Expansion shape', () => {
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
    const card = edges.find((e) => e.id === 'group:AGG1|n1')!
    expect(classes(card)).not.toContain('proposed')
  })

  it('lights, on a route, the AGG, the node card and the line to the card', () => {
    const { nodes, edges } = project(acceptanceSnapshot(), { route: true })
    const aggs = node(nodes, 'frame:AGG-03+AGG-08').data.aggs as {
      id: string
      onRoute: boolean
    }[]
    expect(aggs.map((a) => [a.id, a.onRoute])).toEqual([
      ['AGG-03', true],
      ['AGG-08', false],
    ])
    expect(node(nodes, 'BB-01').data.onRoute).toBe(false)
    expect(node(nodes, 'AGG-03+AGG-08|node-a').data.onRoute).toBe(true)
    expect(
      edges
        .filter((e) => e.id.startsWith('group:'))
        .map((e) => [e.id, classes(e).includes('on-route')]),
    ).toEqual([['group:AGG-03+AGG-08|node-a', true]])
  })

  it('leaves the frame’s line to a card unlit when the route reaches the card’s switch but not the frame’s AGGs', () => {
    const s = acceptanceSnapshot()
    const index = indexSnapshot(s)
    const h = buildHierarchies(index).get('A')!
    const layout = hierarchyLayout(h, { onlyProblems: false, open: new Set() })
    // A route from EDGE-17 straight to BB-01: the card and the BB, no AGG.
    const marks = {
      ...none,
      equipment: new Set(['EDGE-17', 'BB-01']),
    }
    const { edges, nodes } = projectHierarchy({
      h,
      layout,
      index,
      colors: networkColors(s.networks),
      marks,
      open: new Set(),
      highlighted: new Set(),
      hot: new Set(),
    })
    expect(node(nodes, 'AGG-03+AGG-08|node-a').data.onRoute).toBe(true)
    expect(node(nodes, 'BB-01').data.onRoute).toBe(true)
    expect(
      edges.find((e) => e.id === 'group:AGG-03+AGG-08|node-a')!.data!.onRoute,
    ).toBe(false)
  })

  it('lights a top line that shares a link with the route', () => {
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
    const layout = hierarchyLayout(h, { onlyProblems: false, open: new Set() })
    const { edges } = projectHierarchy({
      h,
      layout,
      index,
      colors: networkColors(s.networks),
      marks,
      open: new Set(),
      highlighted: new Set(),
      hot: new Set(),
    })
    const lit = edges.filter((e) => classes(e).includes('on-route'))
    expect(lit.map((e) => e.id)).toContain('line:uplink:BB1|AGG1+AGG2')
    expect(lit.map((e) => e.id)).not.toContain('line:uplink:BB2|AGG1+AGG2')
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

  it('marks highlighted and hot AGGs, and the lines of a hot AGG from the tops that reach it', () => {
    const { nodes, edges } = project(twoTops(), {
      highlighted: new Set(['AGG1']),
      hot: new Set(['AGG1']),
    })
    const aggs = node(nodes, 'frame:AGG1+AGG2').data.aggs as {
      id: string
      highlighted: boolean
      hot: boolean
    }[]
    expect(aggs.map((a) => [a.id, a.highlighted, a.hot])).toEqual([
      ['AGG1', true, true],
      ['AGG2', false, false],
    ])
    const hot = edges.filter((e) => classes(e).includes('hot')).map((e) => e.id)
    expect(hot).toEqual(
      expect.arrayContaining([
        'line:uplink:BB1|AGG1+AGG2',
        'line:uplink:BB2|AGG1+AGG2',
      ]),
    )
    // AGG2 is reached by BB1 only.
    const only = project(twoTops(), { hot: new Set(['AGG2']) })
    expect(
      only.edges.filter((e) => classes(e).includes('hot')).map((e) => e.id),
    ).toEqual(['line:uplink:BB1|AGG1+AGG2'])
  })

  it('with Only problems keeps only the frames with a marked card or an AGG with no BB', () => {
    const s = acceptanceSnapshot()
    const { nodes } = project(s, { onlyProblems: true })
    // Every AGG of the fixture has no BB: the frames stay, the clean card goes.
    expect(nodes.some((n) => n.id === 'frame:AGG-03+AGG-08')).toBe(true)
    expect(nodes.some((n) => n.id === 'AGG-03+AGG-08|node-a')).toBe(false)
    const clean = project(twoTops(), { onlyProblems: true })
    expect(clean.nodes.some((n) => n.type === 'hierarchyFrame')).toBe(false)
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
    const layout = hierarchyLayout(empty, {
      onlyProblems: false,
      open: new Set(),
    })
    const out = projectHierarchy({
      h: empty,
      layout,
      index,
      colors: networkColors(s.networks),
      marks: none,
      open: new Set(),
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

describe('OV-05 what a selection lights and dims on the tree', () => {
  const cardKey = (() => {
    const h = buildHierarchies(indexSnapshot(acceptanceSnapshot())).get('A')!
    return h.groups
      .flatMap((g) => g.nodes)
      .find((c) => c.switchIds.includes('EDGE-17'))!.key
  })()
  const OPEN = new Set([cardKey])
  const edge17: Selection = { kind: 'equipment', id: 'EDGE-17' }
  const emphasis = (nodes: HierarchyFlowNode[], id: string) =>
    (node(nodes, id).data as { emphasis?: string }).emphasis

  it('has no emphasis without a selection', () => {
    const { nodes, edges } = project(acceptanceSnapshot(), { open: OPEN })
    for (const n of nodes)
      expect((n.data as { emphasis?: string }).emphasis).toBeUndefined()
    for (const e of edges)
      expect((e.data as { emphasis?: string }).emphasis).toBeUndefined()
  })

  it('lights EDGE-17’s way up and dims the rest', () => {
    const { nodes, edges, h } = project(acceptanceSnapshot(), {
      open: OPEN,
      selection: edge17,
    })
    expect(emphasis(nodes, 'BB-01')).toBe('lit')
    expect(emphasis(nodes, cardKey)).toBe('lit')
    expect(emphasis(nodes, `frame:${h.groups[0].key}`)).toBe('lit')
    const frames = nodes.filter((n) => n.type === 'hierarchyFrame')
    expect(
      frames.map((n) => (n.data as { emphasis?: string }).emphasis).sort(),
    ).toEqual(['dim', 'lit'])
    const card = node(nodes, cardKey).data as {
      rows: { id: string; emphasis?: string; selected: boolean }[]
    }
    expect(card.rows).toMatchObject([
      { id: 'EDGE-17', emphasis: 'lit', selected: true },
    ])
    const lines = Object.fromEntries(
      edges.map((e) => [e.id, (e.data as { emphasis?: string }).emphasis]),
    )
    expect(lines[`group:${cardKey}`]).toBe('lit')
  })

  it('marks the selected AGG, and lights nothing for a selection on another network', () => {
    const agg = project(acceptanceSnapshot(), {
      selection: { kind: 'equipment', id: 'AGG-03' },
    })
    const frame = nodes_of(agg).find(
      (n) =>
        n.type === 'hierarchyFrame' &&
        (n.data as { aggs: unknown[] }).aggs.length === 2,
    )!
    const selected = (
      frame.data as { aggs: { id: string; selected: boolean }[] }
    ).aggs
    expect(selected.map((a) => [a.id, a.selected])).toEqual([
      ['AGG-03', true],
      ['AGG-08', false],
    ])
    const other = project(acceptanceSnapshot(), {
      selection: { kind: 'equipment', id: 'EDGE-22' },
    })
    for (const n of other.nodes)
      expect((n.data as { emphasis?: string }).emphasis).toBeUndefined()
  })

  it('lights a line when both its ends are lit, and dims the others', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall')
      .sw('BB', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .sw('AGG2', 'aggregation', 'A')
      .sw('S1', 'access', 'A', 'n1')
    f.run('BB', 'AGG1')
    f.run('BB', 'AGG2')
    f.run('S1', 'AGG1')
    const { edges } = project(f.snapshot(), {
      selection: { kind: 'equipment', id: 'S1' },
    })
    const lines = Object.fromEntries(
      edges.map((e) => [e.id, (e.data as { emphasis?: string }).emphasis]),
    )
    expect(lines).toEqual({
      'line:uplink:BB|AGG1': 'lit',
      'line:uplink:BB|AGG2': 'dim',
      'group:AGG1|n1': 'lit',
    })
  })

  it('marks a cut-off switch in an open card', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1', 'Hall')
      .sw('BB', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .sw('S1', 'access', 'A', 'n1')
    f.run('BB', 'AGG1')
    f.run('S1', 'AGG1')
    const { nodes } = project(f.snapshot(), {
      open: new Set(['AGG1|n1']),
      selection: { kind: 'equipment', id: 'AGG1' },
    })
    const rows = (
      node(nodes, 'AGG1|n1').data as { rows: { id: string; cutOff: boolean }[] }
    ).rows
    expect(rows).toMatchObject([{ id: 'S1', cutOff: true }])
  })
})
const nodes_of = (p: { nodes: HierarchyFlowNode[] }) => p.nodes
