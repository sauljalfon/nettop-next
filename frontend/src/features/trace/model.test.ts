import { describe, expect, it } from 'vitest'
import type { Snapshot, TraceResult } from '../../shared/types'
import {
  acceptanceSnapshot,
  agg03Route,
  edge17Result,
} from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import type { PathPlate, PathStep } from '../paths/pathLine'
import {
  nodeFrames,
  portOutcomes,
  resultCounts,
  resultGroups,
  routeLine,
  sharedEquipment,
  walkRows,
  isFrame,
  type Frame,
} from './model'

const indexOf = (edit?: (s: Snapshot) => Snapshot) => {
  const s = acceptanceSnapshot()
  return indexSnapshot(edit ? edit(s) : s)
}
const plates = (steps: PathStep[]) =>
  steps.filter((s): s is PathPlate => s.kind === 'plate')
const names = (steps: PathStep[]) => plates(steps).map((p) => p.name)
const cableIds = (steps: PathStep[]) =>
  steps.flatMap((s) => (s.kind === 'cable' ? [s.linkId] : []))

const empty = (): TraceResult => ({
  ...edge17Result(),
  status: 'unreachable',
  reason: 'No AGG/BB found.',
  routes: [],
  mismatches: [],
  starts: [],
})

describe('routeLine', () => {
  it('EDGE-17 to AGG-03: the plates and the stored cables of the server route', () => {
    const line = routeLine(indexOf(), agg03Route())
    expect(names(line.steps)).toEqual([
      'EDGE-17',
      'PANEL-A',
      'HDF-01',
      'HDF-02',
      'AGG-03',
    ])
    expect(cableIds(line.steps)).toEqual(['A01', 'A02', 'A03', 'A04'])
    expect(line.cables).toBe(4)
    const ps = plates(line.steps)
    expect(ps[0].here).toBe(true)
    expect(ps[0].jacks[0]).toMatchObject({
      endpointId: 'EDGE-17:p1',
      selected: true,
    })
    expect(ps[4].destination).toBe('aggregation')
    expect(ps.slice(0, 4).some((p) => p.destination)).toBe(false)
    expect(ps[1].jacks.map((j) => j.endpointId)).toEqual([
      'PANEL-A:1:f',
      'PANEL-A:1:r',
    ])
  })

  it('draws the route it is given, not the stored topology', () => {
    const missing = indexOf((s) => ({
      ...s,
      links: s.links.filter((l) => l.id !== 'A02'),
    }))
    expect(cableIds(routeLine(missing, agg03Route()).steps)).toEqual([
      'A01',
      'A02',
      'A03',
      'A04',
    ])
  })

  it('marks plates and cables that are not installed as proposed', () => {
    const installed = {
      equipment: new Set(['EDGE-17', 'PANEL-A', 'HDF-01', 'HDF-02']),
      links: new Set(['A01', 'A02', 'A03']),
    }
    const { steps } = routeLine(indexOf(), agg03Route(), installed)
    expect(plates(steps).map((p) => p.proposed)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])
    expect(
      steps.flatMap((s) => (s.kind === 'cable' ? [s.proposed] : [])),
    ).toEqual([false, false, false, true])
  })

  it('a route without a destination role ends on a plain plate', () => {
    const route = { ...agg03Route(), destinationRole: undefined }
    const last = plates(routeLine(indexOf(), route).steps).at(-1)
    expect(last?.destination).toBeUndefined()
  })
})

