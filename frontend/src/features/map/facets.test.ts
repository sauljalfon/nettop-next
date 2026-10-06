import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { endpointLookup, facetsFor, facetStart } from './facets'

describe('C04 route facets are automatic and exact', () => {
  it('reveals only the route positions and ports, per equipment', () => {
    const facets = facetsFor(acceptanceSnapshot(), agg03Route())
    expect([...facets.keys()].sort()).toEqual([
      'AGG-03',
      'EDGE-17',
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
    expect(facets.get('HDF-01')!.map((f) => f.label)).toEqual(['3C / 5'])
    expect(facets.get('HDF-02')!.map((f) => f.label)).toEqual(['2B / 3'])
    expect(facets.get('PANEL-A')!.map((f) => f.label)).toEqual(['1'])
    expect(facets.get('AGG-03')!.map((f) => f.label)).toEqual(['1'])
  })

  it('shows a position with its front and rear endpoints and the bridge', () => {
    const [facet] = facetsFor(acceptanceSnapshot(), agg03Route()).get('HDF-01')!
    expect(facet.frontEndpointId).toBe('HDF-01:3C/5:f')
    expect(facet.rearEndpointId).toBe('HDF-01:3C/5:r')
    expect(facet.bridgeLinkId).toBe('HDF-01:3C/5:bridge')
    expect(facet.automatic).toBe(true)
    expect(facet.manual).toBe(false)
  })

  it('has no automatic facets without a route', () => {
    expect(facetsFor(acceptanceSnapshot(), undefined).size).toBe(0)
  })
})

describe('C06 several positions of one HDF', () => {
  it('lists each exact position independently under the same parent', () => {
    const s = acceptanceSnapshot()
    const manual = new Map([['HDF-01', new Set(['2D/4', '3C/2'])]])
    const facets = facetsFor(s, agg03Route(), manual).get('HDF-01')!
    expect(facets.map((f) => f.label)).toEqual(['2D / 4', '3C / 2', '3C / 5'])
    expect(new Set(facets.map((f) => f.key)).size).toBe(3)
    expect(facets.every((f) => f.equipmentId === 'HDF-01')).toBe(true)
    expect(facets.find((f) => f.label === '3C / 5')!.automatic).toBe(true)
    expect(facets.find((f) => f.label === '3C / 2')!.automatic).toBe(false)
  })
})

describe('facet model keeps automatic and manual detail independent', () => {
  const manual = new Map([['HDF-01', new Set(['3C/5', '1A/2'])]])

  it('keeps manual facets when the route clears', () => {
    const facets = facetsFor(acceptanceSnapshot(), undefined, manual)
    expect(facets.get('HDF-01')!.map((f) => f.label)).toEqual([
      '1A / 2',
      '3C / 5',
    ])
    expect(facets.get('HDF-01')!.every((f) => !f.automatic && f.manual)).toBe(
      true,
    )
    expect(facets.has('HDF-02')).toBe(false)
  })

  it('marks a position both automatic and manual when both apply', () => {
    const f = facetsFor(acceptanceSnapshot(), agg03Route(), manual)
      .get('HDF-01')!
      .find((x) => x.label === '3C / 5')!
    expect(f.automatic && f.manual).toBe(true)
  })

  it('replaces automatic detail when the route changes', () => {
    const s = acceptanceSnapshot()
    const shorter = agg03Route()
    shorter.hops = shorter.hops.slice(0, 3) // EDGE-17 → PANEL-A → HDF-01 rear
    const facets = facetsFor(s, shorter, manual)
    expect(facets.get('HDF-02')).toBeUndefined()
    expect(facets.get('HDF-01')!.map((f) => f.label)).toEqual([
      '1A / 2',
      '3C / 5',
    ])
    expect(
      facets.get('HDF-01')!.find((f) => f.label === '3C / 5')!.automatic,
    ).toBe(true)
  })
})

describe('starting a trace from a facet', () => {
  it('starts a position from its front endpoint', () => {
    const [facet] = facetsFor(acceptanceSnapshot(), agg03Route()).get('HDF-01')!
    expect(facetStart(facet)).toBe('HDF-01:3C/5:f')
  })

  it('falls back to the rear endpoint, then to any endpoint', () => {
    const base = {
      key: 'k',
      equipmentId: 'e',
      label: 'l',
      automatic: true,
      manual: false,
    }
    expect(
      facetStart({ ...base, endpointIds: ['r'], rearEndpointId: 'r' }),
    ).toBe('r')
    expect(facetStart({ ...base, endpointIds: ['x'] })).toBe('x')
  })

  it('starts a switch port from the port itself', () => {
    const [facet] = facetsFor(acceptanceSnapshot(), agg03Route()).get(
      'EDGE-17',
    )!
    expect(facetStart(facet)).toBe('EDGE-17:p1')
  })
})

describe('bridges come from a per-snapshot lookup', () => {
  const snapshot = acceptanceSnapshot()
  const lookup = endpointLookup(snapshot)

  it('maps both sides of a position to its internal bridge', () => {
    expect(lookup.bridges.get('PANEL-A:1:f')).toBe('PANEL-A:1:bridge')
    expect(lookup.bridges.get('PANEL-A:1:r')).toBe('PANEL-A:1:bridge')
    expect(lookup.bridges.get('HDF-01:3C/5:f')).toBe('HDF-01:3C/5:bridge')
  })

  it('has no entry for a cabled port or an unknown endpoint', () => {
    expect(lookup.bridges.has('EDGE-17:p1')).toBe(false)
    expect(lookup.bridges.has('nope')).toBe(false)
  })

  it('is what a facet reports as its bridge', () => {
    const facets = facetsFor(snapshot, agg03Route(), new Map(), lookup)
    expect(facets.get('HDF-01')![0].bridgeLinkId).toBe('HDF-01:3C/5:bridge')
  })
})
