import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { endpointLookup, facetKey, facetLabel } from './facets'

describe('facet key and label', () => {
  const snapshot = acceptanceSnapshot()
  const lookup = endpointLookup(snapshot)
  const endpoint = (id: string) => snapshot.endpoints.find((p) => p.id === id)!

  it('keys an HDF position by block and position, a panel by position, a port by its ID', () => {
    expect(facetKey(lookup, endpoint('HDF-01:3C/5:f'))).toBe('3C/5')
    expect(facetKey(lookup, endpoint('PANEL-A:1:f'))).toBe('1')
    expect(facetKey(lookup, endpoint('EDGE-17:p1'))).toBe('EDGE-17:p1')
  })

  it('labels an HDF position "3C / 5", a panel by position, a port by its label', () => {
    expect(facetLabel(lookup, endpoint('HDF-01:3C/5:f'))).toBe('3C / 5')
    expect(facetLabel(lookup, endpoint('PANEL-A:1:f'))).toBe('1')
    expect(facetLabel(lookup, endpoint('EDGE-17:p1'))).toBe(
      endpoint('EDGE-17:p1').label,
    )
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
})
