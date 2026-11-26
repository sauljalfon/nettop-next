import { describe, expect, it } from 'vitest'
import type { Endpoint, Equipment, SwitchModel } from '../../shared/types'
import { piecesText } from '../../shared/textPieces'
import {
  addSwitchCommands,
  defaultNetwork,
  modelFromRows,
  modelLabels,
  modelPortCount,
  modelRows,
  renameTargets,
  seriesNames,
  setModelPlan,
  stackUnits,
  suggestName,
} from './model'

const c9300: SwitchModel = {
  id: 'model-1',
  name: 'C9300-48P',
  manufacturer: 'Cisco',
  height: 1,
  portGroups: [
    {
      count: 48,
      names: 'Gi1/0/{n}',
      start: 1,
      details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
    },
    {
      count: 4,
      names: 'Te1/1/{n}',
      start: 1,
      details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
    },
  ],
}

const edge: Equipment = {
  id: 'sw-1',
  name: 'EDGE-31',
  kind: 'switch',
  role: 'access',
  rackId: 'rack-a03',
  unit: 5,
  height: 1,
}

/** A switch's ports "Port n", with positions and the given group sizes in order. */
function ports(sizes: number[], positions = true): Endpoint[] {
  const out: Endpoint[] = []
  let n = 0
  sizes.forEach((size, g) => {
    for (let i = 0; i < size; i++) {
      n++
      out.push({
        id: `sw-1:p${n}`,
        equipmentId: 'sw-1',
        label: `Port ${n}`,
        ...(positions && { position: n, portGroup: g + 1 }),
      })
    }
  })
  return out
}

const texts = (lines: { pieces: Parameters<typeof piecesText>[0] }[]) =>
  lines.map((l) => piecesText(l.pieces))

describe('model rows', () => {
  it('counts and names the ports in order, from each group start', () => {
    expect(modelPortCount(c9300)).toBe(52)
    const labels = modelLabels(c9300)
    expect(labels).toHaveLength(52)
    expect(labels[0]).toBe('Gi1/0/1')
    expect(labels[47]).toBe('Gi1/0/48')
    expect(labels[48]).toBe('Te1/1/1')
    expect(labels[51]).toBe('Te1/1/4')
    expect(
      modelLabels({
        ...c9300,
        portGroups: [{ count: 2, names: 'Eth{n}', start: 0 }],
      }),
    ).toEqual(['Eth0', 'Eth1'])
  })

  it('round trips through the editor rows', () => {
    const rows = modelRows(c9300)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      count: '48',
      names: 'Gi1/0/{n}',
      start: '1',
      portType: 'copper',
      connector: 'RJ45',
      speed: '1G',
    })
    const back = modelFromRows(c9300.name, 'Cisco', 1, rows)
    expect(back).toEqual({
      input: {
        name: 'C9300-48P',
        manufacturer: 'Cisco',
        height: 1,
        portGroups: c9300.portGroups,
      },
    })
  })

  it('says in words what is wrong', () => {
    const rows = modelRows(c9300)
    expect(modelFromRows('  ', '', 1, rows)).toHaveProperty('error')
    expect(modelFromRows('X', '', 0, rows)).toHaveProperty('error')
    expect(modelFromRows('X', '', 11, rows)).toHaveProperty('error')
    expect(modelFromRows('x'.repeat(101), '', 1, rows)).toHaveProperty('error')
    expect(modelFromRows('X', 'm'.repeat(201), 1, rows)).toHaveProperty('error')
    const bad = [{ ...rows[0], names: 'Gi1/0/' }]
    expect(modelFromRows('X', '', 1, bad)).toEqual({
      error: 'Port group 1: Names must contain {n} once.',
    })
    expect(modelFromRows('X', '', 1, [])).toHaveProperty('error')
    expect(
      modelFromRows('X', '', 1, [{ ...rows[0], start: 'x' }]),
    ).toHaveProperty('error')
  })

  it('trims the name and the manufacturer', () => {
    const r = modelFromRows(' New ', ' Acme ', '2', modelRows(c9300))
    expect(r).toMatchObject({
      input: { name: 'New', manufacturer: 'Acme', height: 2 },
    })
  })
})

