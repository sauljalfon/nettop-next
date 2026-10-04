// Test fixture: the fictional acceptance example from docs/acceptance-example.md.
import type {
  Endpoint,
  Equipment,
  Link,
  Route,
  Snapshot,
  Subpanel,
  TraceResult,
} from '../../shared/types'

type Role = 'access' | 'aggregation' | 'backbone' | 'passive'

const RACKS: Record<string, string> = {
  'EDGE-17': 'rack-a03',
  'PANEL-A': 'rack-a03',
  'HDF-01': 'rack-sm01',
  'HDF-02': 'rack-core-01',
  'AGG-03': 'rack-core-01',
  'AGG-08': 'rack-core-02',
  'AGG-15': 'rack-core-02',
  'BB-01': 'rack-core-03',
  'EDGE-22': 'rack-dr01',
  'PANEL-DR': 'rack-dr01',
  'AGG-12': 'rack-dr02',
}

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
    rackId: RACKS[id],
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
  // Unused capacity: every switch has 24 ports, standard panels 24 positions,
  // and HDF-01 has two configured positions with no cable.
  for (const e of eq)
    if (e.kind === 'switch') for (let n = 1; n <= 24; n++) port(e.id, n)
  for (const panel of ['PANEL-A', 'PANEL-DR'])
    for (let n = 1; n <= 24; n++) {
      side(panel, String(n), 'front')
      side(panel, String(n), 'rear')
    }
  for (const side_ of ['front', 'rear'] as const) {
    side('HDF-01', '4A/1', side_)
    side('HDF-01', '4A/2', side_)
  }

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
    sites: [
      { id: 'site-main', name: 'Main Campus' },
      { id: 'site-dr', name: 'DR Site' },
    ],
    nodes: [
      { id: 'node-a', siteId: 'site-main', name: 'Building A' },
      { id: 'node-sm', siteId: 'site-main', name: 'North Sub-main' },
      { id: 'node-core', siteId: 'site-main', name: 'Main Distribution' },
      { id: 'node-dr1', siteId: 'site-dr', name: 'DR Access' },
      { id: 'node-dr2', siteId: 'site-dr', name: 'DR Distribution' },
    ],
    racks: [
      { id: 'rack-a03', nodeId: 'node-a', name: 'Rack A03', units: 12 },
      { id: 'rack-sm01', nodeId: 'node-sm', name: 'Rack SM01', units: 12 },
      {
        id: 'rack-core-01',
        nodeId: 'node-core',
        name: 'Rack Core 01',
        units: 12,
      },
      {
        id: 'rack-core-02',
        nodeId: 'node-core',
        name: 'Rack Core 02',
        units: 12,
      },
      {
        id: 'rack-core-03',
        nodeId: 'node-core',
        name: 'Rack Core 03',
        units: 12,
      },
      { id: 'rack-dr01', nodeId: 'node-dr1', name: 'Rack DR01', units: 12 },
      { id: 'rack-dr02', nodeId: 'node-dr2', name: 'Rack DR02', units: 12 },
    ],
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

/** Distribution result from EDGE-17 (all ports): AGG-03, AGG-08, then BB-01. */
export function edge17Result(): TraceResult {
  const route = (
    port: number,
    dest: string,
    role: 'aggregation' | 'backbone',
    first: number,
    hdf1: string,
    hdf2: string,
  ): Route => {
    const n = (i: number) => `A${String(first + i).padStart(2, '0')}`
    const hops: Route['hops'] = [
      {
        linkId: n(0),
        from: `EDGE-17:p${port}`,
        to: `PANEL-A:${port}:f`,
        kind: 'cable',
      },
      {
        linkId: `PANEL-A:${port}:bridge`,
        from: `PANEL-A:${port}:f`,
        to: `PANEL-A:${port}:r`,
        kind: 'internal',
      },
      {
        linkId: n(1),
        from: `PANEL-A:${port}:r`,
        to: `HDF-01:${hdf1}:r`,
        kind: 'cable',
      },
      {
        linkId: `HDF-01:${hdf1}:bridge`,
        from: `HDF-01:${hdf1}:r`,
        to: `HDF-01:${hdf1}:f`,
        kind: 'internal',
      },
      {
        linkId: n(2),
        from: `HDF-01:${hdf1}:f`,
        to: `HDF-02:${hdf2}:f`,
        kind: 'cable',
      },
      {
        linkId: `HDF-02:${hdf2}:bridge`,
        from: `HDF-02:${hdf2}:f`,
        to: `HDF-02:${hdf2}:r`,
        kind: 'internal',
      },
      {
        linkId: n(3),
        from: `HDF-02:${hdf2}:r`,
        to: `${dest}:p1`,
        kind: 'cable',
      },
    ]
    return {
      start: `EDGE-17:p${port}`,
      end: `${dest}:p1`,
      hops,
      destinationEquipmentId: dest,
      destinationRole: role,
      destinationNetworkId: 'A',
      sourceNetworkId: 'A',
    }
  }
  return {
    context: 'installed',
    revision: '1',
    mode: 'distribution',
    status: 'reached',
    reason: 'Found 3 AGG/BB route(s).',
    routes: [
      route(1, 'AGG-03', 'aggregation', 1, '3C/5', '2B/3'),
      route(2, 'AGG-08', 'aggregation', 5, '1A/2', '1D/2'),
      route(3, 'BB-01', 'backbone', 9, '2D/4', '3A/1'),
    ],
    mismatches: [],
    starts: [],
    truncated: false,
  }
}
