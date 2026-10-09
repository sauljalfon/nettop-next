import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from './acceptanceFixture'
import { layeredLayout } from './layout'

const col = (s: ReturnType<typeof layeredLayout>, id: string) => s.get(id)!.x

describe('C01 deterministic layered default layout', () => {
  const s = acceptanceSnapshot()
  const layout = layeredLayout(s, new Map())

  it('places access left, passive by cable distance, AGG/BB right', () => {
    expect(col(layout, 'EDGE-17')).toBe(col(layout, 'EDGE-22'))
    const x = (id: string) => col(layout, id)
    expect(x('EDGE-17')).toBeLessThan(x('PANEL-A'))
    expect(x('PANEL-A')).toBe(x('PANEL-DR'))
    expect(x('PANEL-A')).toBeLessThan(x('HDF-01'))
    expect(x('HDF-01')).toBeLessThan(x('HDF-02'))
    expect(x('HDF-02')).toBeLessThan(x('AGG-03'))
    for (const id of ['AGG-08', 'BB-01', 'AGG-12'])
      expect(x(id)).toBe(x('AGG-03'))
  })

  it('gives every card a distinct position', () => {
    const keys = [...layout.values()].map((p) => `${p.x},${p.y}`)
    expect(new Set(keys).size).toBe(s.equipment.length)
  })

  it('parks equipment unreachable from any access switch below the map', () => {
    const parked = layout.get('AGG-15')!
    const maxY = Math.max(
      ...s.equipment
        .filter((e) => e.id !== 'AGG-15')
        .map((e) => layout.get(e.id)!.y),
    )
    expect(parked.y).toBeGreaterThan(maxY)
  })

  it('orders a column by the average row of cabled neighbors, then by name', () => {
    const y = (id: string) => layout.get(id)!.y
    // AGG-03/08/BB-01 all hang off HDF-02, which is one card: they fall back to name order.
    expect(y('AGG-03')).toBeLessThan(y('AGG-08'))
    expect(y('AGG-08')).toBeLessThan(y('BB-01'))
    expect(y('EDGE-17')).toBeLessThan(y('EDGE-22'))
  })

  it('is deterministic regardless of input order', () => {
    const shuffled = {
      ...s,
      equipment: [...s.equipment].reverse(),
      links: [...s.links].reverse(),
      endpoints: [...s.endpoints].reverse(),
    }
    expect([...layeredLayout(shuffled, new Map())].sort()).toEqual(
      [...layout].sort(),
    )
  })
})

describe('layout only places cards without a position', () => {
  it('never recomputes existing positions', () => {
    const s = acceptanceSnapshot()
    const existing = new Map([['EDGE-17', { x: 5, y: 7 }]])
    const layout = layeredLayout(s, existing)
    expect(layout.has('EDGE-17')).toBe(false)
    expect(layout.size).toBe(s.equipment.length - 1)
  })

  it('does not collide with an existing card when placing a new one', () => {
    const s = acceptanceSnapshot()
    const full = layeredLayout(s, new Map())
    const existing = new Map(full)
    existing.delete('AGG-15')
    existing.set('AGG-12', full.get('AGG-15')!)
    const placed = layeredLayout(s, existing).get('AGG-15')!
    expect(placed).not.toEqual(existing.get('AGG-12'))
  })
})

// ---- M4.2: the first layout at campus size --------------------------------
import type { Snapshot } from '../../shared/types'
import { CANVAS_ASPECT, COLUMN_WIDTH, ROW_HEIGHT } from './layout'

/**
 * A synthetic campus-shaped network: `nodes` buildings with `perNode` access
 * switches each, one panel per building (one position per switch), and `aggs`
 * AGG switches, every access switch cabled through its building's panel to an AGG.
 */
