// Test fixture: the fictional acceptance example from docs/acceptance-example.md.
import type {
  Endpoint,
  Equipment,
  Link,
  Route,
  Snapshot,
  Subpanel,
} from '../../shared/types'

type Role = 'access' | 'aggregation' | 'backbone' | 'passive'

function equipment(
  id: string,
  kind: Equipment['kind'],
  role: Role,
  networkId?: string,
): Equipment {
  return {
    id,
    name: id,
    kind,
    role,
    networkId,
    rackId: 'r',
    unit: 1,
    height: 1,
  }
}

export function acceptanceSnapshot(): Snapshot {
  const eq: Equipment[] = [
    equipment('EDGE-17', 'switch', 'access', 'A'),
    equipment('PANEL-A', 'panel', 'passive'),
    equipment('HDF-01', 'hdf', 'passive'),
    equipment('HDF-02', 'hdf', 'passive'),
    equipment('AGG-03', 'switch', 'aggregation', 'A'),
    equipment('AGG-08', 'switch', 'aggregation', 'A'),
    equipment('AGG-15', 'switch', 'aggregation', 'A'),
    equipment('BB-01', 'switch', 'backbone', 'A'),
    equipment('EDGE-22', 'switch', 'access', 'B'),
    equipment('PANEL-DR', 'panel', 'passive'),
    equipment('AGG-12', 'switch', 'aggregation', 'B'),
  ]
  const endpoints: Endpoint[] = []
  const links: Link[] = []
  const subpanels: Subpanel[] = []
  const subpanelIds = new Set<string>()

  const port = (device: string, n: number) => {
    const id = `${device}:p${n}`
    if (!endpoints.some((e) => e.id === id))
      endpoints.push({ id, equipmentId: device, label: String(n) })
    return id
  }
  // A position side: standard panel ("PANEL-A", "1") or HDF ("HDF-01", "3C/5").
  const side = (device: string, spot: string, s: 'front' | 'rear') => {
    const [block, position] = spot.includes('/')
      ? spot.split('/')
      : [undefined, spot]
    const id = `${device}:${spot}:${s === 'front' ? 'f' : 'r'}`
    let subpanelId: string | undefined
    if (block) {
      subpanelId = `${device}:${block}`
      if (!subpanelIds.has(subpanelId)) {
        subpanelIds.add(subpanelId)
        subpanels.push({
          id: subpanelId,
          equipmentId: device,
          row: Number(block[0]),
          column: block[1] as Subpanel['column'],
        })
      }
    }
    if (!endpoints.some((e) => e.id === id)) {
      endpoints.push({
        id,
        equipmentId: device,
        label: `${spot} ${s}`,
        subpanelId,
        position: Number(position),
        side: s,
      })
      const bridge = `${device}:${spot}:bridge`
      if (!links.some((l) => l.id === bridge))
        links.push({
          id: bridge,
          kind: 'internal',
          a: `${device}:${spot}:f`,
          b: `${device}:${spot}:r`,
        })
    }
    return id
  }
  const cable = (id: string, a: string, b: string) =>
    links.push({ id, kind: 'cable', a, b })

  // Network A: [position on PANEL-A, HDF-01, HDF-02, destination]
  const circuits: [string, string, string, string, string][] = [
    ['A', '1', '3C/5', '2B/3', 'AGG-03'],
    ['A', '2', '1A/2', '1D/2', 'AGG-08'],
    ['A', '3', '2D/4', '3A/1', 'BB-01'],
  ]
  circuits.forEach(([, p, h1, h2, dest], i) => {
    const n = i * 4 + 1
    cable(
      `A${String(n).padStart(2, '0')}`,
      port('EDGE-17', i + 1),
      side('PANEL-A', p, 'front'),
    )
    cable(
      `A${String(n + 1).padStart(2, '0')}`,
      side('PANEL-A', p, 'rear'),
      side('HDF-01', h1, 'rear'),
    )
    cable(
      `A${String(n + 2).padStart(2, '0')}`,
      side('HDF-01', h1, 'front'),
      side('HDF-02', h2, 'front'),
    )
    cable(
      `A${String(n + 3).padStart(2, '0')}`,
      side('HDF-02', h2, 'rear'),
      port(dest, 1),
    )
  })
  cable('B01', port('EDGE-22', 1), side('PANEL-DR', '1', 'front'))
  cable('B02', side('PANEL-DR', '1', 'rear'), side('HDF-01', '3C/2', 'rear'))
  cable('B03', side('HDF-01', '3C/2', 'front'), side('HDF-02', '2B/6', 'front'))
  cable('B04', side('HDF-02', '2B/6', 'rear'), port('AGG-12', 1))
  port('AGG-15', 1) // unconnected

  return {
    context: 'installed',
    revision: '1',
    site: 'Main Campus',
    room: '',
    networks: [
      { id: 'A', name: 'Network A' },
      { id: 'B', name: 'Network B' },
    ],
    subpanels,
    sites: [],
    nodes: [],
    racks: [],
    equipment: eq,
    endpoints,
    links,
  }
}

/** The ordered AGG-03 route from the acceptance example (section 4). */
export function agg03Route(): Route {
  const ids = [
    ['A01', 'EDGE-17:p1', 'PANEL-A:1:f', 'cable'],
    ['PANEL-A:1:bridge', 'PANEL-A:1:f', 'PANEL-A:1:r', 'internal'],
    ['A02', 'PANEL-A:1:r', 'HDF-01:3C/5:r', 'cable'],
    ['HDF-01:3C/5:bridge', 'HDF-01:3C/5:r', 'HDF-01:3C/5:f', 'internal'],
    ['A03', 'HDF-01:3C/5:f', 'HDF-02:2B/3:f', 'cable'],
    ['HDF-02:2B/3:bridge', 'HDF-02:2B/3:f', 'HDF-02:2B/3:r', 'internal'],
    ['A04', 'HDF-02:2B/3:r', 'AGG-03:p1', 'cable'],
  ] as const
  return {
    start: 'EDGE-17:p1',
    end: 'AGG-03:p1',
    destinationEquipmentId: 'AGG-03',
    destinationRole: 'aggregation',
    destinationNetworkId: 'A',
    sourceNetworkId: 'A',
    hops: ids.map(([linkId, from, to, kind]) => ({ linkId, from, to, kind })),
  }
}
