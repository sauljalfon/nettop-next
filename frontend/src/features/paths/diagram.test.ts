import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { followPort } from './follow'
import { routeDiagram, type DiagramCable, type DiagramNode } from './diagram'
import {
  buildSheet,
  type CableItem,
  type PlaceItem,
  type RowItem,
  type Sheet,
} from './sheet'
import { indexOf } from './testSnapshots'

const NETWORKS = [
  { id: 'A', name: 'Network A' },
  { id: 'B', name: 'Network B' },
]
const sheetFrom = (start: string, edit?: (s: Snapshot) => Snapshot): Sheet => {
  const index = indexOf(edit)
  return buildSheet(index, NETWORKS, followPort(index, start))
}

const isCable = (x: { n?: number } | object): x is DiagramCable => 'item' in x
/** A compact picture: sites as [name, nodes as [name, steps]], cables as gap. */
function shape(sheet: Sheet) {
  const d = routeDiagram(sheet)
  const nodeShape = (n: DiagramNode) =>
    n.parts.map((p) => (isCable(p) ? `~${p.gap}` : `${p.n}:${p.row.name}`))
  return d.sites.map((s) =>
    isCable(s)
      ? `~${s.gap}`
      : [
          s.name,
          s.nodes.map((n) =>
            isCable(n) ? `~${n.gap}` : [n.name, nodeShape(n)],
          ),
        ],
  )
}

describe('routeDiagram', () => {
  it('the acceptance path: one site, three nodes, cables by gap', () => {
    expect(shape(sheetFrom('EDGE-17:p1'))).toEqual([
      [
        'Main Campus',
        [
          ['Building A', ['1:EDGE-17', '~in-node', '2:PANEL-A']],
          '~node-gap',
          ['North Sub-main', ['3:HDF-01']],
          '~node-gap',
          ['Main Distribution', ['4:HDF-02', '~in-node', '5:AGG-03']],
        ],
      ],
    ])
  })

  it('keeps the leave note on the cable, and the rack on the step', () => {
    const d = routeDiagram(sheetFrom('EDGE-17:p1'))
    const site = d.sites[0] as { nodes: (DiagramNode | DiagramCable)[] }
    const gaps = site.nodes.filter(isCable)
    expect(gaps.map((c) => c.item.note)).toEqual([
      { kind: 'node', name: 'Building A' },
      { kind: 'node', name: 'North Sub-main' },
    ])
    const first = site.nodes[0] as DiagramNode
    expect(first.parts[0]).toMatchObject({ n: 1, rack: 'Rack A03' })
    expect(first.nodeId).toBe('node-a')
  })

  it('a path across sites: a site-gap between the site frames', () => {
    // EDGE-22: DR Site, Main Campus, then back to DR Site.
    const d = routeDiagram(sheetFrom('EDGE-22:p1'))
    expect(d.sites.map((s) => (isCable(s) ? `~${s.gap}` : s.name))).toEqual([
      'DR Site',
      '~site-gap',
      'Main Campus',
      '~site-gap',
      'DR Site',
    ])
    const cable = d.sites[1] as DiagramCable
    expect(cable.item.note).toEqual({ kind: 'site', name: 'DR Site' })
  })

  it('keeps two nodes with the same name in different sites apart', () => {
    const sheet = sheetFrom('EDGE-22:p1', (s) => ({
      ...s,
      nodes: s.nodes.map((n) => ({ ...n, name: 'Same' })),
    }))
    const d = routeDiagram(sheet)
    const sites = d.sites.filter((s) => !isCable(s))
    expect(sites.length).toBe(3)
    // The main-campus site holds several nodes, all named "Same", yet still separate.
    const main = sites[1] as { nodes: (DiagramNode | DiagramCable)[] }
    const nodes = main.nodes.filter((n): n is DiagramNode => !isCable(n))
    expect(nodes.length).toBeGreaterThan(1)
    expect(new Set(nodes.map((n) => n.nodeId)).size).toBe(nodes.length)
  })

  it('one step only', () => {
    const d = routeDiagram(sheetFrom('EDGE-17:p4'))
    expect(shape(sheetFrom('EDGE-17:p4'))).toEqual([
      ['Main Campus', [['Building A', ['1:EDGE-17']]]],
    ])
    expect(d.sites).toHaveLength(1)
  })

  // A hand-made sheet: steps with a site but no node, and steps with neither.
  const row = (name: string, n: number): RowItem => ({
    type: 'row',
    equipmentId: name,
    name,
    tag: 'Panel',
    unit: n,
    text: '',
    endpointId: `${name}:1`,
  })
  const cable = (id: string): CableItem => ({
    type: 'cable',
    linkId: id,
    shortId: id,
    fullId: id,
  })
  const place = (extra: object): PlaceItem => ({
    type: 'place',
    rackId: 'r',
    site: 'S',
    node: 'N',
    rack: 'R',
    ...extra,
  })
  const handMade = (items: Sheet['items']): Sheet => ({
    title: { from: { equipmentId: 'a', name: 'a', port: '1' } },
    counts: { cables: 0, passives: 0, racks: 0 },
    items,
    end: { kind: 'none' },
  })

  it('a step with no node: its own node group and an empty name', () => {
    const d = routeDiagram(
      handMade([
        place({ siteId: 's1', nodeId: 'n1' }),
        row('a', 1),
        cable('c1'),
        place({ siteId: 's1' }),
        row('b', 2),
        cable('c2'),
        place({ siteId: 's1' }),
        row('c', 3),
      ]),
    )
    const site = d.sites[0] as { nodes: (DiagramNode | DiagramCable)[] }
    expect(site.nodes.map((n) => (isCable(n) ? `~${n.gap}` : n.name))).toEqual([
      'N',
      '~node-gap',
      '',
      '~node-gap',
      '',
    ])
  })

  it('a step with neither site nor node: its own site, never merged with the next', () => {
    const d = routeDiagram(
      handMade([place({}), row('a', 1), cable('c1'), place({}), row('b', 2)]),
    )
    expect(
      d.sites.map((s) => (isCable(s) ? `~${s.gap}` : `[${s.name}]`)),
    ).toEqual(['[]', '~site-gap', '[]'])
  })
})
