import { describe, expect, it } from 'vitest'
import { pathLine, type PathPlate } from './pathLine'
import { indexOf, withLinks, withoutLink } from './testSnapshots'

type Step = ReturnType<typeof pathLine>['steps'][number]
const plates = (steps: Step[]) =>
  steps.filter((s): s is PathPlate => s.kind === 'plate')
const names = (steps: Step[]) => plates(steps).map((p) => p.name)
const shape = (steps: Step[]) =>
  steps.map((s) => (s.kind === 'plate' ? s.name : s.kind))
const cableIds = (steps: Step[]) =>
  steps.flatMap((s) => (s.kind === 'cable' ? [s.linkId] : []))

describe('pathLine from a switch port', () => {
  it('EDGE-17 port 1 reaches AGG-03 through PANEL-A, HDF-01 and HDF-02', () => {
    const line = pathLine(indexOf(), 'EDGE-17:p1')
    expect(names(line.steps)).toEqual([
      'EDGE-17',
      'PANEL-A',
      'HDF-01',
      'HDF-02',
      'AGG-03',
    ])
    expect(cableIds(line.steps)).toEqual(['A01', 'A02', 'A03', 'A04'])
    expect(line.cables).toBe(4)
    // plates and cables alternate, no gaps
    expect(line.steps.map((s) => s.kind)).toEqual([
      'plate',
      'cable',
      'plate',
      'cable',
      'plate',
      'cable',
      'plate',
      'cable',
      'plate',
    ])
    const [edge, panel, hdf1, hdf2, agg] = plates(line.steps)
    expect(edge.here).toBe(true)
    expect(edge.jacks).toHaveLength(1)
    expect(edge.jacks[0]).toMatchObject({
      endpointId: 'EDGE-17:p1',
      selected: true,
    })
    expect(edge.equipmentKind).toBe('switch')
    expect(edge.place.length).toBeGreaterThan(0)
    expect(panel.jacks.map((j) => j.endpointId)).toEqual([
      'PANEL-A:1:f',
      'PANEL-A:1:r',
    ])
    expect(panel.jacks.map((j) => j.side)).toEqual(['front', 'rear'])
    expect(hdf1.jacks.map((j) => j.endpointId)).toEqual([
      'HDF-01:3C/5:r',
      'HDF-01:3C/5:f',
    ])
    expect(hdf1.jacks[0].label).toBe('3C / 5')
    expect(hdf2.jacks).toHaveLength(2)
    expect(agg.jacks).toHaveLength(1)
    expect([panel, hdf1, hdf2, agg].some((p) => p.here)).toBe(false)
    expect(agg.destination).toBe('aggregation')
    expect(edge.destination).toBeUndefined()
    expect(panel.destination).toBeUndefined()
    const cable = line.steps.find((s) => s.kind === 'cable')
    expect(cable).toMatchObject({ linkId: 'A01', networkId: 'A' })
  })

  it('a backbone destination is reported', () => {
    const line = pathLine(indexOf(), 'EDGE-17:p3')
    expect(plates(line.steps).at(-1)?.destination).toBe('backbone')
  })

  it('a free switch port is one plate and a gap', () => {
    const line = pathLine(indexOf(), 'EDGE-17:p4')
    expect(shape(line.steps)).toEqual(['EDGE-17', 'gap'])
    expect(line.cables).toBe(0)
    expect(plates(line.steps)[0].here).toBe(true)
  })
})

