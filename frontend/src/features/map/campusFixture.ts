// Test fixture: one AGG and 30 access switches in 3 nodes, each through its own panel.
import type { Endpoint, Equipment, Snapshot } from '../../shared/types'

export function campusSnapshot(): Snapshot {
  const eq: Equipment[] = []
  const endpoints: Endpoint[] = []
  const links: Snapshot['links'] = []
  const racks: Snapshot['racks'] = [
    { id: 'rack-core', nodeId: 'n-core', name: 'Core', units: 12 },
  ]
  const nodes: Snapshot['nodes'] = [{ id: 'n-core', siteId: 's', name: 'Core' }]
  for (let k = 1; k <= 3; k++) {
    nodes.push({ id: `n-${k}`, siteId: 's', name: `Floor ${k}` })
    racks.push({ id: `rack-${k}`, nodeId: `n-${k}`, name: `R${k}`, units: 12 })
  }
  const add = (
    id: string,
    kind: Equipment['kind'],
    role: string,
    rackId: string,
  ) =>
    eq.push({
      id,
      name: id,
      kind,
      role,
      networkId: role === 'passive' ? undefined : 'A',
      rackId,
      unit: 1,
      height: 1,
    })
  add('AGG-1', 'switch', 'aggregation', 'rack-core')
  for (let i = 1; i <= 30; i++) {
    const n = String(i).padStart(2, '0')
    const rack = `rack-${((i - 1) % 3) + 1}`
    add(`SW-${n}`, 'switch', 'access', rack)
    add(`PNL-${n}`, 'panel', 'passive', rack)
    endpoints.push(
      { id: `SW-${n}:p1`, equipmentId: `SW-${n}`, label: '1' },
      {
        id: `PNL-${n}:1:f`,
        equipmentId: `PNL-${n}`,
        label: '1 front',
        position: 1,
        side: 'front',
      },
      {
        id: `PNL-${n}:1:r`,
        equipmentId: `PNL-${n}`,
        label: '1 rear',
        position: 1,
        side: 'rear',
      },
      { id: `AGG-1:p${i}`, equipmentId: 'AGG-1', label: String(i) },
    )
    links.push(
      {
        id: `PNL-${n}:b`,
        kind: 'internal',
        a: `PNL-${n}:1:f`,
        b: `PNL-${n}:1:r`,
      },
      { id: `c${n}a`, kind: 'cable', a: `SW-${n}:p1`, b: `PNL-${n}:1:f` },
      { id: `c${n}b`, kind: 'cable', a: `PNL-${n}:1:r`, b: `AGG-1:p${i}` },
    )
  }
  return {
    context: 'installed',
    revision: '1',
    site: 'S',
    room: '',
    networks: [{ id: 'A', name: 'A' }],
    subpanels: [],
    sites: [{ id: 's', name: 'S' }],
    nodes,
    racks,
    equipment: eq,
    endpoints,
    links,
  }
}
