import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { buildHierarchies } from './hierarchy'
import { hierarchyFixture } from './hierarchyFixture'
import { dependents, litBy, type Selection } from './hierarchySelection'
import { indexSnapshot } from './snapshotIndex'

const lit = (s: Snapshot, selection: Selection) => {
  const index = indexSnapshot(s)
  return litBy(buildHierarchies(index), index, selection)
}
const equipment = (s: Snapshot, id: string) => lit(s, { kind: 'equipment', id })
const deps = (s: Snapshot, id: string) => {
  const index = indexSnapshot(s)
  return dependents(buildHierarchies(index), index, id)
}
const sorted = (set: ReadonlySet<string>) => [...set].sort()

/** Network A: a BB, two unjoined AGGs under it, three halls. */
const net = () => {
  const f = hierarchyFixture()
    .site('s1', 'Main')
    .node('n1', 's1', 'Hall 1')
    .node('n2', 's1', 'Hall 2')
    .node('n3', 's1', 'Hall 3')
    .node('n4', 's1', 'Hall 4')
    .sw('BB1', 'backbone', 'A')
    .sw('AGG1', 'aggregation', 'A')
    .sw('AGG2', 'aggregation', 'A')
  f.run('AGG1', 'BB1')
  f.run('AGG2', 'BB1')
  return f
}

describe('OV-03 an access switch', () => {
  it('lights its card, frame, AGG and top, and opens its card', () => {
    const f = net()
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC2', 'access', 'A', 'n2')
    f.run('ACC1', 'AGG1')
    f.run('ACC2', 'AGG2')
    const l = equipment(f.snapshot(), 'ACC1')
    expect(l.networkId).toBe('A')
    expect(sorted(l.switches)).toEqual(['ACC1'])
    expect(sorted(l.cards)).toEqual(['AGG1|n1'])
    expect(sorted(l.frames)).toEqual(['AGG1'])
    expect(sorted(l.aggs)).toEqual(['AGG1'])
    expect(sorted(l.tops)).toEqual(['BB1'])
    expect(l.cutOff.size).toBe(0)
    expect(l.openCards).toEqual(['AGG1|n1'])
    expect(l.scrollTo).toBe('AGG1|n1')
  })

  it('lights a chained switch through its parent', () => {
    const f = net()
      .sw('PARENT', 'access', 'A', 'n1')
      .sw('CHILD', 'access', 'A', 'n2')
    f.run('PARENT', 'AGG1')
    f.run('CHILD', 'PARENT')
    const l = equipment(f.snapshot(), 'CHILD')
    expect(sorted(l.switches)).toEqual(['CHILD', 'PARENT'])
    expect(sorted(l.aggs)).toEqual(['AGG1'])
    expect(sorted(l.tops)).toEqual(['BB1'])
    expect(sorted(l.cards)).toEqual(['AGG1|n1', 'AGG1|n2'])
    expect(l.openCards).toEqual(['AGG1|n2'])
  })

  it('lights its chained dependents, and cuts them off', () => {
    const f = net()
      .sw('PARENT', 'access', 'A', 'n1')
      .sw('CHILD', 'access', 'A', 'n2')
    f.run('PARENT', 'AGG1')
    f.run('CHILD', 'PARENT')
    const l = equipment(f.snapshot(), 'PARENT')
    expect(sorted(l.switches)).toEqual(['CHILD', 'PARENT'])
    expect(sorted(l.cutOff)).toEqual(['CHILD'])
    expect(l.openCards).toEqual(['AGG1|n1'])
  })

  it('lights only its own card on a split node', () => {
    const f = net()
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC2', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG1')
    f.run('ACC2', 'AGG2')
    const l = equipment(f.snapshot(), 'ACC1')
    expect(sorted(l.cards)).toEqual(['AGG1|n1'])
    expect(sorted(l.frames)).toEqual(['AGG1'])
  })

  it('lights a switch with no uplink in the No AGG frame only', () => {
    const f = net().sw('LOST', 'access', 'A', 'n3')
    const l = equipment(f.snapshot(), 'LOST')
    expect(l.networkId).toBe('A')
    expect(sorted(l.cards)).toEqual(['none|n3'])
    expect(sorted(l.frames)).toEqual(['none'])
    expect(l.aggs.size + l.tops.size).toBe(0)
    expect(l.openCards).toEqual(['none|n3'])
  })
})

