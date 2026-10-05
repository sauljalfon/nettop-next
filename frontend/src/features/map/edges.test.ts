import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { crossNetworkCaption, lineWidth, mapEdges, pairKey } from './edges'

const all = (s = acceptanceSnapshot()) => new Set(s.equipment.map((e) => e.id))
const cableIds = (s = acceptanceSnapshot()) =>
  s.links
    .filter((l) => l.kind === 'cable')
    .map((l) => l.id)
    .sort()

describe('C01 default map is equipment plus actual cable references', () => {
  it('has one card per equipment and one cable record per cable', () => {
    const s = acceptanceSnapshot()
    const { edges, bundles } = mapEdges(s, all(s), new Set())
    const represented = [
      ...edges.map((e) => e.id),
      ...bundles.flatMap((b) => b.linkIds),
    ]
    expect(represented.sort()).toEqual(cableIds(s))
    expect(cableIds(s)).toHaveLength(16)
  })

  it('never turns internal bridges into edges', () => {
    const s = acceptanceSnapshot()
    const { edges, bundles } = mapEdges(s, all(s), new Set())
    const ids = [
      ...edges.map((e) => e.id),
      ...bundles.flatMap((b) => b.linkIds),
    ]
    expect(ids.some((id) => id.endsWith(':bridge'))).toBe(false)
  })

  it('draws only cables between shown cards', () => {
    const s = acceptanceSnapshot()
    const shown = new Set(['EDGE-17', 'PANEL-A'])
    const { edges, bundles } = mapEdges(s, shown, new Set())
    const ids = [
      ...edges.map((e) => e.id),
      ...bundles.flatMap((b) => b.linkIds),
    ]
    expect(ids.sort()).toEqual(['A01', 'A05', 'A09'])
  })
})

describe('C09 cable bundles keep real cable IDs', () => {
  it('bundles parallel summary-anchored cables and keeps every ID', () => {
    const s = acceptanceSnapshot()
    const { edges, bundles } = mapEdges(s, all(s), new Set())
    const bundle = bundles.find((b) => b.linkIds.includes('A01'))!
    expect(bundle.linkIds).toEqual(['A01', 'A05', 'A09'])
    expect(bundle).not.toHaveProperty('label')
    expect(edges.find((e) => e.id === 'A01')).toBeUndefined()
  })

  it('does not bundle a single cable', () => {
    const s = acceptanceSnapshot()
    const { edges } = mapEdges(s, all(s), new Set())
    expect(edges.find((e) => e.id === 'B01')).toBeDefined()
  })

  it('attaches an edge to a facet handle instead of bundling it', () => {
    const s = acceptanceSnapshot()
    const { edges, bundles } = mapEdges(
      s,
      all(s),
      new Set(['EDGE-17:p1', 'PANEL-A:1:f']),
    )
    const edge = edges.find((e) => e.id === 'A01')!
    expect(edge.sourceHandle).toBe('EDGE-17:p1')
    expect(edge.targetHandle).toBe('PANEL-A:1:f')
    expect(bundles.find((b) => b.linkIds.includes('A05'))!.linkIds).toEqual([
      'A05',
      'A09',
    ])
  })

  it('uses the summary anchor when only one end is a facet', () => {
    const s = acceptanceSnapshot()
    const { edges } = mapEdges(s, all(s), new Set(['EDGE-17:p1']))
    const edge = edges.find((e) => e.id === 'A01')!
    expect(edge.sourceHandle).toBe('EDGE-17:p1')
    expect(edge.targetHandle).toBe('summary')
  })

  it('keeps summary anchors out of the topology: edges reference real endpoints only', () => {
    const s = acceptanceSnapshot()
    const before = JSON.stringify(s)
    const { edges, bundles } = mapEdges(s, all(s), new Set())
    const endpointIds = new Set(s.endpoints.map((e) => e.id))
    for (const e of edges) {
      expect(endpointIds.has(e.sourceEndpointId)).toBe(true)
      expect(endpointIds.has(e.targetEndpointId)).toBe(true)
    }
    expect(JSON.stringify(s)).toBe(before)
    expect(bundles.every((b) => !('endpointIds' in b))).toBe(true)
  })

  it('is deterministic regardless of link order', () => {
    const s = acceptanceSnapshot()
    const reversed = { ...s, links: [...s.links].reverse() }
    expect(mapEdges(reversed, all(s), new Set())).toEqual(
      mapEdges(s, all(s), new Set()),
    )
  })
})