describe('addSwitchCommands', () => {
  it('is one add_equipment per name with the ports, height and details of the model', () => {
    const cmds = addSwitchCommands(
      c9300,
      { rackId: 'rack-a03', units: [10, 9] },
      ['EDGE-33', 'EDGE-34'],
      'access',
      'net-a',
    )
    expect(cmds).toHaveLength(2)
    expect(cmds[1]).toEqual({
      type: 'add_equipment',
      equipment: {
        name: 'EDGE-34',
        kind: 'switch',
        role: 'access',
        networkId: 'net-a',
        rackId: 'rack-a03',
        unit: 9,
        height: 1,
        portGroups: c9300.portGroups,
        details: { manufacturer: 'Cisco', model: 'C9300-48P' },
      },
    })
  })
})

describe('stackUnits', () => {
  it('stacks down from the top unit, giving each device its lowest unit', () => {
    expect(stackUnits(new Set(), 24, 10, 1, 3)).toEqual([10, 9, 8])
    expect(stackUnits(new Set(), 24, 10, 2, 3)).toEqual([9, 7, 5])
  })
  it('is null when a taken unit is in the way or the rack ends', () => {
    expect(stackUnits(new Set([8]), 24, 10, 1, 3)).toBeNull()
    expect(stackUnits(new Set([8]), 24, 10, 1, 2)).toEqual([10, 9])
    expect(stackUnits(new Set([10]), 24, 10, 1, 1)).toBeNull()
    expect(stackUnits(new Set(), 24, 25, 1, 1)).toBeNull()
  })
  it('stops at U1', () => {
    expect(stackUnits(new Set(), 24, 1, 1, 1)).toEqual([1])
    expect(stackUnits(new Set(), 24, 1, 1, 2)).toBeNull()
    expect(stackUnits(new Set(), 24, 2, 2, 1)).toEqual([1])
    expect(stackUnits(new Set(), 24, 2, 3, 1)).toBeNull()
  })
})

describe('names', () => {
  it('suggests the next number, keeping prefix and padding', () => {
    expect(suggestName(['EDGE-31', 'EDGE-32'])).toBe('EDGE-33')
    expect(suggestName(['EDGE-9', 'EDGE-2'])).toBe('EDGE-10')
    expect(suggestName(['AGG-9'])).toBe('AGG-10')
    expect(suggestName(['EDGE-09'])).toBe('EDGE-10')
    expect(suggestName(['EDGE-007'])).toBe('EDGE-008')
    expect(suggestName(['EDGE-99'])).toBe('EDGE-100')
    expect(suggestName(['מתג-4', 'מתג-12'])).toBe('מתג-13')
    expect(suggestName([])).toBe('')
    expect(suggestName(['Core', 'Edge'])).toBe('')
  })
  it('makes a series', () => {
    expect(seriesNames('EDGE-33', 3)).toEqual(['EDGE-33', 'EDGE-34', 'EDGE-35'])
    expect(seriesNames('EDGE-08', 3)).toEqual(['EDGE-08', 'EDGE-09', 'EDGE-10'])
    expect(seriesNames('X', 3)).toEqual(['X', 'X 2', 'X 3'])
    expect(seriesNames('מתג', 2)).toEqual(['מתג', 'מתג 2'])
    expect(seriesNames('EDGE-33', 1)).toEqual(['EDGE-33'])
  })
})

describe('defaultNetwork', () => {
  it('is the rack network when every switch there is on one', () => {
    expect(defaultNetwork(['net-a', 'net-a'], 'net-b')).toEqual({
      id: 'net-a',
      why: 'rack',
    })
  })
  it('is the header network when the rack has none or several', () => {
    expect(defaultNetwork([], 'net-b')).toEqual({ id: 'net-b', why: 'header' })
    expect(defaultNetwork(['net-a', 'net-c'], 'net-b')).toEqual({
      id: 'net-b',
      why: 'header',
    })
  })
  it('is nothing otherwise', () => {
    expect(defaultNetwork([])).toEqual({})
    expect(defaultNetwork(['net-a', 'net-c'])).toEqual({})
  })
})

