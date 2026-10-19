import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { indexSnapshot } from './snapshotIndex'
import { circuitNetworks, passiveNetworks } from './networks'
import { cabledSummaries, locationLabel, locationParts } from './location'

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

  it('holds the location as parts, agreeing with locationParts', () => {
    for (const e of s.equipment)
      expect(index.locationParts.get(e.id)).toEqual(locationParts(s, e.id))
  })

  it('knows which endpoints carry a cable', () => {
    expect(index.cabled.has('EDGE-17:p1')).toBe(true)
    expect(index.cabled.has('EDGE-17:p4')).toBe(false)
    expect(index.cabled.has('HDF-01:3C/5:f')).toBe(true)
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

describe('endpoint → stored internal bridge, from the index', () => {
  const s = acceptanceSnapshot()
  const index = indexSnapshot(s)

  it('gives each side of a bridged position the bridge and the other side', () => {
    expect(index.bridgeByEndpoint.get('PANEL-A:1:f')).toEqual({
      linkId: 'PANEL-A:1:bridge',
      otherEndpointId: 'PANEL-A:1:r',
    })
    expect(index.bridgeByEndpoint.get('PANEL-A:1:r')).toEqual({
      linkId: 'PANEL-A:1:bridge',
      otherEndpointId: 'PANEL-A:1:f',
    })
  })

  it('has nothing for a switch port, and a bridge never shows up as a cable', () => {
    expect(index.bridgeByEndpoint.has('EDGE-17:p1')).toBe(false)
    expect(index.cableByEndpoint.get('PANEL-A:1:f')?.linkId).toBe('A01')
  })

  it('has nothing for a position whose bridge is not stored', () => {
    const noBridge = {
      ...s,
      links: s.links.filter((l) => l.id !== 'PANEL-A:1:bridge'),
    }
    expect(indexSnapshot(noBridge).bridgeByEndpoint.has('PANEL-A:1:f')).toBe(
      false,
    )
  })
})

describe('cable ID → cable, from the index', () => {
  const s = acceptanceSnapshot()
  const index = indexSnapshot(s)

  it('finds a cable by its ID, and never a bridge', () => {
    expect(index.cableById.get('A01')).toEqual(
      s.links.find((l) => l.id === 'A01'),
    )
    expect(index.cableById.has('PANEL-A:1:bridge')).toBe(false)
    expect(index.cableById.size).toBe(index.cables.length)
  })
})
