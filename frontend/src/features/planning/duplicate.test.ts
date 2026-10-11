import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { physicalSnapshot } from '../physical/testFixture'
import {
  copyLayout,
  duplicateLines,
  freeUnits,
  nextNames,
  MAX_COPIES,
} from './duplicate'

// Rack A03 (12U): EDGE-17 at U8, PANEL-A at U11. Core 02: AGG-15 U6, AGG-08 U8.
const snap = (): Snapshot => {
  const s = physicalSnapshot()
  return {
    ...s,
    racks: [
      ...s.racks,
      { id: 'rack-new', nodeId: 'node-a', name: 'Rack New', units: 12 },
      { id: 'rack-tiny', nodeId: 'node-a', name: 'Rack Tiny', units: 4 },
    ],
  }
}

describe('BK-03a names', () => {
  it('counts the trailing number up and keeps its zero padding', () => {
    expect(nextNames('EDGE-18', 3, [])).toEqual([
      'EDGE-19',
      'EDGE-20',
      'EDGE-21',
    ])
    expect(nextNames('AGG-08', 2, [])).toEqual(['AGG-09', 'AGG-10'])
    expect(nextNames('AGG-99', 2, [])).toEqual(['AGG-100', 'AGG-101'])
  })
  it('skips names that are taken, ignoring case, like the server', () => {
    expect(nextNames('EDGE-18', 2, ['edge-19', 'Edge-21'])).toEqual([
      'EDGE-20',
      'EDGE-22',
    ])
  })
  it('gives a name without a trailing number -2, -3…', () => {
    expect(nextNames('Core', 3, ['core-3'])).toEqual([
      'Core-2',
      'Core-4',
      'Core-5',
    ])
  })
})

describe('BK-03a free units', () => {
  it('finds the next positions where the height fits, going up from a unit', () => {
    const s = snap()
    expect(freeUnits(s, 'rack-a03', 1, 3, 9)).toEqual({
      units: [9, 10, 12],
      shortfall: 0,
    })
    expect(freeUnits(s, 'rack-a03', 2, 2, 1)).toEqual({
      units: [1, 3],
      shortfall: 0,
    })
  })
  it('wraps to the bottom of the rack after the top, and below the starting unit last', () => {
    expect(freeUnits(snap(), 'rack-a03', 1, 5, 9)).toEqual({
      units: [9, 10, 12, 1, 2],
      shortfall: 0,
    })
  })
  it('reports the shortfall only when the rack is really full', () => {
    // 12 units, 2 taken: 10 free.
    expect(freeUnits(snap(), 'rack-a03', 1, 10, 9)).toMatchObject({
      shortfall: 0,
    })
    expect(freeUnits(snap(), 'rack-a03', 1, 11, 9)).toEqual({
      units: [9, 10, 12, 1, 2, 3, 4, 5, 6, 7],
      shortfall: 1,
    })
  })
})

describe('BK-03a duplicate', () => {
  it('lists N copies of a switch in the next free units, with its role, network and port count', () => {
    const s = snap()
    const lines = duplicateLines(s, 'EDGE-17', 3, 'rack-a03', 9)
    expect(lines.map((l) => [l.name, l.unit, l.problem])).toEqual([
      ['EDGE-18', 9, undefined],
      ['EDGE-19', 10, undefined],
      ['EDGE-20', 12, undefined],
    ])
    const ports = s.endpoints.filter((e) => e.equipmentId === 'EDGE-17').length
    expect(lines[0].command).toEqual({
      type: 'add_equipment',
      equipment: {
        name: 'EDGE-18',
        kind: 'switch',
        role: 'access',
        networkId: 'A',
        rackId: 'rack-a03',
        unit: 9,
        height: 1,
        portCount: ports,
      },
    })
  })
  it('copies a panel by its positions and an HDF by its rows and height', () => {
    const s = snap()
    const panel = duplicateLines(s, 'PANEL-A', 1, 'rack-new', 1)[0].command
    expect(panel).toMatchObject({
      type: 'add_equipment',
      equipment: {
        kind: 'panel',
        role: 'passive',
        portCount: 24,
        name: 'PANEL-A-2',
      },
    })
    expect(
      (panel as { equipment: { networkId?: string } }).equipment.networkId,
    ).toBeUndefined()
    const hdf = duplicateLines(s, 'HDF-01', 1, 'rack-new', 1)[0].command
    expect(hdf).toEqual({
      type: 'add_hdf',
      hdf: { name: 'HDF-03', rackId: 'rack-new', unit: 1, height: 3, rows: 4 },
    })
  })
  it('5 more like EDGE-17 in its own rack: U9, U10, U12, then U1 and U2 below it', () => {
    const lines = duplicateLines(snap(), 'EDGE-17', 5, 'rack-a03', 9)
    expect(lines.map((l) => [l.name, l.unit, l.problem])).toEqual([
      ['EDGE-18', 9, undefined],
      ['EDGE-19', 10, undefined],
      ['EDGE-20', 12, undefined],
      ['EDGE-21', 1, undefined],
      ['EDGE-23', 2, undefined],
    ])
  })
  it('marks the lines that find no free unit, in names, only when the rack is full', () => {
    const lines = duplicateLines(snap(), 'EDGE-17', 11, 'rack-a03', 9)
    expect(lines.filter((l) => l.problem).map((l) => l.problem)).toEqual([
      'Rack A03 has no free unit for EDGE-29',
    ])
  })
  it('names a copy of a switch that is too big for the server in the server’s words', () => {
    const s = snap()
    s.endpoints = [
      ...s.endpoints,
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `EDGE-17:extra${i}`,
        equipmentId: 'EDGE-17',
        label: `Port ${100 + i}`,
      })),
    ]
    expect(duplicateLines(s, 'EDGE-17', 1, 'rack-new', 1)[0].problem).toBe(
      'port count must be between 1 and 48',
    )
  })
  it('limits the count', () => {
    expect(MAX_COPIES).toBeGreaterThanOrEqual(24)
  })
})

