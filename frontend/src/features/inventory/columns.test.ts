import { describe, expect, it } from 'vitest'
import {
  COLUMNS,
  DEFAULT_HIDDEN,
  GROUPS,
  PILLS,
  defaultSort,
  emptyText,
  visibleColumns,
} from './columns'

describe('columns', () => {
  it('has the demo columns, keys, labels and widths', () => {
    expect(COLUMNS.equipment.map((c) => [c.key, c.label, c.width])).toEqual([
      ['name', 'Name', 190],
      ['kind', 'Kind', 90],
      ['role', 'Role', 110],
      ['net', 'Network', 130],
      ['site', 'Site', 140],
      ['node', 'Node', 150],
      ['rack', 'Rack', 70],
      ['unit', 'U', 56],
      ['manufacturer', 'Manufacturer', 120],
      ['model', 'Model', 130],
      ['serial', 'Serial number', 130],
      ['ip', 'IP address', 120],
      ['status', 'Status', 130],
    ])
    expect(COLUMNS.ports.map((c) => c.key)).toEqual([
      'port',
      'equipment',
      'side',
      'net',
      'type',
      'connector',
      'speed',
      'state',
      'cable',
      'far',
      'site',
      'node',
    ])
    expect(COLUMNS.cables.map((c) => c.key)).toEqual([
      'id',
      'a',
      'b',
      'net',
      'label',
      'status',
    ])
  })

  it('marks the first column of each list, and only that one', () => {
    for (const list of ['equipment', 'ports', 'cables'] as const) {
      const first = COLUMNS[list].filter((c) => c.first)
      expect(first).toHaveLength(1)
      expect(first[0]).toBe(COLUMNS[list][0])
    }
  })

  it('gives each column its kind', () => {
    const kind = (list: 'equipment' | 'ports' | 'cables', key: string) =>
      COLUMNS[list].find((c) => c.key === key)?.kind
    expect(kind('equipment', 'net')).toBe('network')
    expect(kind('equipment', 'status')).toBe('status')
    expect(kind('equipment', 'site')).toBe('name')
    expect(kind('equipment', 'serial')).toBe('mono')
    expect(kind('ports', 'equipment')).toBe('equipmentLink')
    expect(kind('ports', 'far')).toBe('endpoint')
    expect(kind('ports', 'state')).toBe('status')
    expect(kind('cables', 'a')).toBe('endpoint')
    expect(kind('cables', 'b')).toBe('endpoint')
  })

  it('has the pills and Group by choices of the demo', () => {
    expect(PILLS.equipment).toEqual([
      ['site', 'Site'],
      ['node', 'Node'],
      ['net', 'Network'],
      ['kind', 'Kind'],
      ['role', 'Role'],
      ['status', 'Status'],
    ])
    expect(PILLS.ports.map((p) => p[0])).toEqual([
      'equipment',
      'site',
      'net',
      'side',
      'state',
      'type',
    ])
    expect(PILLS.cables).toEqual([
      ['net', 'Network'],
      ['status', 'Status'],
    ])
    expect(GROUPS.equipment.map((g) => g[0])).toEqual([
      'site',
      'node',
      'net',
      'kind',
      'role',
      'status',
    ])
    expect(GROUPS.ports).toEqual([
      ['equipment', 'Equipment'],
      ['node', 'Node'],
      ['side', 'Side'],
      ['state', 'State'],
    ])
    expect(GROUPS.cables).toEqual([
      ['net', 'Network'],
      ['status', 'Status'],
    ])
  })

  it('hides the demo columns by default', () => {
    expect(DEFAULT_HIDDEN).toEqual({
      equipment: ['ip'],
      ports: ['site', 'node'],
      cables: [],
    })
    expect(
      visibleColumns('ports', new Set(DEFAULT_HIDDEN.ports)).map((c) => c.key),
    ).not.toContain('site')
  })

  it('always keeps the first column visible', () => {
    const keys = visibleColumns('equipment', new Set(['name', 'kind'])).map(
      (c) => c.key,
    )
    expect(keys).toContain('name')
    expect(keys).not.toContain('kind')
  })

  it('sorts each list by its first key by default', () => {
    expect(defaultSort('equipment')).toEqual({ key: 'name', dir: 1 })
    expect(defaultSort('ports')).toEqual({ key: 'equipment', dir: 1 })
    expect(defaultSort('cables')).toEqual({ key: 'id', dir: 1 })
  })

  it('words an empty value by column', () => {
    expect(emptyText('equipment', 'net')).toBe('No network')
    expect(emptyText('cables', 'net')).toBe('No network')
    expect(emptyText('equipment', 'status')).toBe('Not set')
    expect(emptyText('ports', 'state')).toBe('Not set')
    expect(emptyText('ports', 'side')).toBe('No side (switch ports)')
    expect(emptyText('equipment', 'manufacturer')).toBe('(empty)')
    expect(emptyText('cables', 'label')).toBe('(empty)')
  })
})
