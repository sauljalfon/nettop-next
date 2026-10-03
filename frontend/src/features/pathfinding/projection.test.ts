import { describe, expect, it } from 'vitest'
import { routeHighlight, endpointLabel, cableEdges } from './projection'
import type { Snapshot } from '../../shared/types'

const snapshot: Snapshot = {
  networks: [{ id: 'n', name: 'N' }],
  sites: [],
  nodes: [],
  context: 'installed',
  revision: '1',
  site: 'Site',
  room: 'Room',
  racks: [],
  equipment: [
    {
      id: 'sw',
      name: 'EDGE',
      kind: 'switch',
      role: 'access',
      networkId: 'n',
      rackId: 'r',
      unit: 1,
      height: 1,
    },
    {
      id: 'p',
      name: 'PANEL',
      kind: 'panel',
      role: 'passive',
      rackId: 'r',
      unit: 2,
      height: 1,
    },
  ],
  endpoints: [
    { id: 's', equipmentId: 'sw', label: '1' },
    { id: 'f', equipmentId: 'p', label: '1 front' },
    { id: 'r', equipmentId: 'p', label: '1 rear' },
  ],
  links: [
    { id: 'c', a: 's', b: 'f', kind: 'cable' },
    { id: 'i', a: 'f', b: 'r', kind: 'internal' },
  ],
}

describe('trace visualization preserves physical semantics', () => {
  it('highlights both sides of a bridge and equipment without turning it into a cable', () => {
    const route = {
      start: 's',
      end: 'r',
      hops: [
        { linkId: 'c', from: 's', to: 'f', kind: 'cable' as const },
        { linkId: 'i', from: 'f', to: 'r', kind: 'internal' as const },
      ],
    }
    const result = routeHighlight(snapshot, route)
    expect([...result.endpointIds]).toEqual(['s', 'f', 'r'])
    expect([...result.equipmentIds]).toEqual(['sw', 'p'])
    expect(cableEdges(snapshot).map((e) => e.id)).toEqual(['c'])
  })
  it('clears highlighting when there is no active route', () => {
    expect(routeHighlight(snapshot).equipmentIds.size).toBe(0)
  })
  it('resolves exact endpoint labels for trace explanations', () => {
    expect(endpointLabel(snapshot, 'f')).toBe('PANEL · 1 front')
  })
})