describe('nodeFrames', () => {
  const frames = (items: ReturnType<typeof nodeFrames>) =>
    items.map((i) => (isFrame(i) ? names(i.steps).join('+') : i.linkId))

  it('splits the route where the node changes, with the cables between', () => {
    const index = indexOf()
    const items = nodeFrames(index, routeLine(index, agg03Route()).steps)
    expect(frames(items)).toEqual([
      'EDGE-17+PANEL-A',
      'A02',
      'HDF-01',
      'A03',
      'HDF-02+AGG-03',
    ])
    const [f1, , f2, , f3] = items as Frame[]
    expect(f1).toMatchObject({ siteId: 'site-main', nodeId: 'node-a' })
    expect(f1.place).toEqual(['Main Campus', 'Building A'])
    // the cable inside a node stays in its frame
    expect(f1.steps.map((s) => s.kind)).toEqual(['plate', 'cable', 'plate'])
    expect(cableIds(f3.steps)).toEqual(['A04'])
    expect(f2.place).toEqual(['Main Campus', 'North Sub-main'])
  })

  it('plates with no node in two sites get a frame each', () => {
    const base = indexOf()
    const index = {
      ...base,
      places: new Map([
        ...base.places,
        ['EDGE-22', { siteId: 'site-x' }],
        ['AGG-03', { siteId: 'site-y' }],
      ]),
    }
    const plate = plates(routeLine(base, agg03Route()).steps)[0]
    const items = nodeFrames(index, [
      { ...plate, equipmentId: 'EDGE-22' },
      { kind: 'cable', linkId: 'X', proposed: false },
      { ...plate, equipmentId: 'AGG-03' },
    ])
    expect(items.map((i) => (isFrame(i) ? i.siteId : i.linkId))).toEqual([
      'site-x',
      'X',
      'site-y',
    ])
  })

  it('a cable between two sites stands between frames too', () => {
    const index = indexOf()
    const base = plates(routeLine(index, agg03Route()).steps)[0]
    const items = nodeFrames(index, [
      { ...base, equipmentId: 'EDGE-22' },
      { kind: 'cable', linkId: 'X', proposed: false },
      { ...base, equipmentId: 'AGG-03' },
    ])
    expect(items.map((i) => (isFrame(i) ? 'frame' : 'cable'))).toEqual([
      'frame',
      'cable',
      'frame',
    ])
    expect((items[0] as Frame).siteId).toBe('site-dr')
    expect((items[2] as Frame).siteId).toBe('site-main')
  })

  it('keeps Hebrew site and node names whole, as separate entries', () => {
    const index = indexOf((s) => ({
      ...s,
      sites: s.sites.map((x) =>
        x.id === 'site-main' ? { ...x, name: 'קמפוס ראשי' } : x,
      ),
      nodes: s.nodes.map((n) =>
        n.id === 'node-a' ? { ...n, name: 'בניין א׳' } : n,
      ),
    }))
    const [first] = nodeFrames(
      index,
      routeLine(index, agg03Route()).steps,
    ) as Frame[]
    expect(first.place).toEqual(['קמפוס ראשי', 'בניין א׳'])
  })

  it('a long route alternating between nodes keeps every plate, cable and order', () => {
    const index = indexOf()
    const base = plates(routeLine(index, agg03Route()).steps)[0]
    const ids = ['EDGE-17', 'HDF-01', 'AGG-03', 'AGG-08', 'EDGE-17', 'BB-01']
    const steps: PathStep[] = []
    for (let i = 0; i < 30; i++) {
      if (i > 0) steps.push({ kind: 'cable', linkId: `L${i}`, proposed: false })
      steps.push({ ...base, equipmentId: ids[i % ids.length], name: `P${i}` })
    }
    const items = nodeFrames(index, steps)
    const flat = items.flatMap((i) => (isFrame(i) ? i.steps : [i]))
    expect(flat.map((s) => (s.kind === 'plate' ? s.name : s.kind))).toEqual(
      steps.map((s) => (s.kind === 'plate' ? s.name : s.kind)),
    )
    // frames and between-frame cables alternate
    items.forEach((it, i) => expect(isFrame(it)).toBe(i % 2 === 0))
  })

  it('puts a gap into the frame beside it', () => {
    const index = indexOf()
    const line = routeLine(index, agg03Route()).steps
    const withGap: PathStep[] = [line[0], { kind: 'gap' }]
    const [f] = nodeFrames(index, withGap) as Frame[]
    expect(f.steps.map((s) => s.kind)).toEqual(['plate', 'gap'])
  })

  it('is empty for no steps', () => {
    expect(nodeFrames(indexOf(), [])).toEqual([])
  })
})

