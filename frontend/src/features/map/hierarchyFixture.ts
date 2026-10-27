// Test-only: a small builder for hierarchy snapshots (switches, panels, cables).
import type { Endpoint, Equipment, Link, Snapshot } from '../../shared/types'

type Role = 'access' | 'aggregation' | 'backbone'

/**
 * Builds a snapshot piece by piece. A node gets one rack; a switch without a
 * node has no place. `run` cables two switches through any panels, taking the
 * next free port or position each time.
 */
export function hierarchyFixture() {
  const sites: Snapshot['sites'] = []
  const nodes: Snapshot['nodes'] = []
  const racks: Snapshot['racks'] = []
  const equipment: Equipment[] = []
  const endpoints: Endpoint[] = []
  const links: Link[] = []
  const networks = new Set<string>()
  const used = new Map<string, number>()
  const next = (id: string) => {
    const n = (used.get(id) ?? 0) + 1
    used.set(id, n)
    return n
  }
  let cables = 0

  const b = {
    site(id: string, name = id) {
      sites.push({ id, name })
      return b
    },
    node(id: string, siteId: string, name = id) {
      nodes.push({ id, siteId, name })
      racks.push({
        id: `rack-${id}`,
        nodeId: id,
        name: `Rack ${name}`,
        units: 42,
      })
      return b
    },
    /** A switch; `name` defaults to the ID. */
    sw(id: string, role: Role, net: string, node?: string, name = id) {
      networks.add(net)
      equipment.push({
        id,
        name,
        kind: 'switch',
        role,
        networkId: net,
        rackId: node ? `rack-${node}` : '',
        unit: 1,
        height: 1,
      })
      return b
    },
    panel(id: string, node?: string) {
      equipment.push({
        id,
        name: id,
        kind: 'panel',
        role: 'passive',
        rackId: node ? `rack-${node}` : '',
        unit: 1,
        height: 1,
      })
      return b
    },
    /** The next free port of a switch. */
    port(switchId: string) {
      const n = next(switchId)
      const id = `${switchId}:p${n}`
      endpoints.push({ id, equipmentId: switchId, label: `Port ${n}` })
      return id
    },
    /** The next free position of a panel: its front and rear, bridged. */
    slot(panelId: string) {
      const n = next(panelId)
      const front = `${panelId}:${n}:f`
      const rear = `${panelId}:${n}:r`
      endpoints.push(
        {
          id: front,
          equipmentId: panelId,
          label: `${n} front`,
          position: n,
          side: 'front',
        },
        {
          id: rear,
          equipmentId: panelId,
          label: `${n} rear`,
          position: n,
          side: 'rear',
        },
      )
      links.push({
        id: `${panelId}:${n}:bridge`,
        kind: 'internal',
        a: front,
        b: rear,
      })
      return { front, rear }
    },
    cable(a: string, z: string) {
      const id = `cable-${++cables}`
      links.push({ id, kind: 'cable', a, b: z })
      return id
    },
    /** Cables `from` to `to` (switches) through the panels in order; returns every cable ID. */
    run(from: string, to: string, via: string[] = []) {
      const ids: string[] = []
      let at = b.port(from)
      for (const panel of via) {
        const s = b.slot(panel)
        ids.push(b.cable(at, s.front))
        at = s.rear
      }
      ids.push(b.cable(at, b.port(to)))
      return ids
    },
    /** A cable from a switch port to a panel position's front, and nothing behind it. */
    deadEnd(from: string, panel: string) {
      return b.cable(b.port(from), b.slot(panel).front)
    },
    state(endpointId: string, state: Endpoint['state']) {
      const p = endpoints.find((e) => e.id === endpointId)
      if (p) p.state = state
      return b
    },
    snapshot(): Snapshot {
      return {
        context: 'installed',
        revision: '1',
        site: '',
        room: '',
        networks: [...networks]
          .sort()
          .map((id) => ({ id, name: `Network ${id}` })),
        subpanels: [],
        sites: [...sites],
        nodes: [...nodes],
        racks: [...racks],
        equipment: [...equipment],
        endpoints: [...endpoints],
        links: [...links],
      }
    },
  }
  return b
}
