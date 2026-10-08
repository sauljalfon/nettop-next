import { describe, expect, it } from 'vitest'
import { agg03Route, edge17Result } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot } from './testFixture'
import { currentStep, stepTarget, trailSteps } from './trail'

const s = physicalSnapshot()
const index = indexSnapshot(s)

describe('TR-04 the route as steps', () => {
  const steps = trailSteps(index, agg03Route())

  it('one step per equipment visit: five for the AGG-03 route', () => {
    expect(steps.map((x) => x.equipmentId)).toEqual([
      'EDGE-17',
      'PANEL-A',
      'HDF-01',
      'HDF-02',
      'AGG-03',
    ])
  })

  it('a passive position is one chip with the side change; a device port is one chip', () => {
    expect(steps.map((x) => x.label)).toEqual([
      'EDGE-17 1',
      'PANEL-A 1 F→R',
      'HDF-01 3C/5 R→F',
      'HDF-02 2B/3 F→R',
      'AGG-03 1',
    ])
  })

  it('opens the endpoint where the route enters the equipment', () => {
    expect(steps.map((x) => x.openEndpointId)).toEqual([
      'EDGE-17:p1',
      'PANEL-A:1:f',
      'HDF-01:3C/5:r',
      'HDF-02:2B/3:f',
      'AGG-03:p1',
    ])
    expect(steps[2].endpointIds).toEqual(['HDF-01:3C/5:r', 'HDF-01:3C/5:f'])
  })

  it('the BB-01 route has five steps too, through other positions', () => {
    const bb = edge17Result().routes[2]
    expect(trailSteps(index, bb).map((x) => x.label)).toEqual([
      'EDGE-17 3',
      'PANEL-A 3 F→R',
      'HDF-01 2D/4 R→F',
      'HDF-02 3A/1 F→R',
      'BB-01 1',
    ])
  })

  it('a route that starts at a passive position starts with that single side', () => {
    const route = {
      start: 'HDF-01:3C/5:r',
      end: 'AGG-03:p1',
      hops: agg03Route().hops.slice(3),
    }
    const first = trailSteps(index, route)[0]
    expect(first.label).toBe('HDF-01 3C/5 R→F')
    const lone = trailSteps(index, { ...route, hops: [] })
    expect(lone).toHaveLength(1)
    expect(lone[0].label).toBe('HDF-01 3C/5 R')
  })

  it('a route with no hops is one step; no route is no steps', () => {
    expect(
      trailSteps(index, { start: 'EDGE-17:p1', end: 'EDGE-17:p1', hops: [] }),
    ).toHaveLength(1)
    expect(trailSteps(index, undefined)).toEqual([])
  })

  it('visits of one equipment at two positions are two steps', () => {
    // EDGE-17 port 1 → ... → HDF-01 3C/5, and a made-up second visit of HDF-01 later.
    const hops = [
      ...agg03Route().hops.slice(0, 4),
      {
        linkId: 'x',
        from: 'HDF-01:3C/5:f',
        to: 'HDF-01:1A/2:r',
        kind: 'cable' as const,
      },
      {
        linkId: 'y',
        from: 'HDF-01:1A/2:r',
        to: 'HDF-01:1A/2:f',
        kind: 'internal' as const,
      },
    ]
    const labels = trailSteps(index, {
      start: 'EDGE-17:p1',
      end: 'HDF-01:1A/2:f',
      hops,
    }).map((x) => x.label)
    expect(labels.filter((l) => l.startsWith('HDF-01'))).toEqual([
      'HDF-01 3C/5 R→F',
      'HDF-01 1A/2 R→F',
    ])
  })
})

describe('TR-04 the current step follows the page', () => {
  const steps = trailSteps(index, agg03Route())
  const at = (equipmentId: string, endpointId?: string) => ({
    level: 'equipment' as const,
    equipmentId,
    endpointId,
  })

  it('is the step whose endpoint the page shows, either side of a position', () => {
    expect(currentStep(steps, at('HDF-01', 'HDF-01:3C/5:r'))).toBe(2)
    expect(currentStep(steps, at('HDF-01', 'HDF-01:3C/5:f'))).toBe(2)
    expect(currentStep(steps, at('EDGE-17', 'EDGE-17:p1'))).toBe(0)
  })

  it('an endpoint that is not on the route is no step, even on route equipment', () => {
    expect(currentStep(steps, at('HDF-01', 'HDF-01:1A/2:r'))).toBeUndefined()
    expect(currentStep(steps, at('EDGE-17', 'EDGE-17:p2'))).toBeUndefined()
  })

  it('without an endpoint, equipment visited once is the step; equipment off the route is none', () => {
    expect(currentStep(steps, at('PANEL-A'))).toBe(1)
    expect(currentStep(steps, at('AGG-08'))).toBeUndefined()
  })

  it('none is current above the equipment level', () => {
    expect(
      currentStep(steps, { level: 'rack', rackId: 'rack-sm01' }),
    ).toBeUndefined()
    expect(currentStep(steps, { level: 'sites' })).toBeUndefined()
  })
})

describe('Prev and Next', () => {
  const steps = trailSteps(index, agg03Route())

  it('Next from the first step opens the second; Prev opens the one before', () => {
    expect(stepTarget(steps, 0, 'next')?.openEndpointId).toBe('PANEL-A:1:f')
    expect(stepTarget(steps, 2, 'prev')?.openEndpointId).toBe('PANEL-A:1:f')
  })

  it('stops at the ends', () => {
    expect(stepTarget(steps, 0, 'prev')).toBeUndefined()
    expect(stepTarget(steps, 4, 'next')).toBeUndefined()
  })

  it('with no current step, Next opens the first and Prev has nothing', () => {
    expect(stepTarget(steps, undefined, 'next')?.openEndpointId).toBe(
      'EDGE-17:p1',
    )
    expect(stepTarget(steps, undefined, 'prev')).toBeUndefined()
  })
})
