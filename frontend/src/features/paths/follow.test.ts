import { describe, expect, it } from 'vitest'
import { agg03Route } from '../map/acceptanceFixture'
import { followPort, walkOfRoute } from './follow'
import { indexOf, withLinks, withoutLink } from './testSnapshots'

const ids = (w: { hops: { linkId: string }[] }) => w.hops.map((h) => h.linkId)

describe('followPort', () => {
  it('follows cable, bridge, cable… from EDGE-17 port 1 to AGG-03', () => {
    const w = followPort(indexOf(), 'EDGE-17:p1')
    expect(w.start).toBe('EDGE-17:p1')
    expect(ids(w)).toEqual([
      'A01',
      'PANEL-A:1:bridge',
      'A02',
      'HDF-01:3C/5:bridge',
      'A03',
      'HDF-02:2B/3:bridge',
      'A04',
    ])
    expect(w.hops.map((h) => h.kind)).toEqual([
      'cable',
      'internal',
      'cable',
      'internal',
      'cable',
      'internal',
      'cable',
    ])
    expect(w.hops[0]).toEqual({
      linkId: 'A01',
      from: 'EDGE-17:p1',
      to: 'PANEL-A:1:f',
      kind: 'cable',
    })
    expect(w.end).toEqual({
      kind: 'destination',
      endpointId: 'AGG-03:p1',
      role: 'aggregation',
    })
    expect(w.networkId).toBe('A')
  })

  it('reports a backbone destination with its role', () => {
    const w = followPort(indexOf(), 'EDGE-17:p3')
    expect(w.end).toEqual({
      kind: 'destination',
      endpointId: 'BB-01:p1',
      role: 'backbone',
    })
  })

  it('ends with none when the start has no cable', () => {
    const w = followPort(indexOf(), 'EDGE-17:p4')
    expect(w.hops).toEqual([])
    expect(w.end).toEqual({ kind: 'none', endpointId: 'EDGE-17:p4' })
  })

  it('ends free at the rear of a panel when nothing is cabled there', () => {
    const w = followPort(indexOf(withoutLink('A02')), 'EDGE-17:p1')
    expect(ids(w)).toEqual(['A01', 'PANEL-A:1:bridge'])
    expect(w.end).toEqual({ kind: 'free', endpointId: 'PANEL-A:1:r' })
  })

  it('stops at a position with no stored bridge, without crossing it', () => {
    const w = followPort(indexOf(withoutLink('PANEL-A:1:bridge')), 'EDGE-17:p1')
    expect(ids(w)).toEqual(['A01'])
    expect(w.end).toEqual({ kind: 'free', endpointId: 'PANEL-A:1:f' })
  })

  it('stops at another access switch', () => {
    const w = followPort(
      indexOf(
        withLinks({
          id: 'X1',
          kind: 'cable',
          a: 'EDGE-17:p5',
          b: 'EDGE-22:p5',
        }),
      ),
      'EDGE-17:p5',
    )
    expect(ids(w)).toEqual(['X1'])
    expect(w.end).toEqual({ kind: 'switch', endpointId: 'EDGE-22:p5' })
  })

  it('stops before revisiting an endpoint (a loop through two panels)', () => {
    const loop = indexOf(
      withLinks(
        { id: 'L1', kind: 'cable', a: 'PANEL-A:10:f', b: 'PANEL-A:11:f' },
        { id: 'L2', kind: 'cable', a: 'PANEL-A:11:r', b: 'PANEL-A:10:r' },
      ),
    )
    const w = followPort(loop, 'PANEL-A:10:f')
    expect(ids(w)).toEqual(['L1', 'PANEL-A:11:bridge', 'L2'])
    expect(w.end).toEqual({ kind: 'free', endpointId: 'PANEL-A:10:r' })
  })
})

describe('walkOfRoute', () => {
  it('takes its hops from the route and never walks again', () => {
    // The route is not the stored topology: the index has no A02 any more.
    const w = walkOfRoute(indexOf(withoutLink('A02')), agg03Route())
    expect(ids(w)).toEqual(ids(followPort(indexOf(), 'EDGE-17:p1')))
    expect(w.start).toBe('EDGE-17:p1')
    expect(w.end).toEqual({
      kind: 'destination',
      endpointId: 'AGG-03:p1',
      role: 'aggregation',
    })
    expect(w.networkId).toBe('A')
  })

  it('ends as a plain endpoint when the route has no destination role', () => {
    const route = {
      ...agg03Route(),
      destinationRole: undefined,
      destinationEquipmentId: undefined,
      sourceNetworkId: undefined,
    }
    const w = walkOfRoute(indexOf(), route)
    expect(w.end).toEqual({ kind: 'endpoint', endpointId: 'AGG-03:p1' })
    expect(w.networkId).toBeUndefined()
  })
})