describe('renameTargets', () => {
  const sw = (id: string, model?: string): Equipment => ({
    ...edge,
    id,
    name: id,
    model,
  })
  it('matches the old name trimmed and ignoring case, switches only', () => {
    const list = [
      sw('a', ' c9300-48p '),
      sw('b', '9300'),
      sw('c', 'C9300-48P'),
      sw('d'),
      { ...sw('e', 'C9300-48P'), kind: 'panel' as const },
    ]
    expect(renameTargets(list, 'C9300-48P').map((e) => e.id)).toEqual([
      'a',
      'c',
    ])
    expect(renameTargets(list, '  ').map((e) => e.id)).toEqual([])
  })
})

describe('setModelPlan', () => {
  it('on a plain 52-port switch sets the details, names, fields and the two groups', () => {
    const r = setModelPlan(edge, ports([52]), c9300)
    if ('error' in r) throw new Error(r.why)
    expect(r.noPositions).toBe(false)
    const equipment = r.fixes.filter((f) => f.kind === 'equipment')
    expect(equipment).toEqual([
      {
        kind: 'equipment',
        id: 'sw-1',
        details: { manufacturer: 'Cisco', model: 'C9300-48P' },
      },
    ])
    const p1 = r.fixes.find((f) => f.id === 'sw-1:p1')
    expect(p1).toEqual({
      kind: 'endpoint',
      id: 'sw-1:p1',
      name: 'Gi1/0/1',
      details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
    })
    const p49 = r.fixes.find((f) => f.id === 'sw-1:p49')
    expect(p49).toEqual({
      kind: 'endpoint',
      id: 'sw-1:p49',
      name: 'Te1/1/1',
      portGroup: 2,
      details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
    })
    // Ports already in group 1 are not sent a group again.
    expect(r.fixes.filter((f) => 'portGroup' in f)).toHaveLength(4)
    expect(r.fixes).toHaveLength(1 + 52)
    const names = r.filled.filter((l) => l.section === 'names')
    expect(names).toHaveLength(52)
    expect(texts(names)[0]).toBe('Port 1 → Gi1/0/1')
    expect(names[0].pieces).toEqual([
      { name: 'Port 1' },
      { text: ' → ' },
      { name: 'Gi1/0/1' },
    ])
    expect(r.kept).toEqual([])
    const details = r.filled.filter((l) => l.section === 'details')
    expect(texts(details)).toEqual([
      'Manufacturer: empty → Cisco',
      'Model: empty → C9300-48P',
    ])
    const fields = r.filled.filter((l) => l.section === 'fields')
    expect(texts(fields)).toEqual([
      'Ports 1–48: copper · RJ45 · 1G',
      'Ports 49–52: fiber · SFP+ · 10G',
    ])
    expect(fields.reduce((n, l) => n + l.count, 0)).toBe(52 * 3)
    expect(texts(r.filled.filter((l) => l.section === 'groups'))).toEqual([
      'Ports 49–52: group 2',
    ])
  })

  it('keeps a hand-typed speed and a hand-typed name, and lists them', () => {
    const list = ports([52])
    list[0] = { ...list[0], speed: '100M' }
    list[1] = { ...list[1], label: 'Gi0/1' }
    const r = setModelPlan(edge, list, c9300)
    if ('error' in r) throw new Error(r.why)
    expect(texts(r.kept)).toEqual([
      'Port 1 speed is 100M; the model says 1G. Kept.',
      'Gi0/1 is not renamed; the model says Gi1/0/2. Kept.',
    ])
    expect(r.kept[0].pieces[0]).toEqual({ name: 'Port 1' })
    const p1 = r.fixes.find((f) => f.id === 'sw-1:p1')
    expect(p1?.details).toEqual({ portType: 'copper', connector: 'RJ45' })
    const p2 = r.fixes.find((f) => f.id === 'sw-1:p2')
    expect(p2?.name).toBeUndefined()
    expect(p2?.details).toEqual({
      portType: 'copper',
      connector: 'RJ45',
      speed: '1G',
    })
    // A value equal to the model's, ignoring case, is not a difference.
    const same = ports([52])
    same[0] = { ...same[0], speed: '1g' }
    const s = setModelPlan(edge, same, c9300)
    if ('error' in s) throw new Error(s.why)
    expect(s.kept).toEqual([])
  })

  it('sets a Model detail of 9300 to the model name and shows the change', () => {
    const r = setModelPlan(
      { ...edge, manufacturer: 'Cisco', model: '9300' },
      ports([52]),
      c9300,
    )
    if ('error' in r) throw new Error(r.why)
    expect(r.fixes[0]).toEqual({
      kind: 'equipment',
      id: 'sw-1',
      details: { model: 'C9300-48P' },
    })
    expect(texts(r.filled.filter((l) => l.section === 'details'))).toEqual([
      'Model: 9300 → C9300-48P',
    ])
  })

  it('sends no fix for a switch that already matches', () => {
    const done = ports([48, 4]).map((p, i): Endpoint => {
      const label = modelLabels(c9300)[i]
      return {
        ...p,
        label,
        ...(i < 48
          ? { portType: 'copper', connector: 'RJ45', speed: '1G' }
          : { portType: 'fiber', connector: 'SFP+', speed: '10G' }),
      }
    })
    const r = setModelPlan(
      { ...edge, manufacturer: 'Cisco', model: 'C9300-48P' },
      done,
      c9300,
    )
    expect(r).toMatchObject({ fixes: [], filled: [], kept: [] })
  })

  it('a switch already in 48 + 4 groups gets no portGroup fixes', () => {
    const r = setModelPlan(edge, ports([48, 4]), c9300)
    if ('error' in r) throw new Error(r.why)
    expect(r.fixes.some((f) => 'portGroup' in f)).toBe(false)
    expect(r.filled.some((l) => l.section === 'groups')).toBe(false)
    expect(r.fixes.filter((f) => f.kind === 'endpoint')).toHaveLength(52)
  })

  it('refuses a switch of 24 + 24 + 4: nothing is written by position onto the wrong ports', () => {
    const r = setModelPlan(edge, ports([24, 24, 4]), c9300)
    expect(r).toEqual({
      error: 'groups',
      why: "its groups are 48 + 4; this switch's are 24 + 24 + 4",
    })
  })

  it('refuses a model with another number of ports', () => {
    const r = setModelPlan(edge, ports([24]), c9300)
    expect(r).toMatchObject({ error: 'ports' })
    expect('why' in r && r.why).toContain('24')
    expect('why' in r && r.why).toContain('52')
  })

  it('goes by the face order and sends no group or rename for ports without positions', () => {
    // Saved before 2026-10-11: no position, no group; order is the number in the label.
    const list = ports([52], false).reverse()
    const r = setModelPlan(edge, list, c9300)
    if ('error' in r) throw new Error(r.why)
    expect(r.noPositions).toBe(true)
    expect(r.fixes.some((f) => 'portGroup' in f)).toBe(false)
    expect(r.filled.some((l) => l.section === 'groups')).toBe(false)
    // The server refuses renaming a port without a position, so none is sent.
    expect(r.fixes.some((f) => 'name' in f)).toBe(false)
    expect(r.filled.some((l) => l.section === 'names')).toBe(false)
    // Their fields still fill by the face's order: port 49 is the first uplink.
    expect(r.fixes.find((f) => f.id === 'sw-1:p49')?.details).toMatchObject({
      portType: 'fiber',
    })
    expect(r.fixes.find((f) => f.id === 'sw-1:p10')?.details).toMatchObject({
      portType: 'copper',
    })
  })

  it('does not clear a Manufacturer the model leaves empty', () => {
    const r = setModelPlan({ ...edge, manufacturer: 'Cisco' }, ports([52]), {
      ...c9300,
      manufacturer: '',
    })
    if ('error' in r) throw new Error(r.why)
    expect(r.fixes[0]).toEqual({
      kind: 'equipment',
      id: 'sw-1',
      details: { model: 'C9300-48P' },
    })
  })
})
