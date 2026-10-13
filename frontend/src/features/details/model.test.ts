import { describe, expect, it } from 'vitest'
import type {
  ChangeLogEntry,
  Endpoint,
  Equipment,
  Plan,
} from '../../shared/types'
import {
  EQUIPMENT_FIELDS,
  PORT_FIELDS,
  canRenamePort,
  changedFix,
  editMode,
  equipmentFields,
  equipmentValues,
  fixLine,
  hasChanges,
  optionsFor,
  portFields,
  portValues,
  recordedLine,
} from './model'

const agg: Equipment = {
  id: 'agg-03',
  name: 'AGG-03',
  kind: 'switch',
  role: 'aggregation',
  networkId: 'net-a',
  rackId: 'rack-core-01',
  unit: 8,
  height: 1,
  manufacturer: 'Cisco',
  status: 'active',
}

describe('FD-model where details are edited', () => {
  it('fixes on Installed, saves in a plan only for proposed objects, and otherwise only shows', () => {
    expect(editMode('installed', false, false)).toBe('fix')
    expect(editMode('planned', true, true)).toBe('plan')
    expect(editMode('planned', false, true)).toBe('none')
    expect(editMode('planned', true, false)).toBe('none') // stale or recorded
  })

  it('a plan cannot rename (update_details has no name)', () => {
    expect(equipmentFields('fix').map((f) => f.key)).toContain('name')
    expect(equipmentFields('plan').map((f) => f.key)).not.toContain('name')
  })

  it('only a switch port with a position can be renamed, and only by a fix', () => {
    expect(canRenamePort({ kind: 'switch' }, { position: 3 })).toBe(true)
    expect(canRenamePort({ kind: 'switch' }, {})).toBe(false)
    expect(canRenamePort({ kind: 'panel' }, { position: 3 })).toBe(false)
    expect(portFields('fix', true).map((f) => f.key)).toContain('name')
    expect(portFields('fix', false).map((f) => f.key)).not.toContain('name')
    expect(portFields('plan', true).map((f) => f.key)).not.toContain('name')
  })
})

describe('FD-model values and dropdowns', () => {
  it('reads every field, empty when not set', () => {
    expect(equipmentValues(agg)).toEqual({
      name: 'AGG-03',
      manufacturer: 'Cisco',
      model: '',
      serialNumber: '',
      ipAddress: '',
      status: 'active',
      description: '',
    })
    const port: Endpoint = {
      id: 'agg-03:p2',
      equipmentId: 'agg-03',
      label: 'Te1/1/2',
      position: 2,
      connector: 'MPO',
    }
    expect(portValues(port)).toEqual({
      name: 'Te1/1/2',
      portType: '',
      connector: 'MPO',
      speed: '',
      state: '',
      description: '',
    })
  })

  it('a dropdown starts with the empty choice and keeps a saved value that is not in its list', () => {
    const connector = PORT_FIELDS.find((f) => f.key === 'connector')!
    expect(optionsFor(connector, '')).toEqual([
      '',
      'RJ45',
      'LC',
      'SC',
      'ST',
      'SFP',
      'SFP+',
      'QSFP',
    ])
    expect(optionsFor(connector, 'MPO')).toEqual([
      '',
      'RJ45',
      'LC',
      'SC',
      'ST',
      'SFP',
      'SFP+',
      'QSFP',
      'MPO',
    ])
    const status = EQUIPMENT_FIELDS.find((f) => f.key === 'status')!
    expect(optionsFor(status, 'active')).toEqual([
      '',
      'active',
      'inactive',
      'maintenance',
    ])
  })
})

describe('FD-model what a save sends', () => {
  const fields = equipmentFields('fix')
  const before = equipmentValues(agg)

  it('sends only the changed fields, trimmed; the name separately; an emptied field as ""', () => {
    const fix = changedFix(
      fields,
      before,
      { ...before, name: ' AGG-03A ', model: 'C9500 ', manufacturer: '' },
      ' Asset audit ',
    )
    expect(fix).toEqual({
      name: 'AGG-03A',
      details: { manufacturer: '', model: 'C9500' },
      note: 'Asset audit',
    })
    expect(hasChanges(fix)).toBe(true)
  })

  it('an unchanged form sends nothing, and a note alone is not a change', () => {
    const fix = changedFix(fields, before, { ...before, model: '  ' }, 'why')
    expect(fix).toEqual({ note: 'why' })
    expect(hasChanges(fix)).toBe(false)
  })
})

describe('FD-model history lines', () => {
  it('says the field in words and shows an empty value as (empty)', () => {
    const entry: ChangeLogEntry = {
      id: 7,
      at: '2026-10-13T09:10:00Z',
      entityKind: 'equipment',
      entityId: 'agg-03',
      field: 'serialNumber',
      oldValue: '',
      newValue: 'SN-1',
      note: 'Asset audit',
    }
    expect(fixLine(entry)).toEqual({
      id: 7,
      at: '2026-10-13T09:10:00Z',
      field: 'Serial number',
      from: '(empty)',
      to: 'SN-1',
      note: 'Asset audit',
    })
  })

  it('a recorded plan reads with its name, note and who recorded it', () => {
    const plan = {
      id: 'p1',
      name: 'Expansion',
      status: 'recorded',
      recordedAt: '2026-10-10T08:00:00Z',
      recordNote: 'EDGE-18 installed',
      recordedBy: 'Saul',
    } as Plan
    expect(recordedLine(plan)).toEqual({
      id: 'p1',
      at: '2026-10-10T08:00:00Z',
      name: 'Expansion',
      note: 'EDGE-18 installed',
      by: 'Saul',
    })
  })
})