describe('walkRows', () => {
  it('start, bridge… and end, with arrives and leaves and cable rows between', () => {
    const index = indexOf()
    const rows = walkRows(index, routeLine(index, agg03Route()).steps)
    expect(rows.map((r) => (r.kind === 'cable' ? r.linkId : r.note))).toEqual([
      'start',
      'A01',
      'bridge',
      'A02',
      'bridge',
      'A03',
      'bridge',
      'A04',
      'end',
    ])
    const steps = rows.filter((r) => r.kind === 'step')
    expect(steps.map((r) => r.n)).toEqual([1, 2, 3, 4, 5])
    expect(steps[0].arrives).toBeUndefined()
    expect(steps[0].leaves?.endpointId).toBe('EDGE-17:p1')
    expect(steps[1].arrives?.endpointId).toBe('PANEL-A:1:f')
    expect(steps[1].leaves?.endpointId).toBe('PANEL-A:1:r')
    expect(steps[4].arrives?.endpointId).toBe('AGG-03:p1')
    expect(steps[4].leaves).toBeUndefined()
    expect(steps[2].plate.name).toBe('HDF-01')
  })

  it('skips gaps and has no rows for no steps', () => {
    const index = indexOf()
    expect(walkRows(index, [])).toEqual([])
    const first = routeLine(index, agg03Route()).steps[0]
    const rows = walkRows(index, [first, { kind: 'gap' }])
    expect(rows).toHaveLength(1)
  })
})

describe('resultGroups and resultCounts', () => {
  it('AGG before BB, mismatches apart, each with its index in the result', () => {
    const r = edge17Result()
    const bb = r.routes.pop()!
    r.routes.unshift(bb) // BB first in the server order
    r.mismatches = [{ ...agg03Route(), destinationNetworkId: 'B' }]
    const g = resultGroups(r)
    expect(g.aggregation.map((i) => i.route.destinationEquipmentId)).toEqual([
      'AGG-03',
      'AGG-08',
    ])
    expect(g.backbone.map((i) => i.route.destinationEquipmentId)).toEqual([
      'BB-01',
    ])
    expect(g.backbone[0]).toMatchObject({ kind: 'route', index: 0 })
    expect(g.aggregation.map((i) => i.index)).toEqual([1, 2])
    expect(g.mismatches).toHaveLength(1)
    expect(g.mismatches[0]).toMatchObject({ kind: 'mismatch', index: 0 })
  })

  it('an empty result has three empty groups and zero counts', () => {
    const r = empty()
    expect(resultGroups(r)).toEqual({
      aggregation: [],
      backbone: [],
      mismatches: [],
    })
    expect(resultCounts(r)).toEqual({
      routes: 0,
      mismatches: 0,
      reachedPorts: 0,
      searchedPorts: 0,
    })
  })

  it('a result with only mismatches', () => {
    const r = {
      ...empty(),
      mismatches: [{ ...agg03Route(), destinationNetworkId: 'B' }],
      starts: [{ endpoint: 'EDGE-17:p1', outcome: 'mismatch' as const }],
    }
    const g = resultGroups(r)
    expect(g.aggregation).toEqual([])
    expect(g.backbone).toEqual([])
    expect(g.mismatches).toHaveLength(1)
    expect(resultCounts(r)).toEqual({
      routes: 0,
      mismatches: 1,
      reachedPorts: 0,
      searchedPorts: 1,
    })
  })

  it('counts a truncated result as it is: the routes kept, ports searched', () => {
    const r = {
      ...edge17Result(),
      truncated: true,
      starts: [
        { endpoint: 'EDGE-17:p1', outcome: 'reached' as const },
        { endpoint: 'EDGE-17:p2', outcome: 'reached' as const },
        { endpoint: 'EDGE-17:p3', outcome: 'reached' as const },
        { endpoint: 'EDGE-17:p4', outcome: 'no_destination' as const },
        { endpoint: 'EDGE-17:p5', outcome: 'mismatch' as const },
      ],
    }
    expect(resultCounts(r)).toEqual({
      routes: 3,
      mismatches: 0,
      reachedPorts: 3,
      searchedPorts: 5,
    })
  })
})

