import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { COLUMNS } from './columns'
import { csvFileName, toCsv } from './csv'
import { buildRows, type InventoryRow } from './rows'

const row = (values: Record<string, string>): InventoryRow => ({
  key: 'k',
  equipmentId: 'k',
  proposed: false,
  i: 0,
  values,
  raw: {},
  pieces: {},
})
const cols = (...keys: string[]) =>
  COLUMNS.equipment.filter((c) => keys.includes(c.key))

describe('toCsv', () => {
  it('starts with the BOM, then the header of labels', () => {
    const out = toCsv([], cols('name', 'unit', 'serial'))
    expect(out).toBe('﻿Name,U,Serial number')
  })

  it('writes one line per row with CRLF and no trailing newline', () => {
    const out = toCsv(
      [row({ name: 'a', unit: '1' }), row({ name: 'b', unit: '2' })],
      cols('name', 'unit'),
    )
    expect(out).toBe('﻿Name,U\r\na,1\r\nb,2')
  })

  it('writes exactly the given columns, in their order', () => {
    const out = toCsv(
      [row({ name: 'a', kind: 'Switch', unit: '1' })],
      cols('name', 'unit'),
    )
    expect(out.split('\r\n')[1]).toBe('a,1')
    expect(out).not.toContain('Switch')
  })

  it('quotes a cell with a quote, comma, CR or LF and doubles its quotes', () => {
    const out = toCsv(
      [
        row({ name: 'say "hi"', model: 'a,b' }),
        row({ name: 'one\ntwo', model: 'one\rtwo' }),
        row({ name: 'plain', model: '' }),
      ],
      cols('name', 'model'),
    )
    expect(out.split('\r\n')).toEqual([
      '﻿Name,Model',
      '"say ""hi""","a,b"',
      '"one\ntwo","one\rtwo"',
      'plain,',
    ])
  })

  it('quotes a label that needs it', () => {
    const out = toCsv([], [{ ...COLUMNS.equipment[0], label: 'A, B' }])
    expect(out).toBe('﻿"A, B"')
  })

  it('keeps Hebrew as it is', () => {
    const out = toCsv(
      [row({ name: 'מתג-17', model: 'ארון, א' })],
      cols('name', 'model'),
    )
    expect(out).toBe('﻿Name,Model\r\nמתג-17,"ארון, א"')
  })

  it('writes the text of an endpoint cell', () => {
    const s = acceptanceSnapshot()
    const r = buildRows(
      s,
      indexSnapshot(s),
      new Set(s.equipment.map((e) => e.id)),
      new Set(s.links.map((l) => l.id)),
    )
    const out = toCsv(
      r.cables.slice(0, 1),
      COLUMNS.cables.filter((c) => ['id', 'a', 'net'].includes(c.key)),
    )
    expect(out).toBe('﻿Cable,A end,Network\r\nA01,EDGE-17 1,Network A')
  })
})

describe('csvFileName', () => {
  const date = new Date(2026, 9, 19)
  it('names the list and the date', () => {
    expect(csvFileName('ports', undefined, date)).toBe(
      'inventory-ports-2026-10-19.csv',
    )
  })

  it('adds the plan, slugged', () => {
    expect(csvFileName('cables', 'Expansion', date)).toBe(
      'inventory-cables-plan-expansion-2026-10-19.csv',
    )
    expect(csvFileName('equipment', '  Phase 2 / DR!  ', date)).toBe(
      'inventory-equipment-plan-phase-2-dr-2026-10-19.csv',
    )
  })

  it('keeps Hebrew letters in the slug', () => {
    expect(csvFileName('equipment', 'הרחבה א', date)).toBe(
      'inventory-equipment-plan-הרחבה-א-2026-10-19.csv',
    )
  })

  it('pads month and day', () => {
    expect(csvFileName('equipment', undefined, new Date(2026, 0, 5))).toBe(
      'inventory-equipment-2026-01-05.csv',
    )
  })
})
