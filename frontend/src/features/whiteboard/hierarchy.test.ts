import { expect, it } from 'vitest'
import { hierarchyGraph, locationPath } from './hierarchy'
import type { Snapshot } from '../../shared/types'

const network: Snapshot = {
  context: 'installed',
  revision: '1',
  site: 'Campus',
  room: 'Room',
  networks: [{ id: 'n', name: 'N' }],
  sites: [{ id: 's', name: 'Campus' }],
  nodes: [
    { id: 'n1', siteId: 's', name: 'Room A' },
    { id: 'n2', siteId: 's', name: 'Room B' },
  ],
  racks: [
    { id: 'r1', nodeId: 'n1', name: 'Rack A', units: 12 },
    { id: 'r2', nodeId: 'n2', name: 'Rack B', units: 12 },
  ],
  equipment: [
    {
      id: 'a',
      name: 'Edge',
      rackId: 'r1',
      unit: 1,
      height: 1,
      kind: 'switch',
      role: 'access',
      networkId: 'n',
    },
    {
      id: 'b',
      name: 'Agg',
      rackId: 'r2',
      unit: 2,
      height: 1,
      kind: 'switch',
      role: 'aggregation',
      networkId: 'n',
    },
  ],
  endpoints: [
    { id: 'ap', equipmentId: 'a', label: '1' },
    { id: 'bp', equipmentId: 'b', label: '1' },
  ],
  links: [{ id: 'c', kind: 'cable', a: 'ap', b: 'bp' }],
}

it('projects real ownership as parent-first nested containers', () => {
  const graph = hierarchyGraph(network, new Set())
  expect(graph.nodes.find((n) => n.id === 'a')?.parentId).toBe('rack:r1')
  expect(graph.nodes.find((n) => n.id === 'rack:r1')?.parentId).toBe('node:n1')
  expect(graph.nodes.find((n) => n.id === 'node:n1')?.parentId).toBe('site:s')
  expect(graph.nodes.findIndex((n) => n.id === 'rack:r1')).toBeLessThan(
    graph.nodes.findIndex((n) => n.id === 'a'),
  )
  expect(locationPath(network, 'b')).toBe('Campus / Room B / Rack B / Agg')
})

it('summarizes cables at collapsed boundaries without changing physical data', () => {
  const graph = hierarchyGraph(network, new Set(['node:n1']))
  expect(graph.nodes.some((n) => n.id === 'a')).toBe(false)
  expect(graph.edges[0].source).toBe('node:n1')
  expect(graph.edges[0].target).toBe('b')
  expect(graph.edges[0].data?.linkIds).toEqual(['c'])
  expect(network.links[0].a).toBe('ap')
})

it('keeps multiple summarized cables and highlights a traced ancestor', () => {
  const snapshot = {
    ...network,
    links: [
      ...network.links,
      { id: 'c2', kind: 'cable' as const, a: 'ap', b: 'bp' },
    ],
  }
  const graph = hierarchyGraph(snapshot, new Set(['rack:r1', 'rack:r2']), {
    start: 'ap',
    end: 'bp',
    hops: [{ linkId: 'c', from: 'ap', to: 'bp', kind: 'cable' }],
  })
  expect(graph.edges).toHaveLength(1)
  expect(graph.edges[0].data?.linkIds).toEqual(['c', 'c2'])
  expect(graph.nodes.find((n) => n.id === 'node:n1')?.data.highlighted).toBe(
    true,
  )
})
