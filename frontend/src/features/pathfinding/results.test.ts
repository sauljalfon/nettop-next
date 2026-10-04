import { describe, expect, it } from 'vitest'
import {
  destinationOf,
  mismatchLine,
  routeOptionLabel,
  sourceNetworkNote,
  truncationNotice,
} from './results'
import type { Route, Snapshot, TraceResult } from '../../shared/types'

const sw = (id: string, name: string, role: string, networkId: string) => ({
  id,
  name,
  kind: 'switch' as const,
  role: role as 'access',
  networkId,
  rackId: 'r',
  unit: 1,
  height: 1,
})

const snapshot: Snapshot = {
  networks: [
    { id: 'a', name: 'Network A' },
    { id: 'b', name: 'Network B' },
  ],
  subpanels: [],
  sites: [],
  nodes: [],
  context: 'installed',
  revision: '1',
  site: '',
  room: '',
  racks: [],
  equipment: [
    sw('edge', 'EDGE-17', 'access', 'a'),
    sw('agg', 'AGG-03', 'aggregation', 'a'),
    sw('bb', 'BB-01', 'backbone', 'a'),
    sw('far', 'AGG-12', 'aggregation', 'b'),
  ],
  endpoints: [
    { id: 'edge:1', equipmentId: 'edge', label: 'Port 1' },
    { id: 'edge:4', equipmentId: 'edge', label: 'Port 4' },
    { id: 'agg:1', equipmentId: 'agg', label: 'Port 1' },
    { id: 'bb:1', equipmentId: 'bb', label: 'Port 1' },
    { id: 'far:2', equipmentId: 'far', label: 'Port 2' },
  ],
  links: [],
}

const route = (over: Partial<Route>): Route => ({
  start: 'edge:1',
  end: 'agg:1',
  hops: [],
  ...over,
})

describe('distribution result display', () => {
  it('names the destination, labels AGG and BB, and resolves the network', () => {
    const agg = route({
      destinationEquipmentId: 'agg',
      destinationRole: 'aggregation',
      destinationNetworkId: 'a',
      sourceNetworkId: 'a',
    })
    const bb = route({
      end: 'bb:1',
      destinationEquipmentId: 'bb',
      destinationRole: 'backbone',
      destinationNetworkId: 'a',
      sourceNetworkId: 'a',
    })
    expect(destinationOf(snapshot, agg)).toEqual({
      name: 'AGG-03',
      role: 'AGG',
      network: 'Network A',
    })
    expect(destinationOf(snapshot, bb)).toEqual({
      name: 'BB-01',
      role: 'BB',
      network: 'Network A',
    })
    expect(routeOptionLabel(snapshot, agg)).toBe(
      'EDGE-17 · Port 1 → AGG-03 · Port 1 · AGG · Network A',
    )
    expect(routeOptionLabel(snapshot, bb)).toBe(
      'EDGE-17 · Port 1 → BB-01 · Port 1 · BB · Network A',
    )
  })

  it('falls back to IDs instead of inventing names or networks', () => {
    const unknown = route({
      destinationEquipmentId: 'gone',
      destinationRole: 'backbone',
      destinationNetworkId: 'gone-net',
    })
    expect(destinationOf(snapshot, unknown)).toEqual({
      name: 'gone',
      role: 'BB',
      network: 'gone-net',
    })
  })

  it('leaves point-to-point routes without destination metadata unchanged', () => {
    const p2p = route({})
    expect(destinationOf(snapshot, p2p)).toBeUndefined()
    expect(routeOptionLabel(snapshot, p2p)).toBe(
      'EDGE-17 · Port 1 → AGG-03 · Port 1',
    )
    expect(sourceNetworkNote(snapshot, p2p)).toBeUndefined()
  })

  it('says so when the source network is unresolved, and only then', () => {
    const base = {
      destinationEquipmentId: 'agg',
      destinationRole: 'aggregation' as const,
      destinationNetworkId: 'a',
    }
    expect(
      sourceNetworkNote(snapshot, route({ ...base, sourceNetworkId: 'a' })),
    ).toBeUndefined()
    expect(sourceNetworkNote(snapshot, route(base))).toBe(
      'Source network unresolved: no access device on this circuit.',
    )
  })

  it('lists a cross-network destination as a mismatch, never as a route', () => {
    const m = route({
      start: 'edge:4',
      end: 'far:2',
      destinationEquipmentId: 'far',
      destinationRole: 'aggregation',
      destinationNetworkId: 'b',
      sourceNetworkId: 'a',
    })
    expect(mismatchLine(snapshot, m)).toBe(
      'EDGE-17 · Port 4 → AGG-12 · Port 2 · AGG · Network B (source Network A)',
    )
  })

  it('reports truncation separately and only when results were dropped', () => {
    const result = (truncated: boolean) =>
      ({ truncated }) as unknown as TraceResult
    expect(truncationNotice(result(false))).toBeUndefined()
    expect(truncationNotice(result(true))).toMatch(/truncated/i)
  })
})
