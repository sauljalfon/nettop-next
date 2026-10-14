import { describe, expect, it } from 'vitest'
import { edge17Result } from '../map/acceptanceFixture'
import type { TraceResult } from '../../shared/types'
import { uplinkLines } from './uplinks'
import { indexOf } from './testSnapshots'

describe('uplinkLines', () => {
  const index = indexOf()

  it('gives one line per route in engine order, AGG first', () => {
    const { lines } = uplinkLines(index, edge17Result(), 'EDGE-17')
    expect(
      lines.map((l) => [l.port, l.destinationName, l.destinationPort, l.role]),
    ).toEqual([
      ['1', 'AGG-03', '1', 'AGG'],
      ['2', 'AGG-08', '1', 'AGG'],
      ['3', 'BB-01', '1', 'BB'],
    ])
    expect(lines[0].startEndpointId).toBe('EDGE-17:p1')
  })

  it('counts cables and lists the passives in order', () => {
    const { lines } = uplinkLines(index, edge17Result(), 'EDGE-17')
    expect(lines.map((l) => l.cables)).toEqual([4, 4, 4])
    expect(lines[0].via).toEqual(['PANEL-A', 'HDF-01', 'HDF-02'])
  })

  it('collapses consecutive repeats of a passive name', () => {
    const { lines } = uplinkLines(index, edge17Result(), 'EDGE-17')
    // Each passive appears in two hops (cable in, bridge, cable out): once in via.
    expect(new Set(lines[1].via).size).toBe(lines[1].via.length)
  })

  it('counts the ports of the switch', () => {
    expect(uplinkLines(index, edge17Result(), 'EDGE-17').total).toBe(24)
  })

  it('counts mismatches once per start endpoint', () => {
    const r = edge17Result()
    const m = r.routes[0]
    const result: TraceResult = {
      ...r,
      mismatches: [m, { ...m, end: 'AGG-08:p1' }, r.routes[1]],
    }
    expect(uplinkLines(index, result, 'EDGE-17').mismatches).toBe(2)
  })

  it('carries the truncation notice', () => {
    const r = edge17Result()
    expect(uplinkLines(index, r, 'EDGE-17').notice).toBeUndefined()
    expect(
      uplinkLines(index, { ...r, truncated: true }, 'EDGE-17').notice,
    ).toMatch(/truncated/)
  })

  it('handles a result with no routes', () => {
    const r: TraceResult = {
      ...edge17Result(),
      routes: [],
      status: 'unreachable',
    }
    expect(uplinkLines(index, r, 'EDGE-17')).toMatchObject({
      lines: [],
      mismatches: 0,
      total: 24,
    })
  })
})
