import { describe, expect, it } from 'vitest'
import { buildHierarchies } from './hierarchy'
import {
  cables,
  passiveSentence,
  cardByKey,
  MARK_TEXT,
  nodeRows,
  switchWalks,
  wayUp,
  type WayStep,
} from './hierarchyDetails'
import { hierarchyFixture } from './hierarchyFixture'
import { indexSnapshot } from './snapshotIndex'

/** BB over AGG1 and AGG2 (peered), Hall 1 with a chain A1 <- A2 <- A3 and S with one uplink. */
function fixture() {
  const f = hierarchyFixture()
    .site('s1', 'Main')
    .node('n1', 's1', 'Hall 1')
    .sw('BB', 'backbone', 'A')
    .sw('AGG1', 'aggregation', 'A')
    .sw('AGG2', 'aggregation', 'A')
    .panel('PP', 'n1')
    .sw('A1', 'access', 'A', 'n1')
    .sw('A2', 'access', 'A', 'n1')
    .sw('A3', 'access', 'A', 'n1')
    .sw('S', 'access', 'A', 'n1')
  f.run('BB', 'AGG1')
  f.run('AGG1', 'AGG2')
  f.run('A1', 'AGG1', ['PP'])
  f.run('A1', 'AGG2')
  f.run('A2', 'A1')
  f.run('A3', 'A2')
  f.run('S', 'AGG1')
  const index = indexSnapshot(f.snapshot())
  const h = buildHierarchies(index).get('A')!
  const card = h.groups[0].nodes[0]
  return { index, h, card, hs: buildHierarchies(index) }
}
const fixture2 = fixture

describe('HI-09 the drawer’s model', () => {
  it('finds a card by its key: a node card, a tier card, or nothing', () => {
    const { h, card } = fixture()
    expect(cardByKey(h, card.key)).toMatchObject({ kind: 'node' })
    expect(cardByKey(h, 'AGG1')).toEqual({ kind: 'tier', id: 'AGG1' })
    expect(cardByKey(h, 'BB')).toEqual({ kind: 'tier', id: 'BB' })
    expect(cardByKey(h, 'gone')).toBeUndefined()
    expect(cardByKey(h, undefined)).toBeUndefined()
  })

  it('lists the switches with chained ones under their parent, and where each goes', () => {
    const { index, h, card } = fixture()
    const rows = nodeRows(h, index, card)
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['A1', 0],
      ['A2', 1],
      ['A3', 2],
      ['S', 0],
    ])
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by.A1.toIds).toEqual(['AGG1', 'AGG2'])
    expect(by.A2.toIds).toEqual(['A1'])
    expect(by.A3.toIds).toEqual(['A2'])
    expect(by.S.toIds).toEqual(['AGG1'])
    expect(by.A1.mark).toBeUndefined()
    expect(by.A2.mark).toBe('chained')
    expect(by.S.mark).toBeUndefined()
  })

  it('says a switch with no uplink has none, and one that reaches another network names it', () => {
    const f = hierarchyFixture()
      .node('n1', 's1', 'Hall')
      .sw('AGG', 'aggregation', 'A')
      .sw('B-AGG', 'aggregation', 'B')
      .sw('LONE', 'access', 'A', 'n1')
      .sw('WRONG', 'access', 'A', 'n1')
    f.run('WRONG', 'B-AGG')
    const index = indexSnapshot(f.snapshot())
    const h = buildHierarchies(index).get('A')!
    const none = h.groups.find((g) => g.kind === 'none')!
    const rows = nodeRows(h, index, none.nodes[0])
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by.LONE).toMatchObject({ toIds: [], mark: 'no-uplink' })
    expect(by.LONE.other).toBeUndefined()
    expect(by.WRONG).toMatchObject({ toIds: [], mark: 'other-network' })
    expect(by.WRONG.other).toEqual([{ farId: 'B-AGG', networkId: 'B' }])
    expect(Object.values(MARK_TEXT)).toEqual([
      'chained',
      'no uplink',
      'other network',
    ])
  })

  it('reads a switch’s walks: ports at both ends and the panels passed, or direct', () => {
    const { index } = fixture()
    const walks = switchWalks(index, 'A1')
    // Every walk that reaches a switch: its two uplinks, and A2's cable behind it.
    expect(walks.map((w) => w.farId).sort()).toEqual(['A2', 'AGG1', 'AGG2'])
    const viaPanel = walks.find((w) => w.farId === 'AGG1')!
    expect(viaPanel.via).toEqual([
      { equipmentId: 'PP', place: '1', endpointId: 'PP:1:f' },
    ])
    expect(index.lookup.endpoints.get(viaPanel.start)!.equipmentId).toBe('A1')
    expect(index.lookup.endpoints.get(viaPanel.end)!.equipmentId).toBe('AGG1')
    expect(walks.find((w) => w.farId === 'AGG2')!.via).toEqual([])
    expect(walks.some((w) => w.farId === 'A1')).toBe(false)
  })
})