describe('portOutcomes', () => {
  it('one line per reached or mismatch port, then counts of the rest', () => {
    const index = indexOf()
    const r: TraceResult = {
      ...edge17Result(),
      mismatches: [
        { ...agg03Route(), start: 'EDGE-17:p4', destinationNetworkId: 'B' },
      ],
      starts: [
        { endpoint: 'EDGE-17:p1', outcome: 'reached' },
        { endpoint: 'EDGE-17:p2', outcome: 'reached' },
        { endpoint: 'EDGE-17:p3', outcome: 'reached' },
        { endpoint: 'EDGE-17:p4', outcome: 'mismatch' },
        { endpoint: 'EDGE-17:p5', outcome: 'no_destination' },
        { endpoint: 'EDGE-17:p6', outcome: 'no_destination' },
        { endpoint: 'EDGE-17:p7', outcome: 'disconnected' },
        { endpoint: 'EDGE-17:p8', outcome: 'unresolved_network' },
      ],
    }
    const out = portOutcomes(index, r)
    expect(out.lines).toHaveLength(4)
    expect(out.lines[0]).toMatchObject({
      endpointId: 'EDGE-17:p1',
      outcome: 'reached',
      equipmentName: 'EDGE-17',
      destinationName: 'AGG-03',
    })
    expect(out.lines[3]).toMatchObject({
      endpointId: 'EDGE-17:p4',
      outcome: 'mismatch',
      destinationName: 'AGG-03',
      destinationNetworkId: 'B',
    })
    expect(out.counts).toEqual({
      no_destination: 2,
      disconnected: 1,
      unresolved_network: 1,
    })
  })

  it('an empty result has no lines and zero counts', () => {
    expect(portOutcomes(indexOf(), empty())).toEqual({
      lines: [],
      counts: { no_destination: 0, disconnected: 0, unresolved_network: 0 },
    })
  })
})

describe('sharedEquipment', () => {
  const lines = (n: number) => {
    const index = indexOf()
    const r = edge17Result()
    return r.routes.slice(0, n).map((x) => routeLine(index, x).steps)
  }

  it('is empty for no line or one line', () => {
    expect(sharedEquipment([]).size).toBe(0)
    expect(sharedEquipment(lines(1)).size).toBe(0)
  })

  it('two routes through the same panel and HDFs: those, not the ends', () => {
    expect([...sharedEquipment(lines(2))].sort()).toEqual([
      'HDF-01',
      'HDF-02',
      'PANEL-A',
    ])
  })

  it('never counts a line first or last plate, even when it is shared', () => {
    const [a, b] = lines(2)
    // both end at the same switch: still not shared
    const ps = plates(b)
    const same = b.map((s) =>
      s === ps[4] ? { ...s, equipmentId: 'AGG-03' } : s,
    )
    expect(sharedEquipment([a, same]).has('AGG-03')).toBe(false)
    expect(sharedEquipment([a, b]).has('EDGE-17')).toBe(false)
  })

  it('needs the equipment on every line', () => {
    const [a, b, c] = lines(3)
    const noPanel = c.filter((s) => s.kind !== 'plate' || s.name !== 'HDF-01')
    expect(sharedEquipment([a, b, noPanel]).has('HDF-01')).toBe(false)
    expect(sharedEquipment([a, b, noPanel]).has('PANEL-A')).toBe(true)
  })
})
