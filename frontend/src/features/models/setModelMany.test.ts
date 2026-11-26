import { describe, expect, it } from 'vitest'
import type { Endpoint, Equipment, SwitchModel } from '../../shared/types'
import { piecesText } from '../../shared/textPieces'
import { modelNote, overview, MAX_FIXES } from './setModelMany'

const c9300: SwitchModel = {
  id: 'model-1',
  name: 'C9300-48P',
  manufacturer: 'Cisco',
  height: 1,
  portGroups: [
    {
      count: 48,
      names: 'Gi1/0/{n}',
      details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
    },
    {
      count: 4,
      names: 'Te1/1/{n}',
      details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
    },
  ],
}
const sw = (id: string, name: string): Equipment => ({
  id,
  name,
  kind: 'switch',
  role: 'access',
  rackId: 'r',
  unit: 1,
  height: 1,
})
const ports = (id: string, n: number, groups = false): Endpoint[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${id}:p${i + 1}`,
    equipmentId: id,
    label: `Port ${i + 1}`,
    position: i + 1,
    ...(groups && { portGroup: 1 }),
  }))

const items = [
  { equipment: sw('a', 'EDGE-31'), ports: ports('a', 52, true) },
  { equipment: sw('b', 'EDGE-32'), ports: ports('b', 52, true) },
  { equipment: sw('c', 'EDGE-33'), ports: ports('c', 24, true) },
]

describe('overview', () => {
  it('sets the switches that fit and lists the others as skipped with why', () => {
    const o = overview(items, c9300)
    expect(o.applicable.map((a) => a.equipment.id)).toEqual(['a', 'b'])
    expect(o.skipped).toHaveLength(1)
    expect(piecesText(o.skipped[0].pieces)).toContain('EDGE-33')
    expect(piecesText(o.skipped[0].pieces)).toContain('24 ports')
  })

  it('sends every fix of every switch in one list and counts them', () => {
    const o = overview(items, c9300)
    const one = overview([items[0]], c9300)
    expect(one.fixes.length).toBeGreaterThan(50)
    expect(o.fixes).toHaveLength(one.fixes.length * 2)
    expect(o.tooMany).toBe(false)
  })

  it('sums each section over the switches and keeps the first switch lines', () => {
    const o = overview(items, c9300)
    const names = o.sections.find((s) => s.section === 'names')!
    expect(names.count).toBe(104)
    expect(names.lines[0].pieces).toEqual([
      { name: 'Port 1' },
      { text: ' → ' },
      { name: 'Gi1/0/1' },
    ])
    expect(o.sections.map((s) => s.section)).toEqual([
      'details',
      'names',
      'fields',
      'groups',
    ])
    expect(o.firstName).toBe('EDGE-31')
  })

  it('prefixes Left as typed lines with the switch when several are set', () => {
    const typed = ports('a', 52, true)
    typed[0] = { ...typed[0], speed: '100M' }
    const o = overview(
      [{ equipment: sw('a', 'EDGE-31'), ports: typed }, items[1]],
      c9300,
    )
    expect(o.kept).toHaveLength(1)
    expect(piecesText(o.kept[0].pieces)).toMatch(/^EDGE-31 · /)
    expect(o.keptCount).toBe(1)
    const solo = overview(
      [{ equipment: sw('a', 'EDGE-31'), ports: typed }],
      c9300,
    )
    expect(piecesText(solo.kept[0].pieces)).toMatch(/^Port 1 speed/)
  })

  it('refuses a request of more than one batch holds', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      equipment: sw(`s${i}`, `S-${i}`),
      ports: ports(`s${i}`, 52, true),
    }))
    const o = overview(many, c9300)
    expect(o.fixes.length).toBeGreaterThan(MAX_FIXES)
    expect(o.tooMany).toBe(true)
  })

  it('says a switch that is not a switch is skipped', () => {
    const panel = { ...sw('p', 'PANEL-1'), kind: 'panel' as const }
    const o = overview([{ equipment: panel, ports: [] }], c9300)
    expect(o.applicable).toHaveLength(0)
    expect(piecesText(o.skipped[0].pieces)).toContain('not a switch')
  })
})

describe('modelNote (the option text after a model)', () => {
  it('says why a model is off for one switch, and nothing when it fits', () => {
    expect(modelNote([items[2]], c9300)).toBe('(this switch has 24)')
    expect(modelNote([items[0]], c9300)).toBeUndefined()
    const grouped = {
      equipment: sw('g', 'G'),
      ports: [
        ...ports('g', 52).map((p, i) => ({
          ...p,
          portGroup: i < 24 ? 1 : i < 48 ? 2 : 3,
        })),
      ],
    }
    expect(modelNote([grouped], c9300)).toBe(
      "(its groups are 48 + 4; this switch's are 24 + 24 + 4)",
    )
  })

  it('for many switches is off only when none fits', () => {
    expect(modelNote([items[2], items[2]], c9300)).toBe(
      '(no selected switch fits)',
    )
    expect(modelNote(items, c9300)).toBeUndefined()
  })
})