/** A BB, both AGGs cabled to it (a pair), and the switches under them. */
function pairFixture() {
  const f = hierarchyFixture()
    .site('s1', 'Main')
    .node('n1', 's1', 'Hall 1')
    .sw('BB', 'backbone', 'A')
    .sw('AGG1', 'aggregation', 'A')
    .sw('AGG2', 'aggregation', 'A')
    .panel('PP', 'n1')
    .sw('PAIR', 'access', 'A', 'n1')
    .sw('LOST', 'access', 'A', 'n1')
  f.run('BB', 'AGG1')
  f.run('BB', 'AGG2')
  f.run('AGG1', 'AGG2')
  f.run('PAIR', 'AGG1', ['PP'])
  f.run('PAIR', 'AGG2')
  const index = indexSnapshot(f.snapshot())
  return { f, index, hs: buildHierarchies(index) }
}

describe('OV-05 the way up', () => {
  it('gives a pair switch one row per uplink, each to its AGG and then the BBs', () => {
    const { index, hs } = pairFixture()
    const rows = wayUp(hs, index, 'PAIR')
    expect(rows).toEqual<WayStep[][]>([
      [
        { kind: 'port', endpointId: 'PAIR:p1' },
        {
          kind: 'passive',
          equipmentId: 'PP',
          endpointId: 'PP:1:f',
          place: '1',
        },
        { kind: 'device', equipmentId: 'AGG1' },
        { kind: 'tops', ids: ['BB'] },
      ],
      [
        { kind: 'port', endpointId: 'PAIR:p2' },
        { kind: 'device', equipmentId: 'AGG2' },
        { kind: 'tops', ids: ['BB'] },
      ],
    ])
  })

  it('continues a chained switch through its parent, marking the first hop', () => {
    const { index, hs } = fixture2()
    const rows = wayUp(hs, index, 'A2')
    expect(rows[0].slice(0, 2)).toEqual<WayStep[]>([
      { kind: 'port', endpointId: 'A2:p1' },
      { kind: 'device', equipmentId: 'A1', fault: 'chained only' },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].map((x) => x.kind)).toEqual([
      'port',
      'device',
      'passive',
      'device',
      'tops',
    ])
    expect(rows[1].map((x) => x.kind)).toEqual([
      'port',
      'device',
      'device',
      'gap',
    ])
    // A parent's own port is not repeated.
    expect(
      rows.every((r) => r.filter((x) => x.kind === 'port').length === 1),
    ).toBe(true)
  })

  it('gives a switch with no uplink the gap', () => {
    const { index, hs } = pairFixture()
    expect(wayUp(hs, index, 'LOST')).toEqual<WayStep[][]>([
      [{ kind: 'gap', text: [{ text: 'No uplink · no port cabled' }] }],
    ])
  })

  it('gives an AGG with no BB the gap, and names it where a switch reaches it', () => {
    const { index, hs } = fixture2()
    expect(wayUp(hs, index, 'AGG2')).toEqual<WayStep[][]>([
      [{ kind: 'gap', text: [{ text: 'No BB uplink' }] }],
    ])
    const rows = wayUp(hs, index, 'S')
    expect(rows).toEqual<WayStep[][]>([
      [
        { kind: 'port', endpointId: 'S:p1' },
        { kind: 'device', equipmentId: 'AGG1' },
        { kind: 'tops', ids: ['BB'] },
      ],
    ])
    const a1 = wayUp(hs, index, 'A1')
    expect(a1[1].at(-1)).toEqual({
      kind: 'gap',
      text: [{ name: 'AGG2' }, { text: ' has no BB uplink' }],
    })
  })

  it('gives an AGG its tops, and a top, a passive or an unknown ID nothing', () => {
    const { index, hs } = pairFixture()
    expect(wayUp(hs, index, 'AGG1')).toEqual<WayStep[][]>([
      [
        { kind: 'port', endpointId: 'AGG1:p1' },
        { kind: 'device', equipmentId: 'BB' },
      ],
    ])
    for (const id of ['BB', 'PP', 'nope'])
      expect(wayUp(hs, index, id)).toEqual([])
  })

  it('marks a switch that reaches only another network', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1')
      .sw('BB', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .sw('BAGG', 'aggregation', 'B')
      .sw('WRONG', 'access', 'A', 'n1')
    f.run('BB', 'AGG1')
    f.run('WRONG', 'BAGG')
    const index = indexSnapshot(f.snapshot())
    expect(wayUp(buildHierarchies(index), index, 'WRONG')).toEqual<WayStep[][]>(
      [
        [
          { kind: 'port', endpointId: 'WRONG:p1' },
          { kind: 'device', equipmentId: 'BAGG', fault: 'other network' },
        ],
      ],
    )
  })
})

