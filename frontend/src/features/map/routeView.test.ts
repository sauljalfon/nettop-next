import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import {
  CARD_GAP,
  CARD_WIDTH,
  NODE_PAD,
  RACK_PAD,
  fitIds,
  outlineBoxes,
  outlineNodeId,
  outlineRect,
  routeView,
} from './routeView'
import { indexSnapshot } from './snapshotIndex'

const s = acceptanceSnapshot()
const view = (snapshot = s) => routeView(agg03Route(), indexSnapshot(snapshot))

describe('POL-23 cards, lines and left-to-right layout', () => {
  it('has one card per equipment, in order of first appearance', () => {
    expect(view().cards.map((c) => c.id)).toEqual([
      'EDGE-17',
      'PANEL-A',
      'HDF-01',
      'HDF-02',
      'AGG-03',
    ])
  })

  it('lays the cards out left to right in hop order, on one row', () => {
    const { cards } = view()
    cards.forEach((c, i) => {
      expect(c.x).toBe(i * (CARD_WIDTH + CARD_GAP))
      expect(c.y).toBe(0)
    })
  })

  it('has one line per cable hop with its cable ID and network, and none for internal bridges', () => {
    expect(view().lines).toEqual([
      { linkId: 'A01', from: 'EDGE-17', to: 'PANEL-A', networkId: 'A' },
      { linkId: 'A02', from: 'PANEL-A', to: 'HDF-01', networkId: 'A' },
      { linkId: 'A03', from: 'HDF-01', to: 'HDF-02', networkId: 'A' },
      { linkId: 'A04', from: 'HDF-02', to: 'AGG-03', networkId: 'A' },
    ])
  })

  it('shows a card once when the route comes back to it', () => {
    const route = agg03Route()
    route.hops.push({
      linkId: 'A04',
      from: 'AGG-03:p1',
      to: 'HDF-02:2B/3:r',
      kind: 'cable',
    })
    const { cards } = routeView(route, indexSnapshot(s))
    expect(cards.map((c) => c.id)).toEqual([
      'EDGE-17',
      'PANEL-A',
      'HDF-01',
      'HDF-02',
      'AGG-03',
    ])
  })
})

describe('POL-24 node and rack runs', () => {
  it('has one node run per contiguous stretch, labeled "Site / Node"', () => {
    expect(
      view().nodeRuns.map((r) => [r.label, r.cardIds, r.locationId]),
    ).toEqual([
      ['Main Campus / Building A', ['EDGE-17', 'PANEL-A'], 'node-a'],
      ['Main Campus / North Sub-main', ['HDF-01'], 'node-sm'],
      ['Main Campus / Main Distribution', ['HDF-02', 'AGG-03'], 'node-core'],
    ])
  })

  it('has a rack run only where two or more consecutive cards share a rack', () => {
    expect(view().rackRuns.map((r) => [r.label, r.cardIds])).toEqual([
      ['Rack A03', ['EDGE-17', 'PANEL-A']],
      ['Rack Core 01', ['HDF-02', 'AGG-03']],
    ])
  })

  it('groups by location ID, never by name', () => {
    const renamed = acceptanceSnapshot()
    // Two nodes with the same name stay two runs; one node renamed stays one.
    renamed.nodes.find((n) => n.id === 'node-sm')!.name = 'Building A'
    renamed.nodes.find((n) => n.id === 'node-a')!.name = 'Anything'
    const runs = routeView(agg03Route(), indexSnapshot(renamed)).nodeRuns
    expect(runs.map((r) => r.cardIds)).toEqual([
      ['EDGE-17', 'PANEL-A'],
      ['HDF-01'],
      ['HDF-02', 'AGG-03'],
    ])
  })
})

