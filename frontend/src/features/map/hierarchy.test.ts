import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { buildHierarchies, type InstalledSets } from './hierarchy'
import { hierarchyFixture } from './hierarchyFixture'
import { indexSnapshot } from './snapshotIndex'

const hierarchies = (s: Snapshot, installed?: InstalledSets) =>
  buildHierarchies(indexSnapshot(s), installed)
const of = (s: Snapshot, net = 'A', installed?: InstalledSets) =>
  hierarchies(s, installed).get(net)!
const groupKeys = (s: Snapshot, net = 'A') =>
  of(s, net).groups.map((g) => g.key)

/** A network with a BB, two AGGs and one access switch under each, in two nodes. */
const base = () =>
  hierarchyFixture()
    .site('s1', 'Main')
    .node('n1', 's1', 'Hall 1')
    .node('n2', 's1', 'Hall 2')
    .sw('BB1', 'backbone', 'A')
    .sw('AGG1', 'aggregation', 'A')
    .sw('AGG2', 'aggregation', 'A')

describe('HI-01 levels', () => {
  it('has the BB as the top, and every AGG is a mid AGG', () => {
    const f = base()
    const h = of(f.snapshot())
    expect(h.topKind).toBe('backbone')
    expect(h.topIds).toEqual(['BB1'])
    expect(h.aggIds).toEqual(['AGG1', 'AGG2'])
  })

  it('has the Top AGG when there is no BB: joined to another AGG, and no access switch reaches it', () => {
    const f = hierarchyFixture()
      .node('n1', 's1')
      .sw('TOP', 'aggregation', 'A')
      .sw('MID', 'aggregation', 'A')
      .sw('ACC', 'access', 'A', 'n1')
    f.run('TOP', 'MID')
    f.run('ACC', 'MID')
    const h = of(f.snapshot())
    expect(h.topKind).toBe('aggregation')
    expect(h.topIds).toEqual(['TOP'])
    expect(h.aggIds).toEqual(['MID'])
    expect(h.lines.map((l) => [l.kind, l.a, l.b])).toEqual([
      ['uplink', 'TOP', 'MID'],
    ])
  })

  it('has no top when every AGG that is joined to another is reached by a switch, or none is joined', () => {
    const joined = hierarchyFixture()
      .node('n1', 's1')
      .sw('X', 'aggregation', 'A')
      .sw('Y', 'aggregation', 'A')
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC2', 'access', 'A', 'n1')
    joined.run('X', 'Y')
    joined.run('ACC1', 'X')
    joined.run('ACC2', 'Y')
    const h = of(joined.snapshot())
    expect(h.topKind).toBe('none')
    expect(h.topIds).toEqual([])
    expect(h.aggIds).toEqual(['X', 'Y'])
    expect(h.lines.map((l) => l.kind)).toEqual(['peer'])

    const alone = hierarchyFixture().sw('ONLY', 'aggregation', 'A')
    expect(of(alone.snapshot()).topKind).toBe('none')
    expect(of(alone.snapshot()).aggIds).toEqual(['ONLY'])
  })

  it('reads roles only: a switch named BB-x with role aggregation is an AGG, an AGG-named access switch is access', () => {
    const f = hierarchyFixture()
      .node('n1', 's1')
      .sw('s-1', 'aggregation', 'A', undefined, 'BB-9')
      .sw('s-2', 'access', 'A', 'n1', 'AGG-9')
    f.run('s-2', 's-1')
    const h = of(f.snapshot())
    expect(h.topKind).toBe('none')
    expect(h.aggIds).toEqual(['s-1'])
    expect([...h.switches.keys()]).toEqual(['s-2'])
    expect(h.switches.get('s-2')!.uplinks).toHaveLength(1)
  })

  it('counts the BBs, the AGGs, the node cards, the switches and the marked ones', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('ACC', 'AGG1')
    expect(of(f.snapshot()).counts).toEqual({
      bb: 1,
      agg: 2,
      nodes: 1,
      switches: 1,
      marked: 0,
    })
  })

  it('builds every network and keeps them apart', () => {
    const f = base()
      .sw('B-AGG', 'aggregation', 'B')
      .sw('B-ACC', 'access', 'B', 'n2')
    f.run('B-ACC', 'B-AGG')
    const all = hierarchies(f.snapshot())
    expect([...all.keys()]).toEqual(['A', 'B'])
    expect(all.get('B')!.topKind).toBe('none')
    expect(all.get('B')!.aggIds).toEqual(['B-AGG'])
    expect(all.get('A')!.aggIds).toEqual(['AGG1', 'AGG2'])
  })
})

