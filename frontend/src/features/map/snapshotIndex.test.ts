import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, agg03Route } from './acceptanceFixture'
import { indexSnapshot } from './snapshotIndex'
import { createMapSession } from './mapSession'
import { projectMap } from './mapGraph'
import { circuitNetworks, passiveNetworks } from './networks'
import { cabledSummaries, locationLabel } from './location'

describe('snapshot-only results are computed once per snapshot', () => {
  const s = acceptanceSnapshot()
  const index = indexSnapshot(s)

  it('holds circuit networks, badges, summaries and location labels', () => {
    expect(index.circuits).toEqual(circuitNetworks(s))
    expect(index.badges).toEqual(passiveNetworks(s))
    expect(index.summaries).toEqual(cabledSummaries(s))
    for (const e of s.equipment)
      expect(index.locations.get(e.id)).toBe(locationLabel(s, e.id))
  })

  it('knows which endpoints carry a cable', () => {
    expect(index.cabled.has('EDGE-17:p1')).toBe(true)
    expect(index.cabled.has('EDGE-17:p4')).toBe(false)
    expect(index.cabled.has('HDF-01:3C/5:f')).toBe(true)
  })

  it('projectMap reuses a given index instead of recomputing it', () => {
    // A doctored index proves projectMap reads it: B03 is reclassified as Network A.
    const doctored = indexSnapshot(s)
    const circuits = new Map(doctored.circuits)
    for (const id of ['HDF-01:3C/2:f', 'HDF-02:2B/6:f']) circuits.set(id, 'A')
    doctored.circuits = circuits
    const { edges } = projectMap({
      snapshot: s,
      session: createMapSession(),
      installedIDs: new Set(s.equipment.map((e) => e.id)),
      installedLinkIDs: new Set(s.links.map((l) => l.id)),
      index: doctored,
    })
    // Reclassified as A, B03 now joins the A bundle between the HDFs.
    expect(
      edges.find((e) => e.data.linkIds.includes('B03'))!.data.linkIds.sort(),
    ).toEqual(['A03', 'A07', 'A11', 'B03'])
  })

  it('is independent of the route: the same index serves every route', () => {
    const none = projectMap({
      snapshot: s,
      session: createMapSession(),
      installedIDs: new Set(),
      installedLinkIDs: new Set(),
      index,
    })
    const routed = projectMap({
      snapshot: s,
      session: createMapSession(),
      installedIDs: new Set(),
      installedLinkIDs: new Set(),
      route: agg03Route(),
      index,
    })
    expect(none.nodes.every((n) => n.data.facets.length === 0)).toBe(true)
    expect(routed.nodes.some((n) => n.data.facets.length > 0)).toBe(true)
  })
})

describe('endpoint → cable and far end, from the index', () => {
  const s = acceptanceSnapshot()
  const index = indexSnapshot(s)

  it('gives each cabled endpoint its cable and the endpoint at the other end', () => {
    expect(index.cableByEndpoint.get('EDGE-17:p1')).toEqual({
      linkId: 'A01',
      farEndpointId: 'PANEL-A:1:f',
    })
    expect(index.cableByEndpoint.get('PANEL-A:1:f')).toEqual({
      linkId: 'A01',
      farEndpointId: 'EDGE-17:p1',
    })
  })

  it('has no entry for an uncabled endpoint, or for an internal bridge', () => {
    expect(index.cableByEndpoint.has('EDGE-17:p4')).toBe(false)
    expect(index.cableByEndpoint.has('PANEL-A:7:f')).toBe(false)
    expect(index.cableByEndpoint.get('HDF-01:3C/5:f')!.linkId).toBe('A03')
  })

  it('has an entry for exactly both ends of every cable', () => {
    const cables = s.links.filter((l) => l.kind === 'cable')
    expect(index.cableByEndpoint.size).toBe(cables.length * 2)
  })

  it('knows each rack by ID', () => {
    expect(index.racks.get('rack-a03')!.name).toBe('Rack A03')
  })
})