describe('OV-03 a card', () => {
  it('lights every switch of the card and opens it', () => {
    const f = net()
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC3', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG1')
    f.run('ACC3', 'AGG1')
    const l = lit(f.snapshot(), {
      kind: 'card',
      networkId: 'A',
      key: 'AGG1|n1',
    })
    expect(l.networkId).toBe('A')
    expect(sorted(l.switches)).toEqual(['ACC1', 'ACC3'])
    expect(sorted(l.cards)).toEqual(['AGG1|n1'])
    expect(sorted(l.aggs)).toEqual(['AGG1'])
    expect(sorted(l.tops)).toEqual(['BB1'])
    expect(l.openCards).toEqual(['AGG1|n1'])
    expect(l.scrollTo).toBe('AGG1|n1')
  })

  it('looks only in its own network when two networks have the same key', () => {
    const f = net().sw('LOSTA', 'access', 'A', 'n3')
    f.sw('LOSTB', 'access', 'B', 'n3')
    const s = f.snapshot()
    const a = lit(s, { kind: 'card', networkId: 'A', key: 'none|n3' })
    expect(a.networkId).toBe('A')
    expect(sorted(a.switches)).toEqual(['LOSTA'])
    const b = lit(s, { kind: 'card', networkId: 'B', key: 'none|n3' })
    expect(b.networkId).toBe('B')
    expect(sorted(b.switches)).toEqual(['LOSTB'])
    const none = lit(s, { kind: 'card', networkId: 'C', key: 'none|n3' })
    expect(none.networkId).toBeUndefined()
  })

  it('is empty for a card that is not there', () => {
    const l = lit(net().snapshot(), {
      kind: 'card',
      networkId: 'A',
      key: 'nope|n9',
    })
    expect(l.networkId).toBeUndefined()
    expect(l.cards.size).toBe(0)
    expect(l.openCards).toEqual([])
  })
})

describe('OV-03 a mid AGG', () => {
  it('lights its frame, its tops and its switches, and opens no card', () => {
    const f = net()
      .sw('ACC1', 'access', 'A', 'n1')
      .sw('ACC2', 'access', 'A', 'n2')
    f.run('ACC1', 'AGG1')
    f.run('ACC2', 'AGG2')
    const l = equipment(f.snapshot(), 'AGG1')
    expect(l.networkId).toBe('A')
    expect(sorted(l.aggs)).toEqual(['AGG1'])
    expect(sorted(l.frames)).toEqual(['AGG1'])
    expect(sorted(l.tops)).toEqual(['BB1'])
    expect(sorted(l.switches)).toEqual(['ACC1'])
    expect(sorted(l.cards)).toEqual(['AGG1|n1'])
    expect(l.openCards).toEqual([])
    expect(l.scrollTo).toBe('AGG1')
  })
})

