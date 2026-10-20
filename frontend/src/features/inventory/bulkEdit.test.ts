import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { buildRows } from './rows'
import {
  BULK_CLEAR,
  BULK_MAX,
  BULK_PLAN_REFUSAL,
  bulkFields,
  bulkRefusal,
  bulkTargets,
  changeCounts,
  installedFixes,
  planBatch,
  type BulkTarget,
} from './bulkEdit'

/** INV-12: Edit details of many rows. */
const target = (
  id: string,
  current: BulkTarget['current'],
  over: Partial<BulkTarget> = {},
): BulkTarget => ({ id, kind: 'equipment', proposed: false, current, ...over })

const a = target('a', {
  manufacturer: 'Cisco',
  model: 'C9300',
  status: 'active',
})
const b = target('b', { manufacturer: '', model: 'C9300', status: 'inactive' })
const c = target('c', { manufacturer: 'HP', model: 'דגם ישן', status: '' })

describe('bulk edit fields', () => {
  it('offers the equipment and port fields of the details model', () => {
    expect(bulkFields('equipment').map((f) => f.key)).toEqual([
      'manufacturer',
      'model',
      'status',
    ])
    expect(bulkFields('ports').map((f) => f.key)).toEqual([
      'portType',
      'connector',
      'speed',
      'state',
    ])
    const status = bulkFields('equipment').find((f) => f.key === 'status')!
    expect(status.kind).toBe('select')
    expect(status.options).toEqual(['active', 'inactive', 'maintenance'])
    expect(bulkFields('equipment')[0].kind).toBe('text')
    expect(
      bulkFields('ports').find((f) => f.key === 'speed')!.options,
    ).toContain('10G')
  })
})

describe('What changes', () => {
  it('counts, per field, only the rows whose value really changes', () => {
    const counts = changeCounts(
      'equipment',
      { manufacturer: 'Cisco', model: 'C9500' },
      [a, b, c],
    )
    expect(counts.fields).toEqual([
      { key: 'manufacturer', label: 'Manufacturer', count: 2 },
      { key: 'model', label: 'Model', count: 3 },
    ])
    expect(counts.rows).toBe(3)
  })

  it('keeps a field that is empty, and trims what is typed', () => {
    expect(
      changeCounts('equipment', { manufacturer: '', model: '   ' }, [a, b, c]),
    ).toEqual({
      fields: [],
      rows: 0,
    })
    const counts = changeCounts('equipment', { model: ' C9300 ' }, [a, b, c])
    expect(counts.fields).toEqual([{ key: 'model', label: 'Model', count: 1 }])
    expect(counts.rows).toBe(1)
  })

  it('clears a field with "— (clear)" and counts the rows that had a value', () => {
    expect(BULK_CLEAR).toBe('— (clear)')
    const counts = changeCounts(
      'equipment',
      { manufacturer: BULK_CLEAR, status: BULK_CLEAR },
      [a, b, c],
    )
    expect(counts.fields).toEqual([
      { key: 'manufacturer', label: 'Manufacturer', count: 2 },
      { key: 'status', label: 'Status', count: 2 },
    ])
    expect(counts.rows).toBe(3)
  })

  it('lists a field that changes no row with a count of 0', () => {
    const counts = changeCounts('equipment', { model: 'C9300' }, [a, b])
    expect(counts.fields).toEqual([{ key: 'model', label: 'Model', count: 0 }])
    expect(counts.rows).toBe(0)
  })

  it('works on ports', () => {
    const p = (id: string, speed: string) =>
      target(
        id,
        { portType: 'copper', connector: 'RJ45', speed, state: 'available' },
        { kind: 'endpoint' },
      )
    const counts = changeCounts('ports', { speed: '1G', state: 'reserved' }, [
      p('p1', '1G'),
      p('p2', '10G'),
    ])
    expect(counts.fields).toEqual([
      { key: 'speed', label: 'Speed', count: 1 },
      { key: 'state', label: 'State', count: 2 },
    ])
  })
})

