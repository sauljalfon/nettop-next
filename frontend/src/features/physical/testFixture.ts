// Test fixture for the physical model: the acceptance example with the
// placements from docs/acceptance-example.md section 1 and, on request, a full
// HDF grid (the acceptance snapshot only creates the blocks its cables use).
import type { Endpoint, Link, Snapshot, Subpanel } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'

const PLACEMENT: Record<string, [number, number]> = {
  'EDGE-17': [8, 1],
  'PANEL-A': [11, 1],
  'HDF-01': [4, 3],
  'HDF-02': [4, 3],
  'AGG-03': [8, 1],
  'AGG-08': [8, 1],
  'AGG-15': [6, 1],
  'BB-01': [8, 1],
  'EDGE-22': [8, 1],
  'PANEL-DR': [11, 1],
  'AGG-12': [8, 1],
}

export function physicalSnapshot(): Snapshot {
  const s = acceptanceSnapshot()
  return {
    ...s,
    equipment: s.equipment.map((e) => ({
      ...e,
      unit: PLACEMENT[e.id][0],
      height: PLACEMENT[e.id][1],
    })),
  }
}

/** Adds every block A–D x rows of an HDF, six positions per side, with bridges. */
export function withFullHdf(s: Snapshot, hdf: string, rows: number): Snapshot {
  const subpanels: Subpanel[] = [...s.subpanels]
  const endpoints: Endpoint[] = [...s.endpoints]
  const links: Link[] = [...s.links]
  const have = new Set(endpoints.map((e) => e.id))
  for (let row = 1; row <= rows; row++)
    for (const column of ['A', 'B', 'C', 'D'] as const) {
      const block = `${row}${column}`
      const subpanelId = `${hdf}:${block}`
      if (!subpanels.some((p) => p.id === subpanelId))
        subpanels.push({ id: subpanelId, equipmentId: hdf, row, column })
      for (let position = 1; position <= 6; position++) {
        const spot = `${block}/${position}`
        for (const side of ['front', 'rear'] as const) {
          const id = `${hdf}:${spot}:${side === 'front' ? 'f' : 'r'}`
          if (have.has(id)) continue
          have.add(id)
          endpoints.push({
            id,
            equipmentId: hdf,
            label: `${spot} ${side}`,
            subpanelId,
            position,
            side,
          })
        }
        const bridge = `${hdf}:${spot}:bridge`
        if (!links.some((l) => l.id === bridge))
          links.push({
            id: bridge,
            kind: 'internal',
            a: `${hdf}:${spot}:f`,
            b: `${hdf}:${spot}:r`,
          })
      }
    }
  return { ...s, subpanels, endpoints, links }
}

/**
 * Adds a switch whose ports come from port groups (step 11b): positions 1…N in
 * group order, portGroup 1…G, labels `${prefix}${n}`. The IDs are `<id>:p<n>`.
 */
export function withGroupedSwitch(
  s: Snapshot,
  id: string,
  rackId: string,
  unit: number,
  groups: {
    count: number
    prefix: string
    start?: number
    portType?: 'copper' | 'fiber'
    connector?: string
    speed?: string
  }[],
  networkId = s.networks[0].id,
): Snapshot {
  const endpoints: Endpoint[] = []
  for (const [g, group] of groups.entries())
    for (let i = 0; i < group.count; i++) {
      const position = endpoints.length + 1
      endpoints.push({
        id: `${id}:p${position}`,
        equipmentId: id,
        label: `${group.prefix}${(group.start ?? 1) + i}`,
        position,
        portGroup: g + 1,
        ...(group.portType && { portType: group.portType }),
        ...(group.connector && { connector: group.connector }),
        ...(group.speed && { speed: group.speed }),
      })
    }
  return {
    ...s,
    equipment: [
      ...s.equipment,
      {
        id,
        name: id,
        kind: 'switch',
        role: 'access',
        networkId,
        rackId,
        unit,
        height: 1,
      },
    ],
    endpoints: [...s.endpoints, ...endpoints],
  }
}
