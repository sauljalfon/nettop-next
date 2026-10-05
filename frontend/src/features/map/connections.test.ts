import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import {
  connectionEntries,
  connectionCaption,
  searchConnections,
} from './connections'
import { indexSnapshot } from './snapshotIndex'

const s = acceptanceSnapshot()
const index = indexSnapshot(s)
const entries = (id: string) => connectionEntries(index, id)
const labels = (id: string) => entries(id).map((e) => e.label)

describe('C03 the connections list shows only cabled positions and ports', () => {
  it('lists the four cabled HDF-01 positions, not its six configured ones', () => {
    expect(labels('HDF-01')).toEqual(['1A / 2', '2D / 4', '3C / 2', '3C / 5'])
  })

  it('lists cabled device ports and standard-panel positions', () => {
    expect(labels('EDGE-17')).toEqual(['1', '2', '3'])
    expect(labels('PANEL-A')).toEqual(['1', '2', '3'])
    expect(labels('AGG-15')).toEqual([])
  })

  it('keys each entry like the facet for the same position', () => {
    expect(entries('HDF-01').map((e) => e.key)).toEqual([
      '1A/2',
      '2D/4',
      '3C/2',
      '3C/5',
    ])
    expect(entries('EDGE-17')[0].key).toBe('EDGE-17:p1')
  })

  it('gives each entry the network of its circuit', () => {
    const byLabel = Object.fromEntries(
      entries('HDF-01').map((e) => [e.label, e.networkId]),
    )
    expect(byLabel).toEqual({
      '1A / 2': 'A',
      '2D / 4': 'A',
      '3C / 2': 'B',
      '3C / 5': 'A',
    })
    expect(entries('EDGE-17')[0].networkId).toBe('A') // an active port: its device's network
  })

  it('is empty for unknown equipment', () => {
    expect(entries('nope')).toEqual([])
  })
})

describe('search by label', () => {
  const list = entries('HDF-01')
  const matches = (q: string) => searchConnections(list, q).map((e) => e.label)

  it('matches "3C/5" and "3C / 5" alike, in any case', () => {
    expect(matches('3C/5')).toEqual(['3C / 5'])
    expect(matches('3C / 5')).toEqual(['3C / 5'])
    expect(matches('3c/5')).toEqual(['3C / 5'])
  })

  it('matches a partial label', () => {
    expect(matches('3C')).toEqual(['3C / 2', '3C / 5'])
    expect(matches('d')).toEqual(['2D / 4'])
  })

  it('returns everything for an empty query and nothing for no match', () => {
    expect(matches('')).toHaveLength(4)
    expect(matches('  ')).toHaveLength(4)
    expect(matches('9Z')).toEqual([])
  })
})

describe('C07/C08 entries of another network are labeled', () => {
  const networks = s.networks
  it('names the circuit network when it differs from the active filter', () => {
    const [, , b, a] = entries('HDF-01')
    expect(connectionCaption(b, 'A', networks)).toBe('Network B')
    expect(connectionCaption(a, 'A', networks)).toBeUndefined()
    expect(connectionCaption(a, 'B', networks)).toBe('Network A')
  })
  it('shows no label without a filter', () => {
    expect(
      connectionCaption(entries('HDF-01')[2], undefined, networks),
    ).toBeUndefined()
  })
})
