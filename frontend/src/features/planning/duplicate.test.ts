import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../shared/types'
import { physicalSnapshot, withGroupedSwitch } from '../physical/testFixture'
import {
  copyLayout,
  copySummary,
  duplicateLines,
  sourceGroups,
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
      ...Array.from({ length: 80 }, (_, i) => ({
        id: `EDGE-17:extra${i}`,
        equipmentId: 'EDGE-17',
        label: `Port ${100 + i}`,
      })),
    ]
    expect(duplicateLines(s, 'EDGE-17', 1, 'rack-new', 1)[0].problem).toBe(
      'port count must be between 1 and 96',
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

describe('PG-05 copies keep the port groups', () => {
  const grouped = () => {
    const s = withGroupedSwitch(snap(), 'SW-G', 'rack-a03', 3, [
      {
        count: 3,
        prefix: 'Gi1/0/',
        portType: 'copper',
        connector: 'RJ45',
        speed: '1G',
      },
      {
        count: 2,
        prefix: 'Te1/1/',
        portType: 'fiber',
        connector: 'SFP+',
        speed: '10G',
      },
    ])
    s.endpoints = s.endpoints.map((p) =>
      p.id === 'SW-G:p1'
        ? { ...p, state: 'faulty' as const, description: 'the first one' }
        : p,
    )
    s.equipment = s.equipment.map((e) =>
      e.id === 'SW-G'
        ? {
            ...e,
            serialNumber: 'SN-77',
            ipAddress: '10.0.0.77',
            status: 'active' as const,
            description: 'core',
          }
        : e,
    )
    return s
  }

  it('Duplicate copies the groups: labels in order, portType, connector and speed', () => {
    const [line] = duplicateLines(grouped(), 'SW-G', 1, 'rack-new', 1)
    expect(line.command).toEqual({
      type: 'add_equipment',
      equipment: {
        name: 'SW-G-2',
        kind: 'switch',
        role: 'access',
        networkId: 'A',
        rackId: 'rack-new',
        unit: 1,
        height: 1,
        portGroups: [
          {
            labels: ['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3'],
            details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
          },
          {
            labels: ['Te1/1/1', 'Te1/1/2'],
            details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
          },
        ],
      },
    })
  })

  it('never copies a serial number, IP address, status, description, state or notes', () => {
    const json = JSON.stringify(
      duplicateLines(grouped(), 'SW-G', 2, 'rack-new', 1).map((l) => l.command),
    )
    expect(json).not.toMatch(
      /SN-77|10\.0\.0\.77|serialNumber|ipAddress|status|description|faulty|state|notes|the first one|core/,
    )
  })

  it('Copy rack layout copies them too', () => {
    const s = grouped()
    s.equipment = s.equipment.map((e) =>
      e.id === 'SW-G' ? { ...e, rackId: 'rack-core-03', unit: 3 } : e,
    )
    const { lines } = copyLayout(s, 'rack-core-03', 'rack-new')
    const command = lines.find((l) => l.sourceName === 'SW-G')!.command as {
      equipment: { portGroups: unknown[]; portCount?: number }
    }
    expect(command.equipment.portGroups).toHaveLength(2)
    expect(command.equipment.portCount).toBeUndefined()
  })

  it('a switch saved before groups is still copied by its port count', () => {
    const [line] = duplicateLines(snap(), 'EDGE-17', 1, 'rack-new', 1)
    expect(line.command).toMatchObject({ equipment: { portCount: 24 } })
    expect(
      (line.command as { equipment: object }).equipment,
    ).not.toHaveProperty('portGroups')
  })

  it('a copy over 96 ports is blocked in the server’s words', () => {
    const big = withGroupedSwitch(snap(), 'SW-B', 'rack-a03', 3, [
      { count: 97, prefix: 'E' },
    ])
    expect(duplicateLines(big, 'SW-B', 1, 'rack-new', 1)[0].problem).toBe(
      'port count must be between 1 and 96',
    )
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

describe('P2-2 Duplicate overrides', () => {
  const grouped = () =>
    withGroupedSwitch(snap(), 'SW-G', 'rack-a03', 3, [
      {
        count: 24,
        prefix: 'Gi1/0/',
        portType: 'copper',
        connector: 'RJ45',
        speed: '1G',
      },
      {
        count: 4,
        prefix: 'Te1/1/',
        portType: 'fiber',
        connector: 'SFP+',
        speed: '10G',
      },
    ])
  const equipmentOf = (l: { command?: unknown }) =>
    (l.command as { equipment: Record<string, unknown> }).equipment

  it('uses a given name for a copy; a blank keeps the counted-up one', () => {
    const lines = duplicateLines(snap(), 'EDGE-17', 3, 'rack-a03', 9, {
      names: ['  CORE-X ', '   ', undefined as unknown as string],
    })
    expect(lines.map((l) => l.name)).toEqual(['CORE-X', 'EDGE-19', 'EDGE-20'])
    expect(equipmentOf(lines[0]).name).toBe('CORE-X')
    expect(equipmentOf(lines[1]).name).toBe('EDGE-19')
  })

  it('refuses a name over 100 characters', () => {
    const [line] = duplicateLines(snap(), 'EDGE-17', 1, 'rack-a03', 9, {
      names: ['x'.repeat(101)],
    })
    expect(line.problem).toBe('Names are at most 100 characters')
    expect(line.command).toBeUndefined()
    expect(
      duplicateLines(snap(), 'EDGE-17', 1, 'rack-a03', 9, {
        names: ['x'.repeat(100)],
      })[0].problem,
    ).toBeUndefined()
  })

  it('refuses the name of other equipment, ignoring case', () => {
    const [line] = duplicateLines(snap(), 'EDGE-17', 1, 'rack-a03', 9, {
      names: ['panel-a'],
    })
    expect(line.problem).toBe('panel-a is already the name of other equipment')
    expect(line.command).toBeUndefined()
  })

  it('refuses a name two copies share, on both lines', () => {
    const lines = duplicateLines(snap(), 'EDGE-17', 2, 'rack-a03', 9, {
      names: ['New-1', 'new-1'],
    })
    expect(lines.map((l) => l.problem)).toEqual([
      'New-1 is used twice',
      'new-1 is used twice',
    ])
    expect(lines.every((l) => !l.command)).toBe(true)
  })

  it('checks the length before the other problems', () => {
    const name = 'PANEL-A'.padEnd(101, 'x')
    const [line] = duplicateLines(snap(), 'EDGE-17', 1, 'rack-a03', 9, {
      names: [name],
    })
    expect(line.problem).toBe('Names are at most 100 characters')
  })

  it('keeps the no-free-unit problem on a line with no unit', () => {
    const lines = duplicateLines(snap(), 'EDGE-17', 11, 'rack-a03', 9, {
      names: Array(11).fill('') as string[],
    })
    expect(lines.at(-1)?.problem).toBe('Rack A03 has no free unit for EDGE-29')
  })

  it('sends networkId only for a switch; a panel ignores it', () => {
    const s = snap()
    const [sw] = duplicateLines(s, 'EDGE-17', 1, 'rack-a03', 9, {
      networkId: 'B',
    })
    expect(equipmentOf(sw).networkId).toBe('B')
    const [blank] = duplicateLines(s, 'EDGE-17', 1, 'rack-a03', 9, {
      networkId: '',
    })
    expect(equipmentOf(blank).networkId).toBe('A')
    const [panel] = duplicateLines(s, 'PANEL-A', 1, 'rack-new', 1, {
      networkId: 'B',
    })
    expect(equipmentOf(panel).networkId).toBeUndefined()
  })

  it('replaces each group’s type, connector and speed; "" leaves a field out', () => {
    const [line] = duplicateLines(grouped(), 'SW-G', 1, 'rack-new', 1, {
      groups: [
        { portType: 'fiber', connector: 'LC', speed: '10G' },
        { portType: '', connector: '', speed: '25G' },
      ],
    })
    const groups = equipmentOf(line).portGroups as {
      labels: string[]
      details?: object
    }[]
    expect(groups[0].labels).toHaveLength(24)
    expect(groups[0].labels[0]).toBe('Gi1/0/1')
    expect(groups[0].details).toEqual({
      portType: 'fiber',
      connector: 'LC',
      speed: '10G',
    })
    expect(groups[1].labels[3]).toBe('Te1/1/4')
    expect(groups[1].details).toEqual({ speed: '25G' })
  })

  it('sends no details for a group whose fields are all cleared', () => {
    const [line] = duplicateLines(grouped(), 'SW-G', 1, 'rack-new', 1, {
      groups: [
        { portType: '', connector: '', speed: '' },
        { portType: 'fiber', connector: 'SFP+', speed: '10G' },
      ],
    })
    const groups = equipmentOf(line).portGroups as { details?: object }[]
    expect(groups[0]).not.toHaveProperty('details')
  })

  it('a switch without groups still sends portCount and ignores groups', () => {
    const [line] = duplicateLines(snap(), 'EDGE-17', 1, 'rack-a03', 9, {
      groups: [{ portType: 'fiber', connector: 'LC', speed: '10G' }],
    })
    expect(equipmentOf(line).portGroups).toBeUndefined()
    expect(equipmentOf(line).portCount).toBeGreaterThan(0)
  })

  it('without overrides the lines are the same as before', () => {
    const s = grouped()
    expect(duplicateLines(s, 'SW-G', 2, 'rack-new', 1, {})).toEqual(
      duplicateLines(s, 'SW-G', 2, 'rack-new', 1),
    )
  })

  it('sourceGroups: a caption per group, the first and last label and the count', () => {
    expect(sourceGroups(grouped(), 'SW-G')).toEqual([
      {
        caption: 'Gi1/0/1–Gi1/0/24 (24)',
        first: 'Gi1/0/1',
        last: 'Gi1/0/24',
        count: 24,
        details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
      },
      {
        caption: 'Te1/1/1–Te1/1/4 (4)',
        first: 'Te1/1/1',
        last: 'Te1/1/4',
        count: 4,
        details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
      },
    ])
  })

  it('sourceGroups: a group of one is just its label, unset fields are ""', () => {
    const s = withGroupedSwitch(snap(), 'SW-1', 'rack-a03', 3, [
      { count: 1, prefix: 'Mgmt' },
    ])
    expect(sourceGroups(s, 'SW-1')).toEqual([
      {
        caption: 'Mgmt1',
        first: 'Mgmt1',
        last: 'Mgmt1',
        count: 1,
        details: { portType: '', connector: '', speed: '' },
      },
    ])
  })

  it('copySummary keeps a label that contains "–"', () => {
    const s = withGroupedSwitch(snap(), 'SW-D', 'rack-a03', 3, [
      { count: 2, prefix: 'A–' },
    ])
    expect(copySummary(sourceGroups(s, 'SW-D'))).toBe(
      'Each copy: 2 ports · A–1 … A–2',
    )
  })

  it('sourceGroups is empty for a switch without groups, a panel and an HDF', () => {
    const s = snap()
    expect(sourceGroups(s, 'EDGE-17')).toEqual([])
    expect(sourceGroups(s, 'PANEL-A')).toEqual([])
    expect(sourceGroups(s, 'HDF-01')).toEqual([])
  })

  it('copySummary: "Each copy: N ports · first … last type connector speed, …"', () => {
    expect(copySummary(sourceGroups(grouped(), 'SW-G'))).toBe(
      'Each copy: 28 ports · Gi1/0/1 … Gi1/0/24 copper RJ45 1G, Te1/1/1 … Te1/1/4 fiber SFP+ 10G',
    )
  })

  it('copySummary leaves out unset fields, names a single port alone and is "" for no groups', () => {
    expect(
      copySummary([
        {
          first: 'Gi1/0/1',
          last: 'Gi1/0/24',
          count: 24,
          details: { portType: '', connector: '', speed: '1G' },
        },
        {
          first: 'Mgmt1',
          last: 'Mgmt1',
          count: 1,
          details: { portType: '', connector: '', speed: '' },
        },
      ]),
    ).toBe('Each copy: 25 ports · Gi1/0/1 … Gi1/0/24 1G, Mgmt1')
    expect(copySummary([])).toBe('')
  })
})
