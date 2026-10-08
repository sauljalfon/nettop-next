import { describe, expect, it } from 'vitest'
import { edge17Result } from '../map/acceptanceFixture'
import { chooseRoute, createTraceSession } from './traceSession'

describe('TR-05 the last trace is kept outside the Workspace', () => {
  const request = { mode: 'distribution' as const, device: 'edge-17' }

  it('starts empty', () => {
    expect(createTraceSession().get()).toBeUndefined()
  })

  it('keeps the request, then the selected route’s start and end', () => {
    const s = createTraceSession()
    s.start(request)
    expect(s.get()).toEqual({ request, route: undefined })
    s.selectRoute({ start: 'edge-17:p2', end: 'agg-08:p1' })
    expect(s.get()).toEqual({
      request,
      route: { start: 'edge-17:p2', end: 'agg-08:p1' },
    })
  })

  it('a new request forgets the old route', () => {
    const s = createTraceSession()
    s.start(request)
    s.selectRoute({ start: 'a', end: 'b' })
    s.start({ mode: 'point_to_point', start: 'x', end: 'y' })
    expect(s.get()).toEqual({
      request: { mode: 'point_to_point', start: 'x', end: 'y' },
      route: undefined,
    })
  })

  it('a route chosen with no request is ignored; clear forgets everything', () => {
    const s = createTraceSession()
    s.selectRoute({ start: 'a', end: 'b' })
    expect(s.get()).toBeUndefined()
    s.start(request)
    s.clear()
    expect(s.get()).toBeUndefined()
  })

  it('keeps separate sessions apart', () => {
    const a = createTraceSession()
    const b = createTraceSession()
    a.start(request)
    expect(b.get()).toBeUndefined()
  })
})

describe('TR-06 choosing the route again after a rerun', () => {
  const result = edge17Result() // AGG-03, AGG-08, BB-01

  it('selects the route with the same start and end endpoints', () => {
    expect(
      chooseRoute(result, { start: 'EDGE-17:p2', end: 'AGG-08:p1' }),
    ).toEqual({ index: 1, fellBack: false })
  })

  it('starts at the first route when no route was selected before', () => {
    expect(chooseRoute(result, undefined)).toEqual({
      index: 0,
      fellBack: false,
    })
  })

  it('falls back to the first route, saying so, when that route is gone', () => {
    expect(
      chooseRoute(result, { start: 'EDGE-17:p4', end: 'AGG-15:p2' }),
    ).toEqual({ index: 0, fellBack: true })
  })

  it('matches both ends, not just the start', () => {
    expect(
      chooseRoute(result, { start: 'EDGE-17:p2', end: 'AGG-03:p1' }),
    ).toEqual({ index: 0, fellBack: true })
  })

  it('has nothing to fall back to when there are no routes', () => {
    expect(
      chooseRoute({ ...result, routes: [] }, { start: 'a', end: 'b' }),
    ).toEqual({ index: 0, fellBack: false })
  })
})
