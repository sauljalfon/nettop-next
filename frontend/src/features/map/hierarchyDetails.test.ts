import { describe, expect, it } from 'vitest'
import { buildHierarchies } from './hierarchy'
import {
  cardByKey,
  MARK_TEXT,
  nodeRows,
  switchWalks,
  tierLinks,
  tierUnder,
} from './hierarchyDetails'
import { hierarchyFixture } from './hierarchyFixture'
import { indexSnapshot } from './snapshotIndex'

/** BB over AGG1 and AGG2 (peered), Hall 1 with a chain A1 <- A2 <- A3 and a single-uplink S. */
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
  return { index, h, card }
}

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
    expect(by.S.mark).toBe('single')
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
      'one uplink',
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
    expect(viaPanel.via).toEqual([{ equipmentId: 'PP', place: '1' }])
    expect(index.lookup.endpoints.get(viaPanel.start)!.equipmentId).toBe('A1')
    expect(index.lookup.endpoints.get(viaPanel.end)!.equipmentId).toBe('AGG1')
    expect(walks.find((w) => w.farId === 'AGG2')!.via).toEqual([])
    expect(walks.some((w) => w.farId === 'A1')).toBe(false)
  })

  it('lists a tier card’s links as up, down or peer link, with the ports at both ends', () => {
    const { index, h } = fixture()
    const bb = tierLinks(h, index, 'BB')
    expect(bb.map((l) => [l.kind, l.otherId])).toEqual([['down', 'AGG1']])
    expect(tierLinks(h, index, 'AGG1').map((l) => [l.kind, l.otherId])).toEqual(
      [
        ['up', 'BB'],
        ['peer link', 'AGG2'],
      ],
    )
    const link = tierLinks(h, index, 'AGG1')[0]
    expect(index.lookup.endpoints.get(link.mine)!.equipmentId).toBe('AGG1')
    expect(index.lookup.endpoints.get(link.theirs)!.equipmentId).toBe('BB')
  })

  it('says what is under an AGG and who it is shared with; nothing for a BB with no group', () => {
    const { h } = fixture()
    expect(tierUnder(h, 'AGG1')).toEqual({
      nodes: 1,
      switches: 4,
      sharedWith: ['AGG2'],
    })
    expect(tierUnder(h, 'BB')).toBeUndefined()
  })
})
