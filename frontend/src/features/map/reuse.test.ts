import { describe, expect, it } from 'vitest'
import type { MapCardData, MapFlowEdge } from './mapGraph'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { createMapSession } from './mapSession'
import { projectMap } from './mapGraph'
import {
  CARD_FIELDS,
  EDGE_DATA_FIELDS,
  EDGE_FIELDS,
  FACET_FIELDS,
  reuseById,
  sameCardData,
  sameEdge,
} from './reuse'

const equipment = { id: 'a' } as MapCardData['equipment']
const card = (over: Partial<MapCardData> = {}): MapCardData => ({
  equipment,
  location: 'Site / Node',
  summary: { cabled: 1, total: 4 },
  badges: ['Network A'],
  badgeColors: ['#123456'],
  facets: [],
  manualKeys: [],
  highlighted: false,
  dimmed: false,
  proposed: false,
  ...over,
})
const facet = (key: string, automatic = false) => ({
  key,
  equipmentId: 'a',
  label: key,
  endpointIds: [`a:${key}`],
  automatic,
  manual: false,
})
const edge = (over: Partial<MapFlowEdge['data']> = {}): MapFlowEdge => ({
  id: 'e',
  source: 'a',
  target: 'b',
  sourceHandle: 'summary',
  targetHandle: 'summary',
  data: {
    linkIds: ['c1'],
    highlighted: false,
    highlight: false,
    dimmed: false,
    proposed: false,
    networkId: 'net-a',
    color: '#000',
    width: 2,
    count: 1,
    split: false,
    splitIndex: 0,
    splitCount: 1,
    ...over,
  },
})

describe('SC-04 a route change keeps what it does not touch', () => {
  it('cards with the same content are the same (new arrays, equal values)', () => {
    expect(sameCardData(card(), card())).toBe(true)
    expect(
      sameCardData(
        card({ facets: [facet('1')] }),
        card({ facets: [facet('1')] }),
      ),
    ).toBe(true)
  })

  it('a changed flag, facet, summary or badge makes a card different', () => {
    expect(sameCardData(card(), card({ highlighted: true }))).toBe(false)
    expect(sameCardData(card(), card({ dimmed: true }))).toBe(false)
    expect(sameCardData(card(), card({ highlightRole: 'card' }))).toBe(false)
    expect(
      sameCardData(card(), card({ summary: { cabled: 2, total: 4 } })),
    ).toBe(false)
    expect(sameCardData(card(), card({ badges: ['Network B'] }))).toBe(false)
    expect(
      sameCardData(
        card({ facets: [facet('1')] }),
        card({ facets: [facet('1', true)] }),
      ),
    ).toBe(false)
    expect(sameCardData(card({ facets: [facet('1')] }), card())).toBe(false)
    expect(sameCardData(card(), card({ manualKeys: ['1'] }))).toBe(false)
    expect(
      sameCardData(
        card(),
        card({ equipment: { id: 'a', name: 'x' } as MapCardData['equipment'] }),
      ),
    ).toBe(false)
  })

  it('lines compare by their drawn content', () => {
    expect(sameEdge(edge(), edge())).toBe(true)
    expect(sameEdge(edge(), edge({ highlighted: true }))).toBe(false)
    expect(sameEdge(edge(), edge({ linkIds: ['c1', 'c2'], count: 2 }))).toBe(
      false,
    )
    expect(sameEdge(edge(), { ...edge(), source: 'z' })).toBe(false)
  })

  it('reuseById returns the previous object when nothing changed, and the new one otherwise', () => {
    const a = { id: 'a', v: 1 }
    const b = { id: 'b', v: 1 }
    const prior = new Map([
      ['a', a],
      ['b', b],
    ])
    const out = reuseById(
      prior,
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 1 },
      ],
      (x, y) => x.v === y.v,
    )
    expect(out[0]).toBe(a)
    expect(out[1]).not.toBe(b)
    expect(out[1].v).toBe(2)
    expect(out[2].id).toBe('c')
  })
})