describe('OV-03 a top', () => {
  it('lights the frames cabled to it and no cards', () => {
    const f = net().sw('ACC1', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG1')
    const l = equipment(f.snapshot(), 'BB1')
    expect(sorted(l.tops)).toEqual(['BB1'])
    expect(sorted(l.aggs)).toEqual(['AGG1', 'AGG2'])
    expect(sorted(l.frames)).toEqual(['AGG1', 'AGG2'])
    expect(l.cards.size).toBe(0)
    expect(l.openCards).toEqual([])
    expect(l.scrollTo).toBe('BB1')
  })

  it('lights the Direct to BB frame when a switch reaches it directly', () => {
    const f = net().sw('ACCD', 'access', 'A', 'n3')
    f.run('ACCD', 'BB1')
    const l = equipment(f.snapshot(), 'BB1')
    expect(sorted(l.frames)).toEqual(['AGG1', 'AGG2', 'top'])
    expect(l.cards.size).toBe(0)
  })
})

describe('OV-03 a panel or HDF', () => {
  const through = (nodes: string[], net_ = 'A') => {
    const f = net()
    nodes.forEach((n, i) => {
      f.sw(`S${net_}${i}`, 'access', net_, n)
      f.run(`S${net_}${i}`, 'AGG1', ['P1'])
    })
    return f
  }

  it('lights the switches through it and opens their cards when there are 3 or fewer', () => {
    const f = net().panel('P1', 'n4').sw('ACC1', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG1', ['P1'])
    const l = equipment(f.snapshot(), 'P1')
    expect(l.networkId).toBe('A')
    expect(sorted(l.switches)).toEqual(['ACC1'])
    expect(l.openCards).toEqual(['AGG1|n1'])
    expect(l.scrollTo).toBe('AGG1|n1')
  })

  it('opens none when 4 or more cards are lit', () => {
    const f = through(['n1', 'n2', 'n3', 'n4']).panel('P1', 'n4')
    const l = equipment(f.snapshot(), 'P1')
    expect(l.switches.size).toBe(4)
    expect(l.openCards).toEqual([])
    expect(l.scrollTo).toBe('AGG1|n1')
  })

  /** Network B: its own BB and AGG, and switches through the same panel. */
  const twoNetworks = (a: number, b: number) => {
    const f = net().panel('P1', 'n4')
    f.sw('BBB', 'backbone', 'B').sw('AGGB', 'aggregation', 'B')
    f.run('AGGB', 'BBB')
    for (let i = 0; i < a; i++) {
      f.sw(`A${i}`, 'access', 'A', 'n1')
      f.run(`A${i}`, 'AGG1', ['P1'])
    }
    for (let i = 0; i < b; i++) {
      f.sw(`B${i}`, 'access', 'B', 'n2')
      f.run(`B${i}`, 'AGGB', ['P1'])
    }
    return f
  }

  it('picks the network most of its switches are on', () => {
    const l = equipment(twoNetworks(1, 2).snapshot(), 'P1')
    expect(l.networkId).toBe('B')
    expect(sorted(l.switches)).toEqual(['B0', 'B1'])
  })

  it('gives a tie to the first network', () => {
    const l = equipment(twoNetworks(1, 1).snapshot(), 'P1')
    expect(l.networkId).toBe('A')
    expect(sorted(l.switches)).toEqual(['A0'])
  })
})

describe('OV-03 anything else', () => {
  it('is empty for an unknown ID and for a switch on no network', () => {
    const f = net().sw('ORPHAN', 'access', '', 'n1')
    for (const id of ['nope', 'ORPHAN']) {
      const l = equipment(f.snapshot(), id)
      expect(l.networkId).toBeUndefined()
      for (const set of [
        l.cards,
        l.frames,
        l.aggs,
        l.tops,
        l.switches,
        l.cutOff,
      ])
        expect(set.size).toBe(0)
      expect(l.openCards).toEqual([])
      expect(l.scrollTo).toBeUndefined()
    }
  })
})

describe('OV-03 acceptance', () => {
  it('EDGE-17 lights its card, AGG-03, AGG-08 and BB-01', () => {
    const s = acceptanceSnapshot()
    const index = indexSnapshot(s)
    const h = buildHierarchies(index).get('A')!
    const card = h.groups
      .flatMap((g) => g.nodes)
      .find((c) => c.switchIds.includes('EDGE-17'))!
    const l = litBy(buildHierarchies(index), index, {
      kind: 'equipment',
      id: 'EDGE-17',
    })
    expect(l.networkId).toBe('A')
    expect(sorted(l.cards)).toEqual([card.key])
    expect(l.openCards).toEqual([card.key])
    expect(sorted(l.aggs)).toEqual(['AGG-03', 'AGG-08'])
    expect(sorted(l.tops)).toEqual(['BB-01'])
  })

  it('HDF-01 lights EDGE-17’s card', () => {
    const s = acceptanceSnapshot()
    const index = indexSnapshot(s)
    const hs = buildHierarchies(index)
    const card = hs
      .get('A')!
      .groups.flatMap((g) => g.nodes)
      .find((c) => c.switchIds.includes('EDGE-17'))!
    const l = litBy(hs, index, { kind: 'equipment', id: 'HDF-01' })
    expect(l.networkId).toBe('A')
    expect(l.switches.has('EDGE-17')).toBe(true)
    expect(l.cards.has(card.key)).toBe(true)
  })
})

describe('OV-04 dependents', () => {
  it('cuts off a switch whose only uplink is the AGG', () => {
    const f = net().sw('ACC1', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG1')
    expect(deps(f.snapshot(), 'AGG1')).toEqual([{ id: 'ACC1', cutOff: true }])
  })

  it('does not cut off a switch with an AGG pair when one AGG fails', () => {
    const f = net().sw('ACC1', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG1')
    f.run('ACC1', 'AGG2')
    expect(deps(f.snapshot(), 'AGG1')).toEqual([{ id: 'ACC1', cutOff: false }])
  })

  it('cuts a passive off only for switches whose every circuit runs through it', () => {
    const f = net()
      .panel('P1', 'n4')
      .sw('ONLY', 'access', 'A', 'n1')
      .sw('BOTH', 'access', 'A', 'n2')
    f.run('ONLY', 'AGG1', ['P1'])
    f.run('BOTH', 'AGG1', ['P1'])
    f.run('BOTH', 'AGG2')
    expect(deps(f.snapshot(), 'P1')).toEqual([
      { id: 'ONLY', cutOff: true },
      { id: 'BOTH', cutOff: false },
    ])
  })

  it('cuts a chained child off when its parent fails, and lists both under the AGG', () => {
    const f = net()
      .sw('PARENT', 'access', 'A', 'n1')
      .sw('CHILD', 'access', 'A', 'n2')
    f.run('PARENT', 'AGG1')
    f.run('CHILD', 'PARENT')
    expect(deps(f.snapshot(), 'PARENT')).toEqual([
      { id: 'CHILD', cutOff: true },
    ])
    expect(deps(f.snapshot(), 'AGG1')).toEqual([
      { id: 'CHILD', cutOff: true },
      { id: 'PARENT', cutOff: true },
    ])
  })

  it('does not cut one of two peers off when the other fails', () => {
    const f = net()
      .sw('PEER1', 'access', 'A', 'n1')
      .sw('PEER2', 'access', 'A', 'n2')
    f.run('PEER1', 'AGG1')
    f.run('PEER2', 'AGG2')
    f.run('PEER1', 'PEER2')
    expect(deps(f.snapshot(), 'PEER1')).toEqual([
      { id: 'PEER2', cutOff: false },
    ])
    expect(deps(f.snapshot(), 'PEER2')).toEqual([
      { id: 'PEER1', cutOff: false },
    ])
  })

  it('cuts a switch under an AGG with no BB off when that AGG fails', () => {
    const f = net()
      .sw('AGG3', 'aggregation', 'A')
      .sw('ACC1', 'access', 'A', 'n1')
    f.run('ACC1', 'AGG3')
    expect(deps(f.snapshot(), 'AGG3')).toEqual([{ id: 'ACC1', cutOff: true }])
  })

  it('lists a switch with no way up under nothing', () => {
    const f = net().sw('LOST', 'access', 'A', 'n3')
    for (const id of ['AGG1', 'AGG2', 'BB1'])
      expect(deps(f.snapshot(), id).map((d) => d.id)).not.toContain('LOST')
  })

  it('lists a mid AGG under its top, cut off first, then by name', () => {
    const f = net().sw('ACC1', 'access', 'A', 'n1', 'Alpha')
    f.run('ACC1', 'AGG1')
    f.run('ACC1', 'AGG2')
    expect(deps(f.snapshot(), 'BB1')).toEqual([
      { id: 'AGG1', cutOff: true },
      { id: 'AGG2', cutOff: true },
      { id: 'ACC1', cutOff: true },
    ])
  })
})
