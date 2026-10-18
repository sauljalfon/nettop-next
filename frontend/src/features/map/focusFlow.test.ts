import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { campusSnapshot } from './campusFixture'
import { buildFocus } from './focus'
import { focusLayout } from './focusLayout'
import { projectFocus, type FocusFlowNode } from './focusFlow'
import { networkColors } from './networkColors'
import { indexSnapshot } from './snapshotIndex'

function project(
  s: Snapshot,
  center: string,
  opts: {
    hops?: number
    cap?: number
    networkId?: string
    installedIds?: ReadonlySet<string>
    openGroups?: string[]
    selected?: string
  } = {},
) {
  const index = indexSnapshot(s)
  const focus = buildFocus(index, center, opts)
  const layout = focusLayout(index, focus)
  return {
    index,
    focus,
    layout,
    ...projectFocus({
      index,
      focus,
      layout,
      selected: opts.selected ?? '',
      networkId: opts.networkId,
      colors: networkColors(s.networks),
      installedIds: opts.installedIds,
      openGroups: new Set(opts.openGroups ?? []),
    }),
  }
}

const node = <T extends FocusFlowNode['type']>(
  nodes: FocusFlowNode[],
  id: string,
  type: T,
) => {
  const n = nodes.find((x) => x.id === id)!
  if (n.type !== type) throw new Error(`${id} is ${n.type}, not ${type}`)
  return n as Extract<FocusFlowNode, { type: T }>
}

describe('CM-10 focus projection: cards', () => {
  const s = acceptanceSnapshot()
  const p = project(s, 'EDGE-17')

  it('has the center, then the neighbours', () => {
    expect(p.nodes.map((n) => [n.id, n.type])).toEqual([
      ['EDGE-17', 'focusCenter'],
      ['AGG-03', 'focusCard'],
      ['AGG-08', 'focusCard'],
      ['BB-01', 'focusCard'],
    ])
  })

  it('carries what a card says: name, role, network, place, unit', () => {
    const c = node(p.nodes, 'EDGE-17', 'focusCenter')
    expect(c.data).toMatchObject({
      equipmentId: 'EDGE-17',
      name: 'EDGE-17',
      role: 'Access',
      networkId: 'A',
      unit: 1,
      place: ['Main Campus', 'Building A', 'Rack A03'],
      proposed: false,
      dimmed: false,
    })
    const agg = node(p.nodes, 'AGG-03', 'focusCard')
    expect(agg.data).toMatchObject({ role: 'Aggregation', side: 'right' })
    expect(agg.position).toBeDefined()
  })

  it('a passive card has no network badge', () => {
    const q = project(s, 'PANEL-A')
    expect(
      node(q.nodes, 'PANEL-A', 'focusCenter').data.networkId,
    ).toBeUndefined()
    expect(node(q.nodes, 'PANEL-A', 'focusCenter').data.role).toBe(
      'Patch panel',
    )
  })

  it('marks a card the plan adds, and dims another network’s card without hiding it', () => {
    const installed = new Set(s.equipment.map((e) => e.id))
    installed.delete('AGG-08')
    const q = project(s, 'EDGE-17', { installedIds: installed, networkId: 'B' })
    expect(node(q.nodes, 'AGG-08', 'focusCard').data.proposed).toBe(true)
    expect(node(q.nodes, 'AGG-03', 'focusCard').data.proposed).toBe(false)
    expect(q.nodes.filter((n) => n.type === 'focusCard')).toHaveLength(3)
    for (const id of ['AGG-03', 'AGG-08', 'BB-01'])
      expect(node(q.nodes, id, 'focusCard').data.dimmed).toBe(true)
    expect(node(q.nodes, 'EDGE-17', 'focusCenter').data.dimmed).toBe(false)
    const a = project(s, 'EDGE-17', { networkId: 'A' })
    expect(a.nodes.some((n) => 'dimmed' in n.data && n.data.dimmed)).toBe(false)
  })

  it('marks the selected equipment', () => {
    const q = project(s, 'EDGE-17', { selected: 'AGG-08' })
    expect(node(q.nodes, 'AGG-08', 'focusCard').data.selected).toBe(true)
    expect(node(q.nodes, 'AGG-03', 'focusCard').data.selected).toBe(false)
  })
})