function campus({
  nodes,
  perNode,
  aggs = 60,
}: {
  nodes: number
  perNode: number
  aggs?: number
}): Snapshot {
  const equipment: unknown[] = []
  const endpoints: unknown[] = []
  const links: unknown[] = []
  const racks: unknown[] = []
  const nodeList: unknown[] = []
  const port = (equipmentId: string, id: string) =>
    endpoints.push({ id, equipmentId, label: id })
  let cable = 0
  const connect = (a: string, b: string) =>
    links.push({ id: `c${++cable}`, a, b, kind: 'cable' })
  for (let d = 0; d < aggs; d++) {
    equipment.push({
      id: `agg${d}`,
      name: `AGG-${String(d).padStart(2, '0')}`,
      role: 'aggregation',
      kind: 'switch',
      rackId: 'rack-md',
    })
    for (let p = 0; p < Math.ceil((nodes * perNode) / aggs); p++)
      port(`agg${d}`, `agg${d}:p${p}`)
  }
  racks.push({ id: 'rack-md', nodeId: 'node-md', name: 'MD', units: 42 })
  nodeList.push({ id: 'node-md', siteId: 'site', name: 'Main Distribution' })
  let k = 0
  for (let n = 0; n < nodes; n++) {
    const node = `node-b${String(n).padStart(2, '0')}`
    nodeList.push({
      id: node,
      siteId: 'site',
      name: `Building ${String(n).padStart(2, '0')}`,
    })
    racks.push({ id: `rack-${node}`, nodeId: node, name: 'R', units: 42 })
    const panel = `panel-${n}`
    equipment.push({
      id: panel,
      name: `PANEL-${String(n).padStart(2, '0')}`,
      role: 'passive',
      kind: 'panel',
      rackId: `rack-${node}`,
    })
    for (let i = 0; i < perNode; i++) {
      const sw = `acc-${n}-${i}`
      equipment.push({
        id: sw,
        name: `ACC-${String(n).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        role: 'access',
        kind: 'switch',
        rackId: `rack-${node}`,
      })
      port(sw, `${sw}:p1`)
      port(panel, `${panel}:${i}:f`)
      port(panel, `${panel}:${i}:r`)
      links.push({
        id: `${panel}:${i}:bridge`,
        a: `${panel}:${i}:f`,
        b: `${panel}:${i}:r`,
        kind: 'internal',
      })
      connect(`${sw}:p1`, `${panel}:${i}:f`)
      const agg = k % aggs
      connect(`${panel}:${i}:r`, `agg${agg}:p${Math.floor(k / aggs)}`)
      k++
    }
  }
  return {
    context: 'installed',
    revision: 'x',
    sites: [{ id: 'site', name: 'Campus' }],
    nodes: nodeList,
    racks,
    equipment,
    endpoints,
    links,
    networks: [],
    subpanels: [],
  } as unknown as Snapshot
}

const bounds = (layout: Map<string, { x: number; y: number }>) => {
  const xs = [...layout.values()].map((p) => p.x)
  const ys = [...layout.values()].map((p) => p.y)
  return {
    width: Math.max(...xs) - Math.min(...xs) + COLUMN_WIDTH,
    height: Math.max(...ys) - Math.min(...ys) + ROW_HEIGHT,
  }
}

describe('LY-01 small networks keep today’s layout exactly', () => {
  it('the acceptance example is laid out identically', () => {
    const layout = layeredLayout(acceptanceSnapshot(), new Map())
    expect(
      [...layout]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, p]) => [id, p.x, p.y]),
    ).toEqual([
      ['AGG-03', 1280, 0],
      ['AGG-08', 1280, 200],
      ['AGG-12', 1280, 400],
      ['AGG-15', 0, 1000],
      ['BB-01', 1280, 600],
      ['EDGE-17', 0, 0],
      ['EDGE-22', 0, 200],
      ['HDF-01', 640, 0],
      ['HDF-02', 960, 0],
      ['PANEL-A', 320, 0],
      ['PANEL-DR', 320, 200],
    ])
  })

  it('a network whose layers all have 40 cards or fewer is not wrapped', () => {
    const layout = layeredLayout(
      campus({ nodes: 4, perNode: 10, aggs: 8 }),
      new Map(),
    )
    for (const [id, p] of layout) {
      if (id.startsWith('acc')) expect(p.x).toBe(0)
      if (id.startsWith('panel')) expect(p.x).toBe(COLUMN_WIDTH)
      if (id.startsWith('agg')) expect(p.x).toBe(2 * COLUMN_WIDTH)
    }
  })
})

describe('LY-02 a large layer wraps into sub-columns, so the map is not one strip', () => {
  const layout = layeredLayout(campus({ nodes: 36, perNode: 42 }), new Map())
  const { width, height } = bounds(layout)

  it('1,512 access switches: the map is within 1:3 of the canvas’s aspect and no layer is taller than the map is wide', () => {
    expect(layout.size).toBe(1512 + 36 + 60)
    const ratio = width / height / CANVAS_ASPECT
    expect(ratio).toBeGreaterThan(1 / 3)
    expect(ratio).toBeLessThan(3)
    for (const prefix of ['acc', 'panel', 'agg']) {
      const ys = [...layout]
        .filter(([id]) => id.startsWith(prefix))
        .map(([, p]) => p.y)
      const tall = Math.max(...ys) - Math.min(...ys) + ROW_HEIGHT
      expect(tall, prefix).toBeLessThanOrEqual(
        (width / CANVAS_ASPECT) * 1.25, // about the map's width / aspect
      )
    }
  })

  it('never puts two cards at the same place', () => {
    const keys = [...layout.values()].map((p) => `${p.x},${p.y}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is deterministic', () => {
    expect(
      layeredLayout(campus({ nodes: 36, perNode: 42 }), new Map()),
    ).toEqual(layout)
  })

  it('a layer wider than one column has a wider gap before the next layer than between its sub-columns', () => {
    const xs = (prefix: string) =>
      [
        ...new Set(
          [...layout]
            .filter(([id]) => id.startsWith(prefix))
            .map(([, p]) => p.x),
        ),
      ].sort((a, b) => a - b)
    const acc = xs('acc')
    expect(acc.length).toBeGreaterThan(1)
    expect(acc[1] - acc[0]).toBe(COLUMN_WIDTH)
    const panel = xs('panel')
    expect(panel[0] - acc[acc.length - 1]).toBeGreaterThan(COLUMN_WIDTH)
  })
})

describe('LY-03 cards of one node stay together in one sub-column', () => {
  it('20 switches per building: each building’s switches share one x and sit in consecutive rows', () => {
    const layout = layeredLayout(campus({ nodes: 75, perNode: 20 }), new Map())
    for (let n = 0; n < 75; n++) {
      const cards = [...layout]
        .filter(([id]) => id.startsWith(`acc-${n}-`))
        .map(([, p]) => p)
      expect(new Set(cards.map((p) => p.x)).size, `building ${n}`).toBe(1)
      const ys = cards.map((p) => p.y).sort((a, b) => a - b)
      expect(ys[ys.length - 1] - ys[0]).toBe((cards.length - 1) * ROW_HEIGHT)
    }
  })

  it('42 switches per building (the campus): still one sub-column each', () => {
    const layout = layeredLayout(campus({ nodes: 36, perNode: 42 }), new Map())
    for (let n = 0; n < 36; n++) {
      const xs = new Set(
        [...layout]
          .filter(([id]) => id.startsWith(`acc-${n}-`))
          .map(([, p]) => p.x),
      )
      expect(xs.size, `building ${n}`).toBe(1)
    }
  })

  it('inside a group the order is by name (no cabled neighbors in the first layer)', () => {
    const layout = layeredLayout(campus({ nodes: 36, perNode: 42 }), new Map())
    const ys = Array.from({ length: 42 }, (_, i) => layout.get(`acc-3-${i}`)!.y)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
  })
})

describe('LY-04 the layers keep their left-to-right order', () => {
  it('every access card is left of every passive card, and every passive card left of every AGG', () => {
    const layout = layeredLayout(campus({ nodes: 36, perNode: 42 }), new Map())
    const x = (prefix: string) =>
      [...layout].filter(([id]) => id.startsWith(prefix)).map(([, p]) => p.x)
    expect(Math.max(...x('acc'))).toBeLessThan(Math.min(...x('panel')))
    expect(Math.max(...x('panel'))).toBeLessThan(Math.min(...x('agg')))
  })

  it('existing positions still win and new cards never land on them', () => {
    const s = campus({ nodes: 36, perNode: 42 })
    const all = layeredLayout(s, new Map())
    const existing = new Map([['acc-0-0', all.get('acc-0-0')!]])
    const later = layeredLayout(s, existing)
    expect(later.has('acc-0-0')).toBe(false)
    const taken = new Set([...later.values()].map((p) => `${p.x},${p.y}`))
    expect(taken.has(`${all.get('acc-0-0')!.x},${all.get('acc-0-0')!.y}`)).toBe(
      false,
    )
  })
})