describe('HI-02 lines', () => {
  it('draws one uplink line between a top and a mid AGG, with the circuit’s cable', () => {
    const f = base()
    const [cable] = f.run('BB1', 'AGG1')
    const h = of(f.snapshot())
    expect(h.lines).toHaveLength(1)
    expect(h.lines[0]).toMatchObject({
      kind: 'uplink',
      a: 'BB1',
      b: 'AGG1',
      proposed: false,
    })
    expect(h.lines[0]).not.toHaveProperty('weak')
    expect(h.lines[0].circuits).toHaveLength(1)
    expect(h.lines[0].circuits[0].linkIds).toEqual([cable])
  })

  it('reads through passive chains: front › rear › cable, with each panel as a step', () => {
    const f = base().panel('P1', 'n1').panel('P2', 'n2')
    const ids = f.run('BB1', 'AGG1', ['P1', 'P2'])
    const [circuit] = of(f.snapshot()).lines[0].circuits
    // cable, P1's bridge, cable, P2's bridge, cable.
    expect(circuit.linkIds).toHaveLength(5)
    expect(circuit.linkIds).toContain(ids[0])
    expect(circuit.via.map((v) => [v.equipmentId, v.place])).toEqual([
      ['P1', '1'],
      ['P2', '1'],
    ])
    expect(circuit.farId).toBe('AGG1')
  })

  it('draws a peer link between two tops and between two mid AGGs, one line a pair with every circuit', () => {
    const f = base().sw('BB2', 'backbone', 'A').sw('AGG3', 'aggregation', 'A')
    f.run('BB1', 'BB2')
    f.run('AGG1', 'AGG2')
    f.run('AGG2', 'AGG1') // a second cable between the same pair
    const lines = of(f.snapshot()).lines
    expect(lines.map((l) => [l.kind, l.a, l.b, l.circuits.length])).toEqual([
      ['peer', 'AGG1', 'AGG2', 2],
      ['peer', 'BB1', 'BB2', 1],
    ])
  })

  it('draws no tier line for a walk from an AGG to an access switch: that is the switch’s uplink', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('ACC', 'AGG1')
    f.run('ACC', 'BB1')
    const h = of(f.snapshot())
    expect(h.lines).toEqual([])
    expect(
      h.switches
        .get('ACC')!
        .uplinks.map((u) => u.farId)
        .sort(),
    ).toEqual(['AGG1', 'BB1'])
  })

  it('counts the tops each mid AGG reaches', () => {
    const f = base().sw('BB2', 'backbone', 'A').sw('AGG3', 'aggregation', 'A')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('BB2', 'AGG2')
    const h = of(f.snapshot())
    expect(h.topsReached.get('AGG1')).toBe(1)
    expect(h.topsReached.get('AGG2')).toBe(2)
    expect(h.topsReached.get('AGG3')).toBe(0)
  })
})