describe('OV-05 the cables', () => {
  it('lists each cabled port with its far end, in port order', () => {
    const { index } = fixture2()
    expect(
      cables(index, 'A1').map((c) => [c.endpointId, c.farEquipmentId]),
    ).toEqual([
      ['A1:p1', 'PP'],
      ['A1:p2', 'AGG2'],
      ['A1:p3', 'A2'],
    ])
    expect(
      cables(index, 'PP').map((c) => [c.endpointId, c.farEquipmentId]),
    ).toEqual([
      ['PP:1:f', 'A1'],
      ['PP:1:r', 'AGG1'],
    ])
  })

  it('orders ports by number, not by text, and skips free ports', () => {
    const f = hierarchyFixture()
      .node('n1', 's1')
      .sw('S', 'access', 'A', 'n1')
      .panel('P', 'n1')
    for (let i = 0; i < 11; i++) f.deadEnd('S', 'P')
    const index = indexSnapshot(f.snapshot())
    expect(cables(index, 'S').map((c) => c.endpointId)).toEqual(
      Array.from({ length: 11 }, (_, i) => `S:p${i + 1}`),
    )
    expect(cables(index, 'nope')).toEqual([])
  })
})

describe('OV-08 the sentence of a passive', () => {
  it('says how many circuits of which network run through it', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1')
      .sw('BB', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .panel('PP', 'n1')
      .sw('S1', 'access', 'A', 'n1')
      .sw('S2', 'access', 'A', 'n1')
    f.run('BB', 'AGG1')
    f.run('S1', 'AGG1', ['PP'])
    f.run('S2', 'AGG1', ['PP'])
    f.run('S2', 'AGG1', ['PP'])
    const index = indexSnapshot(f.snapshot())
    const hs = buildHierarchies(index)
    expect(passiveSentence(hs, index, 'PP')).toEqual([
      { text: '3 circuits of ' },
      { name: 'Network A' },
      { text: ' run through it.' },
    ])
  })

  it('uses the singular, and says nothing for a passive no circuit runs through', () => {
    const f = hierarchyFixture()
      .site('s1', 'Main')
      .node('n1', 's1')
      .sw('BB', 'backbone', 'A')
      .sw('AGG1', 'aggregation', 'A')
      .panel('PP', 'n1')
      .panel('IDLE', 'n1')
      .sw('S1', 'access', 'A', 'n1')
    f.run('BB', 'AGG1')
    f.run('S1', 'AGG1', ['PP'])
    const index = indexSnapshot(f.snapshot())
    const hs = buildHierarchies(index)
    expect(passiveSentence(hs, index, 'PP')).toEqual([
      { text: '1 circuit of ' },
      { name: 'Network A' },
      { text: ' runs through it.' },
    ])
    expect(passiveSentence(hs, index, 'IDLE')).toBeUndefined()
    expect(passiveSentence(hs, index, 'S1')).toBeUndefined()
  })
})