describe('POL-25 a route that leaves a node and returns', () => {
  it('gets two runs for that node, and no rack run for a lone card', () => {
    const back = acceptanceSnapshot()
    back.equipment.find((e) => e.id === 'AGG-03')!.rackId = 'rack-a03'
    const v = routeView(agg03Route(), indexSnapshot(back))
    expect(v.nodeRuns.map((r) => [r.locationId, r.cardIds])).toEqual([
      ['node-a', ['EDGE-17', 'PANEL-A']],
      ['node-sm', ['HDF-01']],
      ['node-core', ['HDF-02']],
      ['node-a', ['AGG-03']],
    ])
    expect(new Set(v.nodeRuns.map((r) => r.id)).size).toBe(4)
    expect(v.rackRuns.map((r) => r.cardIds)).toEqual([['EDGE-17', 'PANEL-A']])
  })

  it('does not box a card whose node is unknown', () => {
    const lost = acceptanceSnapshot()
    lost.equipment.find((e) => e.id === 'HDF-01')!.rackId = 'nowhere'
    const v = routeView(agg03Route(), indexSnapshot(lost))
    expect(v.nodeRuns.flatMap((r) => r.cardIds)).not.toContain('HDF-01')
    expect(v.cards.map((c) => c.id)).toContain('HDF-01')
  })
})

describe('outline rectangles', () => {
  const a = { x: 0, y: 0, width: 240, height: 100 }
  const b = { x: 360, y: 0, width: 240, height: 140 }

  it('encloses its cards with the padding of its kind', () => {
    const r = outlineRect([a, b], NODE_PAD)
    expect(r).toEqual({
      x: -NODE_PAD.side,
      y: -NODE_PAD.top,
      width: 600 + 2 * NODE_PAD.side,
      height: 140 + NODE_PAD.top + NODE_PAD.bottom,
    })
  })

  it('draws a rack box inside the node box around the same cards', () => {
    const node = outlineRect([a, b], NODE_PAD)
    const rack = outlineRect([a, b], RACK_PAD)
    expect(rack.x).toBeGreaterThan(node.x)
    expect(rack.y).toBeGreaterThan(node.y)
    expect(rack.x + rack.width).toBeLessThan(node.x + node.width)
    expect(rack.y + rack.height).toBeLessThan(node.y + node.height)
  })
})

describe('POL-26 outlines never feed traversal', () => {
  it('is a pure function of the route and the index, and leaves both untouched', () => {
    const snapshot = acceptanceSnapshot()
    const route = agg03Route()
    const before = JSON.stringify([snapshot, route])
    const first = routeView(route, indexSnapshot(snapshot))
    expect(JSON.stringify([snapshot, route])).toBe(before)
    expect(routeView(route, indexSnapshot(snapshot))).toEqual(first)
  })

  it('returns no snapshot, endpoint or link data to traverse: only IDs, labels and positions', () => {
    const v = view()
    expect(Object.keys(v).sort()).toEqual([
      'cards',
      'lines',
      'nodeRuns',
      'rackRuns',
    ])
    for (const run of [...v.nodeRuns, ...v.rackRuns])
      expect(Object.keys(run).sort()).toEqual([
        'cardIds',
        'id',
        'label',
        'locationId',
      ])
  })
})

describe('POL-31 what the route view fits to', () => {
  const cardRect = (id: string, model = view()) => {
    const c = model.cards.find((x) => x.id === id)!
    return { x: c.x, y: c.y, width: CARD_WIDTH, height: 120 }
  }

  it('boxes every run around its measured cards, node boxes outside rack boxes', () => {
    const model = view()
    const boxes = outlineBoxes(model, (id) => cardRect(id, model))
    expect(boxes.map((b) => [b.kind, b.label])).toEqual([
      ['node', 'Main Campus / Building A'],
      ['node', 'Main Campus / North Sub-main'],
      ['node', 'Main Campus / Main Distribution'],
      ['rack', 'Rack A03'],
      ['rack', 'Rack Core 01'],
    ])
    const [a, , , rackA] = boxes
    expect(rackA.rect.x).toBeGreaterThan(a.rect.x)
    expect(rackA.rect.y + rackA.rect.height).toBeLessThan(
      a.rect.y + a.rect.height,
    )
  })

  it('skips a run whose cards are not measured or placed yet', () => {
    expect(outlineBoxes(view(), () => undefined)).toEqual([])
  })

  it('fits to every card and every box, by the IDs the canvas draws them with', () => {
    const model = view()
    expect(fitIds(model)).toEqual([
      ...model.cards.map((c) => c.id),
      ...model.nodeRuns.map((r) => outlineNodeId(r.id)),
      ...model.rackRuns.map((r) => outlineNodeId(r.id)),
    ])
    expect(fitIds(model)).toHaveLength(5 + 3 + 2)
  })
})