describe('pathLine from a panel or HDF position', () => {
  // Rule: the selected side's cable leads left (it is the walk from that side,
  // reversed); the bridge peer's cable leads right. The jacks of the selected
  // plate are ordered the same way: the selected side first.
  it('from the HDF-01 rear (EDGE side) the plates keep the switch order', () => {
    const line = pathLine(indexOf(), 'HDF-01:3C/5:r')
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
    expect(ps.filter((p) => p.here).map((p) => p.name)).toEqual(['HDF-01'])
    const hdf = ps[2]
    expect(hdf.jacks.map((j) => [j.endpointId, j.selected])).toEqual([
      ['HDF-01:3C/5:r', true],
      ['HDF-01:3C/5:f', false],
    ])
    // PANEL-A's jacks read front then rear, as on the path from the switch
    expect(ps[1].jacks.map((j) => j.endpointId)).toEqual([
      'PANEL-A:1:f',
      'PANEL-A:1:r',
    ])
    expect(ps[4].destination).toBe('aggregation')
    expect(ps[0].destination).toBeUndefined()
  })

  it('from the HDF-01 front the line is exactly reversed', () => {
    const line = pathLine(indexOf(), 'HDF-01:3C/5:f')
    expect(names(line.steps)).toEqual([
      'AGG-03',
      'HDF-02',
      'HDF-01',
      'PANEL-A',
      'EDGE-17',
    ])
    expect(cableIds(line.steps)).toEqual(['A04', 'A03', 'A02', 'A01'])
    const ps = plates(line.steps)
    expect(ps[2].here).toBe(true)
    expect(ps[2].jacks.map((j) => [j.endpointId, j.selected])).toEqual([
      ['HDF-01:3C/5:f', true],
      ['HDF-01:3C/5:r', false],
    ])
    expect(ps[1].jacks.map((j) => j.endpointId)).toEqual([
      'HDF-02:2B/3:r',
      'HDF-02:2B/3:f',
    ])
    expect(ps[0].destination).toBe('aggregation')
  })

  it('a gap on the uncabled side', () => {
    const line = pathLine(indexOf(withoutLink('A03')), 'HDF-01:3C/5:r')
    expect(shape(line.steps)).toEqual([
      'EDGE-17',
      'cable',
      'PANEL-A',
      'cable',
      'HDF-01',
      'gap',
    ])
    expect(line.cables).toBe(2)
  })

  it('a gap on the selected side when only the other side is cabled', () => {
    const line = pathLine(indexOf(withoutLink('A02')), 'HDF-01:3C/5:r')
    expect(shape(line.steps)).toEqual([
      'gap',
      'HDF-01',
      'cable',
      'HDF-02',
      'cable',
      'AGG-03',
    ])
    expect(line.cables).toBe(2)
  })

  it('gap, plate, gap when neither side is cabled', () => {
    const line = pathLine(
      indexOf((s) => withoutLink('A03')(withoutLink('A02')(s))),
      'HDF-01:3C/5:r',
    )
    expect(shape(line.steps)).toEqual(['gap', 'HDF-01', 'gap'])
    expect(line.cables).toBe(0)
    expect(plates(line.steps)[0].jacks).toHaveLength(2)
  })

  it('a bridge missing in the stored data gives one jack and the line ends', () => {
    const line = pathLine(
      indexOf(withoutLink('PANEL-A:1:bridge')),
      'EDGE-17:p1',
    )
    expect(shape(line.steps)).toEqual(['EDGE-17', 'cable', 'PANEL-A'])
    expect(plates(line.steps)[1].jacks).toHaveLength(1)
    expect(line.cables).toBe(1)
  })

  it('a revisit ends the line without repeating a plate', () => {
    const loop = indexOf(
      withLinks(
        { id: 'L1', kind: 'cable', a: 'PANEL-A:10:f', b: 'PANEL-A:11:f' },
        { id: 'L2', kind: 'cable', a: 'PANEL-A:11:r', b: 'PANEL-A:10:r' },
      ),
    )
    const line = pathLine(loop, 'PANEL-A:10:f')
    const jackIds = plates(line.steps).flatMap((p) =>
      p.jacks.map((j) => j.endpointId),
    )
    expect(new Set(jackIds).size).toBe(jackIds.length)
    expect(plates(line.steps).filter((p) => p.here)).toHaveLength(1)
    expect(line.steps.at(-1)?.kind).not.toBe('gap')
  })
})

describe('pathLine in a plan', () => {
  const installed = {
    equipment: new Set(['EDGE-17', 'PANEL-A', 'HDF-01', 'HDF-02', 'AGG-03']),
    links: new Set(['A01', 'A02', 'A03', 'A04']),
  }

  it('is never proposed without installed', () => {
    const line = pathLine(indexOf(), 'EDGE-17:p1')
    expect(line.steps.every((s) => s.kind === 'gap' || !s.proposed)).toBe(true)
  })

  it('is not proposed when everything is installed', () => {
    const line = pathLine(indexOf(), 'EDGE-17:p1', installed)
    expect(line.steps.every((s) => s.kind === 'gap' || !s.proposed)).toBe(true)
  })

  it('marks a cable and an equipment that are not installed', () => {
    const line = pathLine(indexOf(), 'EDGE-17:p1', {
      equipment: new Set(['EDGE-17', 'PANEL-A', 'HDF-02', 'AGG-03']),
      links: new Set(['A01', 'A02', 'A04']),
    })
    const proposedPlates = plates(line.steps)
      .filter((p) => p.proposed)
      .map((p) => p.name)
    expect(proposedPlates).toEqual(['HDF-01'])
    const proposedCables = line.steps.flatMap((s) =>
      s.kind === 'cable' && s.proposed ? [s.linkId] : [],
    )
    expect(proposedCables).toEqual(['A03'])
  })
})