describe('CM-10 focus projection: lines and labels', () => {
  const s = acceptanceSnapshot()

  it('one circuit reads as its via steps, names and places kept apart', () => {
    const { edges } = project(s, 'EDGE-17')
    const e = edges.find((x) => x.id === 'line:EDGE-17|AGG-03')!
    expect(e).toMatchObject({
      source: 'EDGE-17',
      target: 'AGG-03',
      type: 'focusLine',
    })
    expect(e.data!.label).toEqual({
      kind: 'steps',
      steps: [
        { name: 'PANEL-A', place: '1' },
        { name: 'HDF-01', place: '3C/5' },
        { name: 'HDF-02', place: '2B/3' },
      ],
      more: 0,
    })
    expect(e.data!.pill).toBeDefined()
  })

  it('no via steps reads "direct"', () => {
    const t = acceptanceSnapshot()
    t.links.push({ id: 'X1', kind: 'cable', a: 'EDGE-17:p4', b: 'AGG-15:p1' })
    const e = project(t, 'EDGE-17').edges.find(
      (x) => x.id === 'line:EDGE-17|AGG-15',
    )!
    expect(e.data!.label).toEqual({ kind: 'direct' })
  })

  it('several circuits read "N circuits"', () => {
    const t = acceptanceSnapshot()
    t.links.push({ id: 'X2', kind: 'cable', a: 'EDGE-17:p5', b: 'AGG-03:p2' })
    const e = project(t, 'EDGE-17').edges.find(
      (x) => x.id === 'line:EDGE-17|AGG-03',
    )!
    expect(e.data!.label).toEqual({ kind: 'count', count: 2 })
    expect(e.data!.circuits).toHaveLength(2)
  })

  it('above three via steps shows the first two and how many more', () => {
    const t = acceptanceSnapshot()
    // EDGE-17 p6 -> PANEL-A 6 .. 9 -> AGG-15: four passive visits.
    t.links.push(
      { id: 'Y1', kind: 'cable', a: 'EDGE-17:p6', b: 'PANEL-A:6:f' },
      { id: 'Y2', kind: 'cable', a: 'PANEL-A:6:r', b: 'PANEL-A:7:f' },
      { id: 'Y3', kind: 'cable', a: 'PANEL-A:7:r', b: 'PANEL-A:8:f' },
      { id: 'Y4', kind: 'cable', a: 'PANEL-A:8:r', b: 'PANEL-A:9:f' },
      { id: 'Y5', kind: 'cable', a: 'PANEL-A:9:r', b: 'AGG-15:p1' },
    )
    const e = project(t, 'EDGE-17').edges.find(
      (x) => x.id === 'line:EDGE-17|AGG-15',
    )!
    expect(e.data!.label).toEqual({
      kind: 'steps',
      steps: [
        { name: 'PANEL-A', place: '6' },
        { name: 'PANEL-A', place: '7' },
      ],
      more: 2,
    })
  })

  it('the circuit panel rows name both ports and keep the start endpoint', () => {
    const e = project(s, 'EDGE-17').edges.find(
      (x) => x.id === 'line:EDGE-17|AGG-03',
    )!
    expect(e.data!.circuits).toEqual([
      {
        start: { id: 'EDGE-17:p1', label: '1', equipment: 'EDGE-17' },
        end: { id: 'AGG-03:p1', label: '1', equipment: 'AGG-03' },
        via: [
          { name: 'PANEL-A', place: '1' },
          { name: 'HDF-01', place: '3C/5' },
          { name: 'HDF-02', place: '2B/3' },
        ],
      },
    ])
  })

  it('a pill never sits on a card that is not an end of its line', () => {
    const q = project(s, 'HDF-01')
    const rects = q.layout.items.map((i) => ({
      id: i.id,
      left: i.x - i.width / 2,
      right: i.x + i.width / 2,
      top: i.y - i.height / 2,
      bottom: i.y + i.height / 2,
    }))
    for (const e of q.edges) {
      const pill = e.data!.pill as { x: number; y: number }
      const hit = rects.filter(
        (r) =>
          pill.x > r.left &&
          pill.x < r.right &&
          pill.y > r.top &&
          pill.y < r.bottom,
      )
      expect(
        hit.map((r) => r.id),
        e.id,
      ).toEqual([])
    }
  })

  it('ring 2 lines start at the ring 1 equipment', () => {
    const q = project(acceptanceSnapshot(), 'AGG-03', { hops: 2 })
    const ring2 = q.edges.filter((e) => e.source !== 'AGG-03')
    for (const e of ring2) expect(['EDGE-17']).toContain(e.source)
  })
})

describe('CM-10 focus projection: ends and groups', () => {
  it('has no ends box when every circuit reaches a switch', () => {
    const p = project(acceptanceSnapshot(), 'EDGE-17')
    expect(p.nodes.some((n) => n.type === 'focusEnds')).toBe(false)
  })

  it('lists a dead end: the center port, the steps, and where it ends', () => {
    const t = acceptanceSnapshot()
    t.links.push({ id: 'X1', kind: 'cable', a: 'EDGE-17:p5', b: 'PANEL-A:5:f' })
    const ends = node(project(t, 'EDGE-17').nodes, 'ends', 'focusEnds')
    expect(ends.data.rows).toEqual([
      {
        port: { id: 'EDGE-17:p5', label: '5' },
        via: [],
        end: { kind: 'free', equipment: 'PANEL-A', place: '5', side: 'rear' },
      },
    ])
    expect(ends.position.y).toBeGreaterThan(0)
  })

  it('a group card says how many, on which side, and lists its members when open', () => {
    const s = campusSnapshot()
    const closed = project(s, 'AGG-1')
    const groups = closed.nodes.filter((n) => n.type === 'focusGroup')
    expect(groups).toHaveLength(3)
    expect(closed.nodes.some((n) => n.type === 'focusCard')).toBe(false)
    const first = node(closed.nodes, groups[0].id, 'focusGroup')
    expect(first.data).toMatchObject({
      nodeId: 'n-1',
      nodeName: 'Floor 1',
      count: 10,
      side: 'left',
      open: false,
      members: [],
    })
    const open = project(s, 'AGG-1', { openGroups: [groups[0].id] })
    const opened = node(open.nodes, groups[0].id, 'focusGroup')
    expect(opened.data.open).toBe(true)
    expect(opened.data.members.slice(0, 2)).toEqual([
      { id: 'SW-01', name: 'SW-01' },
      { id: 'SW-04', name: 'SW-04' },
    ])
    expect(opened.data.members).toHaveLength(10)
    // One line from the center to each group, labeled with its circuit count.
    const line = open.edges.find((e) => e.target === groups[0].id)!
    expect(line.source).toBe('AGG-1')
    expect(line.data!.label).toEqual({ kind: 'count', count: 10 })
  })
})