describe('HI-03 groups', () => {
  it('joins mid AGGs by a peer link, and an AGG with no switch is a group of its own', () => {
    const f = base().sw('AGG3', 'aggregation', 'A')
    f.run('AGG1', 'AGG2')
    expect(groupKeys(f.snapshot())).toEqual(['AGG1+AGG2', 'AGG3'])
    const alone = of(f.snapshot()).groups.find((g) => g.key === 'AGG3')!
    expect(alone).toMatchObject({
      kind: 'aggs',
      aggIds: ['AGG3'],
      nodes: [],
      switches: 0,
      problemNodes: 0,
    })
  })

  it('joins mid AGGs that one switch reaches, and puts the switch under both', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('ACC', 'AGG1')
    f.run('ACC', 'AGG2')
    const h = of(f.snapshot())
    expect(h.groups.map((g) => g.key)).toEqual(['AGG1+AGG2'])
    expect(h.switches.get('ACC')!.aggIds).toEqual(['AGG1', 'AGG2'])
    expect(h.groups[0].nodes.map((n) => n.key)).toEqual(['AGG1+AGG2|n1'])
    expect(h.groups[0].switches).toBe(1)
  })

  it('puts a switch cabled only to the top under the top', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('ACC', 'BB1')
    const h = of(f.snapshot())
    const top = h.groups.find((g) => g.kind === 'top')!
    expect(top).toMatchObject({
      key: 'top',
      aggIds: [],
      topIds: ['BB1'],
      switches: 1,
    })
    expect(top.nodes.map((n) => n.key)).toEqual(['top|n1'])
    // The AGGs have no switch.
    expect(
      h.groups.filter((g) => g.kind === 'aggs').map((g) => g.switches),
    ).toEqual([0, 0])
  })

  it('puts a switch with no uplink, or one that reaches only another network, under No AGG', () => {
    const f = base()
      .sw('B-AGG', 'aggregation', 'B')
      .sw('LONE', 'access', 'A', 'n1')
      .sw('WRONG', 'access', 'A', 'n2')
    f.run('WRONG', 'B-AGG')
    const h = of(f.snapshot())
    const none = h.groups.find((g) => g.kind === 'none')!
    expect(none.key).toBe('none')
    expect(none.nodes.map((n) => [n.key, n.switchIds])).toEqual([
      ['none|n1', ['LONE']],
      ['none|n2', ['WRONG']],
    ])
  })

  it('draws a node under two groups, with a card of its own in each', () => {
    const f = base()
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC2', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG1')
    f.run('ACC2', 'AGG2')
    const h = of(f.snapshot())
    expect(h.groups.map((g) => g.key)).toEqual(['AGG1', 'AGG2'])
    expect(h.groups.flatMap((g) => g.nodes.map((n) => n.key))).toEqual([
      'AGG1|n1',
      'AGG2|n1',
    ])
    expect(h.counts.nodes).toBe(2)
  })

  it('gives a switch with no node a card "Not in a node"', () => {
    const f = base().sw('ACC', 'access', 'A')
    f.run('ACC', 'AGG1')
    const [card] = of(f.snapshot()).groups[0].nodes
    expect(card).toMatchObject({ key: 'AGG1|', switchIds: ['ACC'] })
    expect(card.nodeId).toBeUndefined()
  })

  it('lists the card "Not in a node" after every node', () => {
    const f = base().sw('ACC', 'access', 'A').sw('ACC2', 'access', 'A', 'n1')
    f.run('ACC', 'AGG1')
    f.run('ACC2', 'AGG1')
    expect(of(f.snapshot()).groups[0].nodes.map((n) => n.key)).toEqual([
      'AGG1|n1',
      'AGG1|',
    ])
  })

  it('orders groups by the name of their first AGG, then Under the top, then No AGG', () => {
    const f = hierarchyFixture()
      .node('n1', 's1')
      .sw('BB1', 'backbone', 'A')
      .sw('a-2', 'aggregation', 'A', undefined, 'Zulu')
      .sw('a-1', 'aggregation', 'A', undefined, 'Alpha')
      .sw('a-3', 'aggregation', 'A', undefined, 'Alpha') // same name: then ID
      .sw('T', 'access', 'A', 'n1')
      .sw('LONE', 'access', 'A', 'n1')
    f.run('T', 'BB1')
    expect(groupKeys(f.snapshot())).toEqual([
      'a-1',
      'a-3',
      'a-2',
      'top',
      'none',
    ])
  })

  it('orders the aggs of a group by name and the node cards by site, node, then ID', () => {
    const f = hierarchyFixture()
      .site('sB', 'Beta')
      .site('sA', 'Alpha')
      .node('n-b', 'sB', 'Hall')
      .node('n-a2', 'sA', 'Wing')
      .node('n-a1', 'sA', 'Atrium')
      .sw('g1', 'aggregation', 'A', undefined, 'Yankee')
      .sw('g2', 'aggregation', 'A', undefined, 'Xray')
      .sw('s1', 'access', 'A', 'n-b')
      .sw('s2', 'access', 'A', 'n-a2')
      .sw('s3', 'access', 'A', 'n-a1')
    for (const s of ['s1', 's2', 's3']) {
      f.run(s, 'g1')
      f.run(s, 'g2')
    }
    const [group] = of(f.snapshot()).groups
    expect(group.aggIds).toEqual(['g2', 'g1'])
    expect(group.key).toBe('g1+g2')
    expect(group.nodes.map((n) => n.nodeId)).toEqual(['n-a1', 'n-a2', 'n-b'])
  })

  it('reads the acceptance fixture: Network A', () => {
    const h = of(acceptanceSnapshot(), 'A')
    expect(h.topKind).toBe('backbone')
    expect(h.topIds).toEqual(['BB-01'])
    expect(h.aggIds).toEqual(['AGG-03', 'AGG-08', 'AGG-15'])
    expect(h.groups.map((g) => [g.key, g.kind, g.switches])).toEqual([
      ['AGG-03+AGG-08', 'aggs', 1],
      ['AGG-15', 'aggs', 0],
    ])
    expect(h.groups[0].nodes).toEqual([
      expect.objectContaining({
        key: 'AGG-03+AGG-08|node-a',
        nodeId: 'node-a',
        siteId: 'site-main',
        switchIds: ['EDGE-17'],
        twoUplinks: 1,
        chained: 0,
        problem: false,
        proposed: false,
      }),
    ])
    expect(h.groups[1].nodes).toEqual([])
    // No cable reaches the BB from any AGG: all three are in noTop.
    expect([...h.noTop].sort()).toEqual(['AGG-03', 'AGG-08', 'AGG-15'])
    expect(h.counts).toEqual({
      bb: 1,
      agg: 3,
      nodes: 1,
      switches: 1,
      marked: 3,
    })
    // EDGE-17 reaches AGG-03, AGG-08 and BB-01: three uplinks, no mark.
    const edge = h.switches.get('EDGE-17')!
    expect(edge.uplinks.map((u) => u.farId).sort()).toEqual([
      'AGG-03',
      'AGG-08',
      'BB-01',
    ])
    expect(edge.mark).toBeUndefined()
    // No cable joins the AGGs to the BB: no line, no mark.
    expect(h.lines).toEqual([])
    expect(h.topsReached.get('AGG-03')).toBe(0)
  })

  it('reads the acceptance fixture: Network B has no top', () => {
    const h = of(acceptanceSnapshot(), 'B')
    expect(h.topKind).toBe('none')
    expect(h.topIds).toEqual([])
    expect(h.aggIds).toEqual(['AGG-12'])
    expect(h.groups.map((g) => [g.key, g.nodes.map((n) => n.nodeId)])).toEqual([
      ['AGG-12', ['node-dr1']],
    ])
    expect(h.counts).toEqual({
      bb: 0,
      agg: 1,
      nodes: 1,
      switches: 1,
      marked: 0,
    })
  })

  it('reads the Expansion shape: EDGE-18 in Rack A03 cabled to AGG-15 puts Building A under AGG-15 too', () => {
    const s = acceptanceSnapshot()
    const installed: InstalledSets = {
      equipment: new Set(s.equipment.map((e) => e.id)),
      links: new Set(s.links.map((l) => l.id)),
      containers: new Set(
        [...s.sites, ...s.nodes, ...s.racks].map((c) => c.id),
      ),
    }
    const planned: Snapshot = {
      ...s,
      context: 'planned',
      equipment: [
        ...s.equipment,
        {
          id: 'EDGE-18',
          name: 'EDGE-18',
          kind: 'switch',
          role: 'access',
          networkId: 'A',
          rackId: 'rack-a03',
          unit: 6,
          height: 1,
        },
      ],
      endpoints: [
        ...s.endpoints,
        { id: 'EDGE-18:p1', equipmentId: 'EDGE-18', label: 'Port 1' },
      ],
      links: [
        ...s.links,
        {
          id: 'planned-cable-18',
          kind: 'cable',
          a: 'EDGE-18:p1',
          b: 'AGG-15:p1',
        },
      ],
    }
    const h = of(planned, 'A', installed)
    expect(h.groups.map((g) => g.key)).toEqual(['AGG-03+AGG-08', 'AGG-15'])
    expect(
      h.groups.flatMap((g) => g.nodes.map((n) => [n.key, n.proposed])),
    ).toEqual([
      ['AGG-03+AGG-08|node-a', false],
      ['AGG-15|node-a', true],
    ])
    expect(h.groups[1].switches).toBe(1)
    expect(h.counts).toMatchObject({ nodes: 2, switches: 2, marked: 3 })
    // Both AGGs are installed, so no tier card is proposed.
    expect([...h.proposed]).toEqual([])
    // The line from AGG-15 to its frame stands only for the plan's cable.
    expect(h.groups.map((g) => g.proposedFrom)).toEqual([[], ['AGG-15']])
    expect(of(s, 'A', installed).groups.map((g) => g.proposedFrom)).toEqual([
      [],
      [],
    ])
  })
})