describe('BK-04a copy rack layout', () => {
  it('places the same kinds at the same units with new names and no cables', () => {
    const s = snap()
    const result = copyLayout(s, 'rack-a03', 'rack-new')
    expect(result.problem).toBeUndefined()
    expect(
      result.lines.map((l) => [l.unit, l.sourceName, l.name, l.problem]),
    ).toEqual([
      [8, 'EDGE-17', 'EDGE-18', undefined],
      [11, 'PANEL-A', 'PANEL-A-2', undefined],
    ])
    expect(result.lines.every((l) => l.command?.type === 'add_equipment')).toBe(
      true,
    )
  })
  it('refuses a target that is not empty, and the same rack', () => {
    expect(copyLayout(snap(), 'rack-a03', 'rack-core-02').problem).toBe(
      'Rack Core 02 is not empty',
    )
    expect(copyLayout(snap(), 'rack-a03', 'rack-a03').problem).toBe(
      'Choose another rack to copy into',
    )
  })
  it('refuses a source with nothing in it', () => {
    expect(copyLayout(snap(), 'rack-new', 'rack-tiny').problem).toBe(
      'Rack New has no equipment to copy',
    )
  })
  it('marks what does not fit a smaller rack, in the server’s words', () => {
    const result = copyLayout(snap(), 'rack-a03', 'rack-tiny')
    expect(result.lines.map((l) => l.problem)).toEqual([
      'Rack Tiny has units 1–4; 1 unit from U8 does not fit',
      'Rack Tiny has units 1–4; 1 unit from U11 does not fit',
    ])
  })
  it('gives each copy a different new name', () => {
    const s = snap()
    const result = copyLayout(s, 'rack-core-02', 'rack-new')
    expect(result.lines.map((l) => l.name)).toEqual(['AGG-16', 'AGG-09'])
  })
})

describe('step 11: copies carry no details', () => {
  it('Duplicate and Copy rack layout copy no detail field, the serial number least of all', () => {
    const s = snap()
    s.equipment = s.equipment.map((e) =>
      e.id === 'EDGE-17'
        ? {
            ...e,
            manufacturer: 'Acme',
            serialNumber: 'SN-0001',
            ipAddress: '10.0.0.1',
            status: 'active' as const,
            description: 'core',
          }
        : e,
    )
    s.endpoints = s.endpoints.map((p) =>
      p.equipmentId === 'EDGE-17'
        ? { ...p, portType: 'fiber' as const, state: 'faulty' as const }
        : p,
    )
    const commands = [
      ...duplicateLines(s, 'EDGE-17', 1, 'rack-a03', 9).map((l) => l.command),
      ...copyLayout(s, 'rack-a03', 'rack-new').lines.map((l) => l.command),
    ]
    expect(commands.length).toBeGreaterThan(1)
    for (const c of commands) {
      expect(JSON.stringify(c)).not.toMatch(
        /SN-0001|Acme|10\.0\.0\.1|serialNumber|manufacturer|details|portType|"state"/,
      )
    }
  })
})
