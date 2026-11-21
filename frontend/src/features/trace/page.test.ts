import { describe, expect, it } from 'vitest'
import type { Route, TraceResult } from '../../shared/types'
import { countsLine, countsPhrases, pickItem } from './page'

const route = (end: string): Route => ({ start: 's', end, hops: [] })
const result = (routes: string[], mismatches: string[]): TraceResult => ({
  context: 'installed',
  revision: 'r',
  mode: 'distribution',
  status: routes.length ? 'reached' : 'unreachable',
  reason: '',
  routes: routes.map(route),
  mismatches: mismatches.map(route),
  starts: [],
  truncated: false,
})

describe('pickItem', () => {
  it('the chosen route', () => {
    const p = pickItem(result(['a', 'b'], ['m']), 1, undefined)
    expect(p).toMatchObject({ kind: 'route', index: 1 })
    expect(p?.route.end).toBe('b')
  })

  it('a mismatch chosen on the page wins over the route', () => {
    expect(pickItem(result(['a'], ['m1', 'm2']), 0, 1)).toMatchObject({
      kind: 'mismatch',
      index: 1,
    })
  })

  it('a route index that is gone falls back to the first route', () => {
    expect(pickItem(result(['a'], []), 5, undefined)).toMatchObject({
      kind: 'route',
      index: 0,
    })
  })

  it('only mismatches: the first mismatch', () => {
    const p = pickItem(result([], ['m1', 'm2']), 0, undefined)
    expect(p).toMatchObject({ kind: 'mismatch', index: 0 })
    expect(p?.route.end).toBe('m1')
  })

  it('a mismatch index that is gone is ignored', () => {
    expect(pickItem(result(['a'], ['m']), 0, 4)).toMatchObject({
      kind: 'route',
      index: 0,
    })
  })

  it('nothing at all: nothing', () => {
    expect(pickItem(result([], []), 0, undefined)).toBeUndefined()
  })
})

describe('the counts', () => {
  it('say route and mismatch in the singular for one', () => {
    expect(countsLine({ routes: 3, mismatches: 0 })).toBe(
      '3 routes · 0 mismatches',
    )
    expect(countsLine({ routes: 1, mismatches: 1 })).toBe(
      '1 route · 1 mismatch',
    )
  })

  it('the route line', () => {
    expect(
      countsPhrases({ cables: 4, equipment: 5, racks: 4, nodes: 3 }),
    ).toEqual(['4 cables', '5 equipment', '4 racks in 3 nodes'])
    expect(
      countsPhrases({ cables: 1, equipment: 2, racks: 1, nodes: 1 }),
    ).toEqual(['1 cable', '2 equipment', '1 rack in 1 node'])
  })
})