describe('HI-04 marks', () => {
  it('gives a switch with one uplink no mark and no two-uplinks flag, even when its group has two AGGs', () => {
    const f = base()
      .sw('ONE', 'access', 'A', 'n1')
      .sw('TWO', 'access', 'A', 'n2')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('ONE', 'AGG1')
    f.run('TWO', 'AGG2')
    const h = of(f.snapshot())
    for (const id of ['ONE', 'TWO']) {
      expect(h.switches.get(id)!.mark).toBeUndefined()
      expect(h.switches.get(id)!.twoUplinks).toBe(false)
    }
    for (const card of h.groups.flatMap((g) => g.nodes))
      expect(card).toMatchObject({ twoUplinks: 0, problem: false })
    expect(h.counts.marked).toBe(0)
  })

  it('flags a switch cabled to both AGGs of a pair as having two uplinks, with no mark', () => {
    const f = base()
      .sw('ONE', 'access', 'A', 'n1')
      .sw('BOTH', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('ONE', 'AGG1')
    f.run('BOTH', 'AGG1')
    f.run('BOTH', 'AGG2')
    const h = of(f.snapshot())
    expect(h.switches.get('ONE')!.twoUplinks).toBe(false)
    expect(h.switches.get('BOTH')!.twoUplinks).toBe(true)
    expect(h.switches.get('BOTH')!.mark).toBeUndefined()
    expect(h.groups[0].nodes[0]).toMatchObject({
      twoUplinks: 1,
      chained: 0,
      problem: false,
    })
    expect(h.groups[0].problemNodes).toBe(0)
    expect(h.counts.marked).toBe(0)
  })

  it('flags a switch with an AGG and a BB uplink, and places it under the AGG’s group', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('ACC', 'AGG1')
    f.run('ACC', 'BB1')
    const h = of(f.snapshot())
    expect(h.switches.get('ACC')!.twoUplinks).toBe(true)
    expect(h.groups.find((g) => g.key === 'AGG1')!.switches).toBe(1)
    expect(h.groups.some((g) => g.kind === 'top')).toBe(false)
  })

  it('counts two cables from one switch to the same AGG as two uplinks', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('ACC', 'AGG1')
    f.run('ACC', 'AGG1')
    const s = of(f.snapshot()).switches.get('ACC')!
    expect(s.uplinks).toHaveLength(2)
    expect(s.twoUplinks).toBe(true)
  })

  it('treats a cable between two switches that both have an own uplink as a peer for both: two uplinks, neither chained', () => {
    const f = base().sw('P1', 'access', 'A', 'n1').sw('P2', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('P1', 'AGG1')
    f.run('P2', 'AGG1')
    f.run('P1', 'P2')
    const h = of(f.snapshot())
    expect(h.switches.get('P1')).toMatchObject({
      peers: ['P2'],
      twoUplinks: true,
      parents: [],
    })
    expect(h.switches.get('P2')).toMatchObject({
      peers: ['P1'],
      twoUplinks: true,
      parents: [],
    })
    expect(h.switches.get('P1')!.mark).toBeUndefined()
    expect(h.switches.get('P2')!.mark).toBeUndefined()
    expect(h.groups[0].nodes[0]).toMatchObject({ twoUplinks: 2, chained: 0 })
  })

  it('sorts a switch’s peers by name', () => {
    const f = base()
      .sw('P', 'access', 'A', 'n1')
      .sw('q1', 'access', 'A', 'n1', 'Zed')
      .sw('q2', 'access', 'A', 'n1', 'Ann')
    f.run('BB1', 'AGG1')
    for (const id of ['P', 'q1', 'q2']) f.run(id, 'AGG1')
    f.run('P', 'q1')
    f.run('P', 'q2')
    expect(of(f.snapshot()).switches.get('P')!.peers).toEqual(['q2', 'q1'])
  })

  it('marks a switch with no own uplink, cabled to one with an uplink, "chained" with its parent', () => {
    const f = base().sw('UP', 'access', 'A', 'n1').sw('CH', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('UP', 'AGG1')
    f.run('CH', 'UP')
    const h = of(f.snapshot())
    expect(h.switches.get('CH')).toMatchObject({
      mark: 'chained',
      parents: ['UP'],
      peers: [],
      twoUplinks: false,
    })
    expect(h.switches.get('UP')).toMatchObject({ peers: [], twoUplinks: false })
    expect(h.switches.get('UP')!.mark).toBeUndefined()
  })

  it('puts a mid AGG with no cable to a BB in noTop and counts it as marked', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1') // AGG2 has none
    f.run('ACC', 'AGG1')
    const h = of(f.snapshot())
    expect([...h.noTop]).toEqual(['AGG2'])
    expect(h.counts.marked).toBe(1)
  })

  it('has an empty noTop in a network with no top', () => {
    const f = hierarchyFixture()
      .node('n1', 's1')
      .sw('X', 'aggregation', 'A')
      .sw('ACC', 'access', 'A', 'n1')
    f.run('ACC', 'X')
    const h = of(f.snapshot())
    expect(h.topKind).toBe('none')
    expect([...h.noTop]).toEqual([])
    expect(h.counts.marked).toBe(0)
  })

  it('marks a chained switch, with its parents and the AGGs of its parents', () => {
    const f = base()
      .sw('TOPSW', 'access', 'A', 'n1')
      .sw('MID', 'access', 'A', 'n1')
      .sw('LEAF', 'access', 'A', 'n2')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('TOPSW', 'AGG1')
    f.run('TOPSW', 'AGG2')
    f.run('MID', 'TOPSW')
    f.run('LEAF', 'MID')
    const h = of(f.snapshot())
    expect(h.switches.get('MID')).toMatchObject({
      mark: 'chained',
      parents: ['TOPSW'],
      aggIds: ['AGG1', 'AGG2'],
      uplinks: [],
    })
    // A chain of three: depth 2, hanging under MID.
    expect(h.switches.get('LEAF')).toMatchObject({
      mark: 'chained',
      parents: ['MID'],
      aggIds: ['AGG1', 'AGG2'],
    })
    expect(h.switches.get('TOPSW')!.mark).toBeUndefined()
    expect(h.counts.marked).toBe(2)
    const cards = h.groups[0].nodes.map((n) => [n.key, n.chained])
    expect(cards).toEqual([
      ['AGG1+AGG2|n1', 1],
      ['AGG1+AGG2|n2', 1],
    ])
  })

  it('takes the smallest depth: a switch cabled to two neighbours hangs under the nearer one', () => {
    const f = base()
      .sw('U', 'access', 'A', 'n1')
      .sw('C1', 'access', 'A', 'n1')
      .sw('C2', 'access', 'A', 'n1')
      .sw('X', 'access', 'A', 'n1')
    f.run('U', 'AGG1')
    f.run('C1', 'U')
    f.run('C2', 'C1')
    f.run('X', 'C2') // depth 3 through C2 …
    f.run('X', 'U') // … but depth 1 through U
    expect(of(f.snapshot()).switches.get('X')!.parents).toEqual(['U'])
  })

  it('ends on a loop of access switches: with no uplink anywhere they are all "no uplink"', () => {
    const f = base()
      .sw('R1', 'access', 'A', 'n1')
      .sw('R2', 'access', 'A', 'n1')
      .sw('R3', 'access', 'A', 'n1')
    f.run('R1', 'R2')
    f.run('R2', 'R3')
    f.run('R3', 'R1')
    const h = of(f.snapshot())
    for (const id of ['R1', 'R2', 'R3']) {
      expect(h.switches.get(id)!.mark).toBe('no-uplink')
      expect(h.switches.get(id)!.parents).toEqual([])
    }
    expect(h.groups.find((g) => g.kind === 'none')!.switches).toBe(3)
  })

  it('ends on a loop with one uplink: the others hang under it, and never under each other', () => {
    const f = base()
      .sw('R1', 'access', 'A', 'n1')
      .sw('R2', 'access', 'A', 'n1')
      .sw('R3', 'access', 'A', 'n1')
    f.run('R1', 'AGG1')
    f.run('R1', 'R2')
    f.run('R2', 'R3')
    f.run('R3', 'R1')
    const h = of(f.snapshot())
    expect(h.switches.get('R1')!.mark).toBeUndefined()
    expect(h.switches.get('R2')).toMatchObject({
      mark: 'chained',
      parents: ['R1'],
    })
    expect(h.switches.get('R3')).toMatchObject({
      mark: 'chained',
      parents: ['R1'],
    })
  })

  it('marks a switch with no cable that reaches an AGG or BB "no uplink", even through a panel with nothing behind it', () => {
    const f = base()
      .panel('P1', 'n1')
      .sw('LONE', 'access', 'A', 'n1')
      .sw('DEAD', 'access', 'A', 'n1')
    f.deadEnd('DEAD', 'P1')
    const h = of(f.snapshot())
    expect(h.switches.get('LONE')).toMatchObject({
      mark: 'no-uplink',
      uplinks: [],
      otherNetwork: [],
      aggIds: [],
    })
    expect(h.switches.get('DEAD')!.mark).toBe('no-uplink')
    expect(h.groups.find((g) => g.kind === 'none')!.nodes[0]).toMatchObject({
      problem: true,
      twoUplinks: 0,
      chained: 0,
    })
  })

  it('marks a switch that reaches only another network "other network", and keeps the walk', () => {
    const f = base()
      .sw('B-AGG', 'aggregation', 'B')
      .sw('B-ACC', 'access', 'B', 'n1')
      .sw('ACC', 'access', 'A', 'n1')
    f.run('ACC', 'B-AGG')
    f.run('ACC', 'B-ACC')
    const s = of(f.snapshot()).switches.get('ACC')!
    expect(s.mark).toBe('other-network')
    expect(s.uplinks).toEqual([])
    expect(s.otherNetwork.map((c) => c.farId).sort()).toEqual([
      'B-ACC',
      'B-AGG',
    ])
  })

  it('gives a switch with an uplink no mark for its other-network cable', () => {
    const f = base()
      .sw('B-AGG', 'aggregation', 'B')
      .sw('ACC', 'access', 'A', 'n1')
    f.run('ACC', 'AGG1')
    f.run('ACC', 'B-AGG')
    const s = of(f.snapshot()).switches.get('ACC')!
    expect(s.otherNetwork).toHaveLength(1)
    expect(s.mark).toBeUndefined()
  })

  it('gives each switch one mark, the first that holds', () => {
    // No uplink and an other-network walk: "other network", not "no uplink".
    const f = base()
      .sw('B-AGG', 'aggregation', 'B')
      .sw('ACC', 'access', 'A', 'n1')
      .sw('CH', 'access', 'A', 'n1')
    f.run('ACC', 'B-AGG')
    f.run('CH', 'ACC') // CH chains to ACC, which has no uplink: no depth
    const h = of(f.snapshot())
    expect(h.switches.get('ACC')!.mark).toBe('other-network')
    expect(h.switches.get('CH')!.mark).toBe('no-uplink')
  })

  it('is not changed by a reserved or faulty port: the cable still counts', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('ACC', 'AGG1')
    const plain = of(f.snapshot())
    const ports = f.snapshot().endpoints.filter((p) => p.equipmentId === 'ACC')
    f.state(ports[0].id, 'faulty')
    f.state('AGG1:p1', 'faulty')
    const faulty = of(f.snapshot())
    expect(faulty.switches.get('ACC')).toEqual(plain.switches.get('ACC'))
    expect(faulty.groups).toEqual(plain.groups)
    expect(faulty.counts).toEqual(plain.counts)
    f.state(ports[0].id, 'reserved')
    expect(of(f.snapshot()).switches.get('ACC')!.uplinks).toHaveLength(1)
  })
})

