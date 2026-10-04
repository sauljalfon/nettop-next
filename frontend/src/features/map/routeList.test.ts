import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot, edge17Result } from './acceptanceFixture'
import { hopCounts, resultsSummary, routeRows } from './routeList'

describe('P18 route list for the map results overlay', () => {
  const s = acceptanceSnapshot()

  it('lists every route, AGG first, with destination, role and network', () => {
    const rows = routeRows(s, edge17Result())
    expect(
      rows.map((r) => [
        r.destination?.name,
        r.destination?.role,
        r.destination?.network,
      ]),
    ).toEqual([
      ['AGG-03', 'AGG', 'Network A'],
      ['AGG-08', 'AGG', 'Network A'],
      ['BB-01', 'BB', 'Network A'],
    ])
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2])
    expect(rows[0].label).toBe('EDGE-17 · 1 → AGG-03 · 1 · AGG · Network A')
  })

  it('counts cables and internal bridges per route', () => {
    const [first] = edge17Result().routes
    expect(hopCounts(first)).toEqual({ cables: 4, bridges: 3 })
    expect(routeRows(s, edge17Result())[0].counts).toBe(
      '4 cables · 3 internal bridges',
    )
  })

  it('does not reorder or drop routes on a truncated result', () => {
    const result = { ...edge17Result(), truncated: true }
    expect(routeRows(s, result)).toHaveLength(3)
    expect(resultsSummary(s, result, 1)).toBe(
      '3 routes · AGG-08 · AGG · Network A',
    )
  })

  it('summarizes an unreachable result by its reason', () => {
    const result = {
      ...edge17Result(),
      status: 'unreachable' as const,
      routes: [],
      reason: 'Nothing reached.',
    }
    expect(resultsSummary(s, result, 0)).toBe('No route · Nothing reached.')
  })
})