describe('the Installed request', () => {
  it('has one fix per row that changes, with only the fields that change', () => {
    const fixes = installedFixes(
      'equipment',
      { manufacturer: 'Cisco', model: 'C9300' },
      [a, b, c],
    )
    expect(fixes).toEqual([
      { kind: 'equipment', id: 'b', details: { manufacturer: 'Cisco' } },
      {
        kind: 'equipment',
        id: 'c',
        details: { manufacturer: 'Cisco', model: 'C9300' },
      },
    ])
  })

  it('sends "" for a cleared field and the endpoint kind for ports', () => {
    expect(installedFixes('equipment', { status: BULK_CLEAR }, [a, c])).toEqual(
      [{ kind: 'equipment', id: 'a', details: { status: '' } }],
    )
    const port = target(
      'p1',
      { speed: '1G', state: 'available' },
      { kind: 'endpoint' },
    )
    expect(installedFixes('ports', { state: 'faulty' }, [port])).toEqual([
      { kind: 'endpoint', id: 'p1', details: { state: 'faulty' } },
    ])
  })

  it('has nothing to send when nothing changes', () => {
    expect(installedFixes('equipment', {}, [a, b])).toEqual([])
  })
})

describe('the plan batch', () => {
  const x = target('x', { manufacturer: '', model: '' }, { proposed: true })
  const y = target(
    'y',
    { manufacturer: 'Cisco', model: '' },
    { proposed: true },
  )

  it('is one batch of update_details for the rows that change', () => {
    expect(planBatch('equipment', { manufacturer: 'Cisco' }, [x, y])).toEqual({
      type: 'batch',
      batch: {
        commands: [
          {
            type: 'update_details',
            target: { id: 'x' },
            details: { manufacturer: 'Cisco' },
          },
        ],
      },
    })
  })

  it('is refused when any selected row is installed, with the plan’s words', () => {
    expect(BULK_PLAN_REFUSAL).toBe(
      'In a plan only what it adds is edited; installed details are fixed on Installed',
    )
    expect(bulkRefusal('plan', [x, a])).toBe(BULK_PLAN_REFUSAL)
    expect(bulkRefusal('plan', [x, y])).toBeUndefined()
    expect(planBatch('equipment', { model: 'M' }, [x, a])).toBeUndefined()
  })

  it('has nothing to send when nothing changes', () => {
    expect(planBatch('equipment', {}, [x, y])).toBeUndefined()
  })
})

describe('the limit', () => {
  it('refuses more than 500 rows, on Installed and in a plan', () => {
    expect(BULK_MAX).toBe(500)
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        target(`t${i}`, { model: '' }, { proposed: true }),
      )
    expect(bulkRefusal('installed', many(500))).toBeUndefined()
    expect(bulkRefusal('installed', many(501))).toBe('Select at most 500 rows')
    expect(bulkRefusal('plan', many(501))).toBe('Select at most 500 rows')
  })

  it('has nothing to edit with no row', () => {
    expect(bulkRefusal('installed', [])).toBe('Select rows to edit')
  })
})

describe('bulkTargets', () => {
  const s = acceptanceSnapshot()
  const index = indexSnapshot(s)
  const rows = buildRows(
    s,
    index,
    new Set(s.equipment.map((e) => e.id)),
    new Set(),
  )
  const lookup = {
    equipment: index.equipment,
    endpoints: new Map(s.endpoints.map((p) => [p.id, p])),
  }

  it('reads the current values of the selected equipment and ports', () => {
    const eq = rows.equipment.filter((r) => r.key === 'AGG-03')
    const [t] = bulkTargets('equipment', eq, lookup)
    expect(t).toMatchObject({
      id: 'AGG-03',
      kind: 'equipment',
      proposed: false,
    })
    expect(t.current.status).toBe('')
    const ports = rows.ports.filter((r) => r.key === 'EDGE-17:p1')
    const [p] = bulkTargets('ports', ports, lookup)
    expect(p).toMatchObject({ id: 'EDGE-17:p1', kind: 'endpoint' })
  })

  it('skips a row whose object is gone', () => {
    const ghost = { ...rows.equipment[0], key: 'gone' }
    expect(bulkTargets('equipment', [ghost], lookup)).toEqual([])
  })
})
