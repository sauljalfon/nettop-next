import { describe, expect, it } from 'vitest'
import type { Endpoint } from '../../shared/types'
import { acceptanceSnapshot } from './acceptanceFixture'
import { indexSnapshot } from './snapshotIndex'
import { equipmentWalks } from './walks'

const walks = (s = acceptanceSnapshot(), id = 'EDGE-17') =>
  equipmentWalks(indexSnapshot(s), id)
const byStart = (list: ReturnType<typeof walks>, start: string) =>
  list.find((w) => w.start === start)!

describe('CM-06 the walks of EDGE-17', () => {
  it('AGG-03: one circuit via PANEL-A 1, HDF-01 3C/5, HDF-02 2B/3 as steps with their jacks', () => {
    const w = byStart(walks(), 'EDGE-17:p1')
    expect(w).toMatchObject({
      end: { kind: 'destination', endpointId: 'AGG-03:p1' },
      farId: 'AGG-03',
      via: [
        { equipmentId: 'PANEL-A', place: '1', endpointId: 'PANEL-A:1:f' },
        { equipmentId: 'HDF-01', place: '3C/5', endpointId: 'HDF-01:3C/5:r' },
        { equipmentId: 'HDF-02', place: '2B/3', endpointId: 'HDF-02:2B/3:f' },
      ],
    })
    expect(w.linkIds[0]).toBe('A01')
  })

  it('reaches AGG-08 and BB-01 the same way, and an uncabled port is no circuit', () => {
    const all = walks()
    expect(byStart(all, 'EDGE-17:p2').farId).toBe('AGG-08')
    expect(byStart(all, 'EDGE-17:p3').farId).toBe('BB-01')
    const s = acceptanceSnapshot()
    s.endpoints.push({ id: 'EDGE-17:p9', equipmentId: 'EDGE-17', label: '9' })
    const lone = byStart(walks(s), 'EDGE-17:p9')
    expect(lone.end.kind).toBe('none')
    expect(lone.farId).toBeUndefined()
  })

  it('lists a cable that leads nowhere as a free end, without repeating its last equipment in via', () => {
    const s = acceptanceSnapshot()
    s.links.push({ id: 'X1', kind: 'cable', a: 'EDGE-17:p5', b: 'PANEL-A:5:f' })
    const free = byStart(walks(s), 'EDGE-17:p5')
    expect(free.end).toEqual({ kind: 'free', endpointId: 'PANEL-A:5:r' })
    expect(free.via).toEqual([])
    expect(free.farId).toBeUndefined()
  })

  it('terminates on a loop', () => {
    const s = acceptanceSnapshot()
    // A cycle through PANEL-A positions 20-22: the walk must stop, not spin.
    s.links.push(
      { id: 'L1', kind: 'cable', a: 'PANEL-A:20:r', b: 'PANEL-A:21:f' },
      { id: 'L2', kind: 'cable', a: 'PANEL-A:21:r', b: 'PANEL-A:22:f' },
      { id: 'L3', kind: 'cable', a: 'PANEL-A:22:r', b: 'PANEL-A:20:f' },
    )
    const loop = byStart(walks(s, 'PANEL-A'), 'PANEL-A:20:f')
    expect(loop.end.kind).toBe('free')
    expect(loop.via.every((v) => v.equipmentId !== 'PANEL-A')).toBe(true)
  })
})

describe('CM-07 the walks of a panel and an HDF', () => {
  it('PANEL-A walks both sides: EDGE-17 on the front, the AGGs and BB on the rear', () => {
    const all = walks(acceptanceSnapshot(), 'PANEL-A')
    expect(byStart(all, 'PANEL-A:1:f').farId).toBe('EDGE-17')
    expect(byStart(all, 'PANEL-A:1:r')).toMatchObject({
      farId: 'AGG-03',
      via: [
        { equipmentId: 'HDF-01', place: '3C/5', endpointId: 'HDF-01:3C/5:r' },
        { equipmentId: 'HDF-02', place: '2B/3', endpointId: 'HDF-02:2B/3:f' },
      ],
    })
  })

  it('a reserved or faulty port changes nothing (locked 6)', () => {
    const before = walks()
    const s = acceptanceSnapshot()
    const set = (id: string, state: Endpoint['state']) => {
      s.endpoints.find((p) => p.id === id)!.state = state
    }
    set('EDGE-17:p1', 'faulty')
    set('AGG-03:p1', 'reserved')
    set('EDGE-17:p2', 'disabled')
    set('PANEL-A:1:f', 'faulty')
    expect(walks(s)).toEqual(before)
    expect(walks(s, 'PANEL-A')).toEqual(walks(acceptanceSnapshot(), 'PANEL-A'))
  })
})