describe('HI-05 in a plan', () => {
  /** The installed sets of a snapshot, so what is added after is the plan's. */
  const installedOf = (s: Snapshot): InstalledSets => ({
    equipment: new Set(s.equipment.map((e) => e.id)),
    links: new Set(s.links.map((l) => l.id)),
    containers: new Set([...s.sites, ...s.nodes, ...s.racks].map((c) => c.id)),
  })

  it('has nothing proposed without the installed sets, or when everything is installed', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('ACC', 'AGG1')
    expect([...of(f.snapshot()).proposed]).toEqual([])
    const s = f.snapshot()
    const h = of(s, 'A', installedOf(s))
    expect([...h.proposed]).toEqual([])
    expect(h.lines.map((l) => l.proposed)).toEqual([false])
    expect(h.groups.flatMap((g) => g.nodes.map((n) => n.proposed))).toEqual([
      false,
    ])
  })

  it('marks tier equipment the plan adds, a line whose every circuit uses a new cable, and a new node', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('ACC', 'AGG1')
    const installed = installedOf(f.snapshot())
    // The plan adds a node, an AGG, its switch, and the cables to the BB and the switch.
    f.node('n3', 's1', 'Hall 3')
      .sw('AGG-NEW', 'aggregation', 'A')
      .sw('NEW', 'access', 'A', 'n3')
    f.run('BB1', 'AGG-NEW')
    f.run('NEW', 'AGG-NEW')
    const h = of(f.snapshot(), 'A', installed)
    expect([...h.proposed]).toEqual(['AGG-NEW'])
    expect(h.lines.map((l) => [l.b, l.proposed])).toEqual([
      ['AGG-NEW', true],
      ['AGG1', false],
    ])
    const cards = h.groups.flatMap((g) =>
      g.nodes.map((n) => [n.key, n.proposed]),
    )
    expect(cards).toEqual([
      ['AGG-NEW|n3', true],
      ['AGG1|n1', false],
    ])
  })

  it('marks a node card proposed when every switch on it is proposed, even in an installed node', () => {
    const f = base().sw('OLD', 'access', 'A', 'n1')
    f.run('OLD', 'AGG1')
    const installed = installedOf(f.snapshot())
    f.sw('NEW', 'access', 'A', 'n1')
    f.run('NEW', 'AGG2')
    const h = of(f.snapshot(), 'A', installed)
    const cards = Object.fromEntries(
      h.groups.flatMap((g) => g.nodes.map((n) => [n.key, n.proposed])),
    )
    // n1 is installed and OLD is installed: its card under AGG1 stays solid; NEW is alone under AGG2.
    expect(cards).toEqual({ 'AGG1|n1': false, 'AGG2|n1': true })
  })

  it('marks a line proposed only when each of its circuits uses at least one new cable', () => {
    const f = base()
    f.run('BB1', 'AGG1') // installed
    const installed = installedOf(f.snapshot())
    f.run('BB1', 'AGG1') // a second cable, new
    const mixed = of(f.snapshot(), 'A', installed).lines[0]
    expect(mixed.circuits).toHaveLength(2)
    expect(mixed.proposed).toBe(false)
    const g = base().panel('P1', 'n1')
    g.run('BB1', 'AGG1', ['P1']) // installed through a panel
    const inst2 = installedOf(g.snapshot())
    g.run('BB1', 'AGG2')
    expect(
      of(g.snapshot(), 'A', inst2).lines.map((l) => [l.b, l.proposed]),
    ).toEqual([
      ['AGG1', false],
      ['AGG2', true],
    ])
  })
})