describe('SC-04 the comparisons cover every field the projection produces', () => {
  const snapshot = acceptanceSnapshot()
  const session = createMapSession()
  session.setHighlight({ kind: 'node', id: 'node-a' })
  session.toggleSplit('x') // a split pair makes pairKey/split fields appear
  const { nodes, edges } = projectMap({
    snapshot,
    session,
    route: agg03Route(),
    installedIDs: new Set(snapshot.equipment.map((e) => e.id)),
    installedLinkIDs: new Set(snapshot.links.map((l) => l.id)),
  })
  const keysOf = (items: object[]) => [
    ...new Set(items.flatMap((i) => Object.keys(i))),
  ]
  const declared = (list: readonly string[]) => [...list].sort()

  it('every key a card, a facet, a line or its data carries is one the comparison reads', () => {
    expect(declared(CARD_FIELDS)).toEqual(
      expect.arrayContaining(keysOf(nodes.map((n) => n.data)).sort()),
    )
    expect(declared(FACET_FIELDS)).toEqual(
      expect.arrayContaining(
        keysOf(nodes.flatMap((n) => n.data.facets)).sort(),
      ),
    )
    expect(declared(EDGE_FIELDS)).toEqual(
      expect.arrayContaining(keysOf(edges).sort()),
    )
    expect(declared(EDGE_DATA_FIELDS)).toEqual(
      expect.arrayContaining(keysOf(edges.map((e) => e.data)).sort()),
    )
  })

  it('the sample really exercises route facets and lines (so the check above is not empty)', () => {
    expect(nodes.some((n) => n.data.facets.length > 0)).toBe(true)
    expect(keysOf(nodes.map((n) => n.data))).toContain('highlightRole')
    expect(keysOf(edges.map((e) => e.data))).toContain('pairKey')
  })

  it('changing any declared card field, alone, makes the card different', () => {
    const base = nodes.find((n) => n.data.facets.length > 0)!.data
    const changed: Record<string, unknown> = {
      equipment: { ...base.equipment },
      location: base.location + '!',
      summary: { ...base.summary, total: base.summary.total + 1 },
      badges: [...base.badges, 'x'],
      badgeColors: [...base.badgeColors, '#fff'],
      facets: base.facets.slice(1),
      manualKeys: [...base.manualKeys, 'k'],
      highlighted: !base.highlighted,
      highlightRole: base.highlightRole === 'card' ? 'neighbor' : 'card',
      dimmed: !base.dimmed,
      proposed: !base.proposed,
    }
    expect(Object.keys(changed).sort()).toEqual(declared(CARD_FIELDS))
    for (const f of CARD_FIELDS)
      expect(
        sameCardData(base, { ...base, [f]: changed[f] }),
        `card field ${f}`,
      ).toBe(false)
  })

  it('changing any declared line field, alone, makes the line different', () => {
    const base = edges.find((e) => e.data.pairKey)!
    const data: Record<string, unknown> = {
      linkIds: [...base.data.linkIds, 'z'],
      highlighted: !base.data.highlighted,
      highlight: !base.data.highlight,
      dimmed: !base.data.dimmed,
      proposed: !base.data.proposed,
      networkId: base.data.networkId + 'x',
      color: base.data.color + 'x',
      width: base.data.width + 1,
      count: base.data.count + 1,
      pairKey: base.data.pairKey + 'x',
      split: !base.data.split,
      splitIndex: base.data.splitIndex + 1,
      splitCount: base.data.splitCount + 1,
    }
    expect(Object.keys(data).sort()).toEqual(declared(EDGE_DATA_FIELDS))
    for (const f of EDGE_DATA_FIELDS)
      expect(
        sameEdge(base, { ...base, data: { ...base.data, [f]: data[f] } }),
        `edge data ${f}`,
      ).toBe(false)
    const top: Record<string, unknown> = {
      id: base.id + 'x',
      source: base.source + 'x',
      target: base.target + 'x',
      sourceHandle: base.sourceHandle + 'x',
      targetHandle: base.targetHandle + 'x',
      label: (base.label ?? '') + 'x',
    }
    for (const f of EDGE_FIELDS.filter((k) => k !== 'data'))
      expect(sameEdge(base, { ...base, [f]: top[f] }), `edge ${f}`).toBe(false)
  })
})
