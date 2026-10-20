import { describe, expect, it } from 'vitest'
import {
  COLUMNS,
  DEFAULT_HIDDEN,
  GROUPS,
  PILLS,
  columnOf,
  sortable,
  defaultSort,
  emptyText,
  visibleColumns,
  type InventoryList,
} from './columns'

const LISTS = Object.keys(COLUMNS) as InventoryList[]

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
      ['used', 'Ports used', 96],
      ['free', 'Ports free', 96],
      ['manufacturer', 'Manufacturer', 120],
      ['model', 'Model', 130],
      ['serial', 'Serial number', 130],
      ['ip', 'IP address', 120],
      ['status', 'Status', 130],
      ['missing', 'Missing', 200],
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
    expect(COLUMNS.racks.map((c) => [c.key, c.label])).toEqual([
      ['rack', 'Rack'],
      ['site', 'Site'],
      ['node', 'Node'],
      ['units', 'Height'],
      ['used', 'Used'],
      ['free', 'Free'],
      ['gap', 'Largest free block'],
      ['count', 'Equipment'],
      ['fits', 'Fits'],
    ])
    expect(COLUMNS.problems.map((c) => [c.key, c.label])).toEqual([
      ['what', 'Object'],
      ['problem', 'Problem'],
      ['detail', 'Detail'],
      ['site', 'Site'],
      ['node', 'Node'],
    ])
    expect(COLUMNS.work.map((c) => [c.key, c.label])).toEqual([
      ['what', 'Object'],
      ['n', 'Step'],
      ['action', 'Action'],
      ['where', 'Where'],
      ['detail', 'Detail'],
      ['node', 'Node'],
    ])
  })

  it('marks the first column of each list, and only that one', () => {
    for (const list of LISTS) {
      const first = COLUMNS[list].filter((c) => c.first)
      expect(first).toHaveLength(1)
      expect(first[0]).toBe(COLUMNS[list][0])
    }
  })

  it('gives each column its kind', () => {
    const kind = (list: InventoryList, key: string) =>
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
    expect(kind('work', 'action')).toBe('chip')
    expect(kind('work', 'where')).toBe('pieces')
    expect(kind('problems', 'detail')).toBe('pieces')
    expect(kind('racks', 'rack')).toBe('name')
  })

  it('marks the numeric columns and the units suffix', () => {
    const num = (list: InventoryList) =>
      COLUMNS[list].filter((c) => c.numeric).map((c) => c.key)
    expect(num('equipment')).toEqual(['unit', 'used', 'free'])
    expect(num('racks')).toEqual(['units', 'used', 'free', 'gap', 'count'])
    expect(num('work')).toEqual(['n'])
    const suffix = (key: string) =>
      COLUMNS.racks.find((c) => c.key === key)?.suffix
    expect(['units', 'used', 'free'].map(suffix)).toEqual(['U', 'U', 'U'])
  })

  it('marks the list-valued fields, which are not sortable or groupable', () => {
    const lists = LISTS.flatMap((l) =>
      COLUMNS[l].filter((c) => c.list).map((c) => `${l}:${c.key}`),
    )
    expect(lists).toEqual(['equipment:missing', 'racks:fits'])
    expect(sortable('equipment', 'missing')).toBe(false)
    expect(sortable('equipment', 'name')).toBe(true)
    expect(sortable('racks', 'fits')).toBe(false)
    for (const l of LISTS)
      for (const [key] of GROUPS[l])
        expect(columnOf(l, key)?.list).toBeUndefined()
  })

  it('has the pills and Group by choices of the demo', () => {
    expect(PILLS.equipment).toEqual([
      ['site', 'Site'],
      ['node', 'Node'],
      ['net', 'Network'],
      ['kind', 'Kind'],
      ['role', 'Role'],
      ['status', 'Status'],
      ['missing', 'Missing'],
    ])
    expect(PILLS.ports.map((p) => p[0])).toEqual([
      'equipment',
      'site',
      'node',
      'net',
      'connected',
      'side',
      'state',
      'type',
    ])
    expect(PILLS.racks).toEqual([
      ['site', 'Site'],
      ['node', 'Node'],
      ['fits', 'Fits'],
    ])
    expect(PILLS.problems).toEqual([
      ['problem', 'Problem'],
      ['site', 'Site'],
    ])
    expect(PILLS.work).toEqual([
      ['action', 'Action'],
      ['node', 'Node'],
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
      ['connected', 'Connected'],
    ])
    expect(GROUPS.racks).toEqual([
      ['site', 'Site'],
      ['node', 'Node'],
    ])
    expect(GROUPS.problems).toEqual([
      ['problem', 'Problem'],
      ['node', 'Node'],
    ])
    expect(GROUPS.work).toEqual([
      ['action', 'Action'],
      ['node', 'Node'],
    ])
    expect(GROUPS.cables).toEqual([
      ['net', 'Network'],
      ['status', 'Status'],
    ])
  })

  it('hides the demo columns by default', () => {
    expect(DEFAULT_HIDDEN).toEqual({
      equipment: ['manufacturer', 'ip', 'missing'],
      ports: ['site', 'node'],
      cables: [],
      racks: ['fits'],
      problems: [],
      work: ['node'],
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
    expect(defaultSort('racks')).toEqual({ key: 'rack', dir: 1 })
    expect(defaultSort('problems')).toEqual({ key: 'problem', dir: 1 })
    expect(defaultSort('work')).toEqual({ key: 'n', dir: 1 })
  })

  it('words an empty value by column', () => {
    expect(emptyText('equipment', 'net')).toBe('No network')
    expect(emptyText('cables', 'net')).toBe('No network')
    expect(emptyText('equipment', 'status')).toBe('Not set')
    expect(emptyText('ports', 'state')).toBe('Not set')
    expect(emptyText('ports', 'side')).toBe('No side (switch ports)')
    expect(emptyText('equipment', 'manufacturer')).toBe('(empty)')
    expect(emptyText('cables', 'label')).toBe('(empty)')
    expect(emptyText('equipment', 'missing')).toBe('Nothing missing')
    expect(emptyText('racks', 'fits')).toBe('Full')
  })
})