describe('OV-01 ups', () => {
  it('holds an access switch’s uplink circuits and its circuits to its peers', () => {
    const f = base()
      .panel('P1', 'n1')
      .sw('A1', 'access', 'A', 'n1')
      .sw('A2', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    const [up] = f.run('A1', 'AGG1', ['P1'])
    f.run('A2', 'AGG1')
    const peerLinks = f.run('A1', 'A2')
    const h = of(f.snapshot())
    const ups = h.ups.get('A1')!
    expect(ups.map((c) => c.farId).sort()).toEqual(['A2', 'AGG1'])
    const toAgg = ups.find((c) => c.farId === 'AGG1')!
    expect(toAgg.linkIds).toContain(up)
    expect(toAgg.via.map((v) => v.equipmentId)).toEqual(['P1'])
    expect(toAgg.start).toBe('A1:p1')
    const toPeer = ups.find((c) => c.farId === 'A2')!
    expect(toPeer.linkIds).toEqual(peerLinks)
    expect(
      h.ups
        .get('A2')!
        .map((c) => c.farId)
        .sort(),
    ).toEqual(['A1', 'AGG1'])
  })

  it('holds a chained switch’s circuit to its parent, with its via and links', () => {
    const f = base().panel('P1', 'n1')
    f.sw('UP', 'access', 'A', 'n1').sw('CH', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('UP', 'AGG1')
    const links = f.run('CH', 'UP', ['P1'])
    const h = of(f.snapshot())
    const ups = h.ups.get('CH')!
    expect(ups).toHaveLength(1)
    expect(ups[0]).toMatchObject({ farId: 'UP', start: 'CH:p1' })
    expect(ups[0].linkIds).toEqual(expect.arrayContaining(links))
    expect(ups[0].via.map((v) => v.equipmentId)).toEqual(['P1'])
    // The parent's own entry is its uplink only.
    expect(h.ups.get('UP')!.map((c) => c.farId)).toEqual(['AGG1'])
  })

  it('holds a mid AGG’s circuits to the BBs, and nothing for a BB', () => {
    const f = base().sw('BB2', 'backbone', 'A')
    f.run('BB1', 'AGG1')
    f.run('BB2', 'AGG1')
    f.run('AGG1', 'AGG2') // a peer: not a way to a top
    const h = of(f.snapshot())
    expect(
      h.ups
        .get('AGG1')!
        .map((c) => c.farId)
        .sort(),
    ).toEqual(['BB1', 'BB2'])
    expect(h.ups.get('AGG2') ?? []).toEqual([])
    expect(h.ups.get('BB1') ?? []).toEqual([])
    expect(h.ups.get('BB2') ?? []).toEqual([])
  })
})

describe('OV-01 elsewhere', () => {
  it('counts a split node’s switches on its other card, in its own network', () => {
    const f = base()
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC2', 'access', 'A', 'n1')
      .sw('ACC3', 'access', 'A', 'n1')
    f.run('BB1', 'AGG1')
    f.run('BB1', 'AGG2')
    f.run('ACC1', 'AGG1')
    f.run('ACC2', 'AGG2')
    f.run('ACC3', 'AGG2')
    const h = of(f.snapshot())
    const cards = Object.fromEntries(
      h.groups.flatMap((g) => g.nodes.map((c) => [c.key, c.elsewhere])),
    )
    expect(cards).toEqual({
      'AGG1|n1': [{ networkId: 'A', count: 2 }],
      'AGG2|n1': [{ networkId: 'A', count: 1 }],
    })
  })

  it('lists its own network first, then the other networks by name; AGGs and panels are not counted', () => {
    const f = base()
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC2', 'access', 'A', 'n1')
      // Names order C before B, so the order is by name, not by ID.
      .sw('B1', 'access', 'B', 'n1')
      .sw('C1', 'access', 'C', 'n1')
      .sw('C2', 'access', 'C', 'n1')
      .sw('AGGB', 'aggregation', 'B', 'n1')
      .panel('P1', 'n1')
    f.run('ACC1', 'AGG1')
    f.run('ACC2', 'AGG2')
    const s = f.snapshot()
    s.networks = [
      { id: 'A', name: 'Net A' },
      { id: 'B', name: 'Zulu' },
      { id: 'C', name: 'Alpha' },
    ]
    const card = of(s).groups.find((g) => g.key === 'AGG1')!.nodes[0]
    expect(card.elsewhere).toEqual([
      { networkId: 'A', count: 1 },
      { networkId: 'C', count: 2 },
      { networkId: 'B', count: 1 },
    ])
  })

  it('is empty for a node that holds only this card’s switches, and for a card with no node', () => {
    const f = base().sw('ACC', 'access', 'A', 'n1').sw('LOOSE', 'access', 'A')
    f.run('ACC', 'AGG1')
    f.run('LOOSE', 'AGG1')
    const cards = of(f.snapshot()).groups[0].nodes
    expect(cards.map((c) => [c.key, c.elsewhere])).toEqual([
      ['AGG1|n1', []],
      ['AGG1|', []],
    ])
  })

  it('reads the acceptance fixture: Building A has nothing elsewhere', () => {
    const h = of(acceptanceSnapshot(), 'A')
    expect(h.groups[0].nodes[0].elsewhere).toEqual([])
  })
})