describe('C07/C08 edges carry the circuit network and bundles never mix networks', () => {
  it('gives each cable the network of its circuit', () => {
    const s = acceptanceSnapshot()
    const { edges } = mapEdges(s, all(s), new Set())
    expect(edges.find((e) => e.id === 'B01')!.networkId).toBe('B')
    expect(edges.find((e) => e.id === 'B04')!.networkId).toBe('B')
  })

  it('leaves the network empty when the circuit is unresolved', () => {
    const s = acceptanceSnapshot()
    // A direct cable between two active devices has no passive circuit to classify.
    s.links.push({
      id: 'X1',
      kind: 'cable',
      a: 'AGG-15:p1',
      b: 'AGG-12:p1',
    })
    const { edges } = mapEdges(s, all(s), new Set())
    expect(edges.find((e) => e.id === 'X1')!.networkId).toBe('')
  })

  it('splits parallel cables of different networks into separate bundles', () => {
    const s = acceptanceSnapshot()
    const { edges, bundles } = mapEdges(s, all(s), new Set())
    const hdf = bundles.filter(
      (b) => b.source.startsWith('HDF') && b.target.startsWith('HDF'),
    )
    expect(hdf).toHaveLength(1)
    expect(hdf[0].networkId).toBe('A')
    expect(hdf[0].linkIds).toEqual(['A03', 'A07', 'A11'])
    expect(edges.find((e) => e.id === 'B03')!.networkId).toBe('B')
    for (const b of bundles)
      expect(new Set(b.linkIds.map((id) => id[0])).size).toBe(1) // A01… or B01… only
  })

  it('never merges an unresolved cable into a resolved bundle', () => {
    const s = acceptanceSnapshot()
    s.links.push({ id: 'X2', kind: 'cable', a: 'AGG-15:p1', b: 'AGG-03:p1' })
    s.links.push({ id: 'X3', kind: 'cable', a: 'AGG-15:p1', b: 'AGG-03:p1' })
    const { bundles } = mapEdges(s, all(s), new Set())
    const x = bundles.find((b) => b.linkIds.includes('X2'))!
    expect(x.networkId).toBe('')
    expect(x.linkIds).toEqual(['X2', 'X3'])
  })
})

describe('cross-network captions', () => {
  const networks = [
    { id: 'A', name: 'Network A' },
    { id: 'B', name: 'Network B' },
  ]
  it('names the network of an edge that is not the filtered network', () => {
    expect(crossNetworkCaption('B', 'A', networks)).toBe('Network B')
  })
  it('shows nothing without a filter, for the filtered network, or when unresolved', () => {
    expect(crossNetworkCaption('B', undefined, networks)).toBeUndefined()
    expect(crossNetworkCaption('A', 'A', networks)).toBeUndefined()
    expect(crossNetworkCaption('', 'A', networks)).toBeUndefined()
  })
})

describe('mapEdges takes the endpoint owner lookup from the caller', () => {
  it('uses the given lookup instead of rebuilding it', () => {
    const s = acceptanceSnapshot()
    const owner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId]))
    owner.set('EDGE-22:p1', 'EDGE-17') // doctored: B01 now starts at EDGE-17
    const { edges } = mapEdges(s, all(s), new Set(), undefined, owner)
    expect(edges.find((e) => e.id === 'B01')!.source).toBe('EDGE-17')
  })
})

describe('POL-18 line width and pair keys', () => {
  it('is 1.5 px for one cable and grows 1 px per extra cable', () => {
    expect(lineWidth(1)).toBe(1.5)
    expect(lineWidth(2)).toBe(2.5)
    expect(lineWidth(3)).toBe(3.5)
  })

  it('is capped at 7 px', () => {
    expect(lineWidth(7)).toBe(7)
    expect(lineWidth(50)).toBe(7)
  })

  it('keys a pair by both cards, in either order, and the network', () => {
    expect(pairKey('B', 'A', 'N')).toBe(pairKey('A', 'B', 'N'))
    expect(pairKey('A', 'B', 'N')).not.toBe(pairKey('A', 'B', 'M'))
  })

  it('gives a bundle the key of its pair', () => {
    const s = acceptanceSnapshot()
    const { bundles } = mapEdges(s, all(s), new Set())
    const b = bundles.find((x) => x.linkIds.includes('A01'))!
    expect(b.pairKey).toBe(pairKey('EDGE-17', 'PANEL-A', 'A'))
  })
})
