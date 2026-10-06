import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { endpointDetail, switchSide } from './detail'

const index = indexSnapshot(physicalSnapshot())

describe('F06 HDF-01 3C/5 rear -> front keeps the position', () => {
  it('rear: external cable A02 to PANEL-A position 1 rear; internal peer is 3C/5 front', () => {
    const d = endpointDetail(index, 'HDF-01:3C/5:r')!
    expect(d).toMatchObject({
      equipmentId: 'HDF-01',
      side: 'rear',
      position: 1 + 4,
      networkId: 'A',
    })
    expect(d.external).toMatchObject({
      linkId: 'A02',
      farEndpointId: 'PANEL-A:1:r',
      farEquipmentId: 'PANEL-A',
      farLocation: 'Main Campus / Building A / Rack A03',
    })
    expect(d.internal).toMatchObject({
      endpointId: 'HDF-01:3C/5:f',
      side: 'front',
      bridgeLinkId: 'HDF-01:3C/5:bridge',
    })
  })

  it('front: external cable A03 to HDF-02 2B/3 front; internal peer is 3C/5 rear', () => {
    const d = endpointDetail(index, 'HDF-01:3C/5:f')!
    expect(d.external).toMatchObject({
      linkId: 'A03',
      farEndpointId: 'HDF-02:2B/3:f',
      farEquipmentId: 'HDF-02',
    })
    expect(d.internal?.endpointId).toBe('HDF-01:3C/5:r')
  })

  it('switchSide returns the other side of the same position', () => {
    expect(switchSide(index, 'HDF-01:3C/5:r')).toEqual({
      endpointId: 'HDF-01:3C/5:f',
      side: 'front',
    })
    expect(switchSide(index, 'HDF-01:3C/5:f')?.endpointId).toBe('HDF-01:3C/5:r')
  })
})

describe('F07 HDF-02 2B/3 front -> rear', () => {
  it('front peers HDF-01 3C/5 front; rear peers AGG-03 port 1', () => {
    const front = endpointDetail(index, 'HDF-02:2B/3:f')!
    expect(front.external?.farEndpointId).toBe('HDF-01:3C/5:f')
    expect(front.external?.linkId).toBe('A03')
    const rear = endpointDetail(
      index,
      switchSide(index, 'HDF-02:2B/3:f')!.endpointId,
    )!
    expect(rear.side).toBe('rear')
    expect(rear.external).toMatchObject({
      linkId: 'A04',
      farEndpointId: 'AGG-03:p1',
      farEquipmentId: 'AGG-03',
    })
  })
})

describe('endpoint detail edge cases', () => {
  it('a switch port has an external cable and no internal peer', () => {
    const d = endpointDetail(index, 'EDGE-17:p1')!
    expect(d.internal).toBeUndefined()
    expect(d.external?.linkId).toBe('A01')
    expect(d.networkId).toBe('A')
    expect(switchSide(index, 'EDGE-17:p1')).toBeUndefined()
  })

  it('a free position has no external cable but still has its internal peer', () => {
    const d = endpointDetail(index, 'PANEL-A:10:f')!
    expect(d.external).toBeUndefined()
    expect(d.internal?.endpointId).toBe('PANEL-A:10:r')
  })

  it('a position whose sides are not bridged has no internal peer', () => {
    const s = physicalSnapshot()
    const cut = indexSnapshot({
      ...s,
      links: s.links.filter((l) => l.id !== 'PANEL-A:10:bridge'),
    })
    expect(endpointDetail(cut, 'PANEL-A:10:f')?.internal).toBeUndefined()
    expect(switchSide(cut, 'PANEL-A:10:f')).toBeUndefined()
  })

  it('does not link sibling positions', () => {
    expect(switchSide(index, 'PANEL-A:1:f')?.endpointId).toBe('PANEL-A:1:r')
  })

  it('an unknown endpoint has no detail', () => {
    expect(endpointDetail(index, 'nope')).toBeUndefined()
  })
})
