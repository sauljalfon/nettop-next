import type {
  BatchCommand,
  ChangeLogEntry,
  Details,
  DirectFix,
  Endpoint,
  Equipment,
  Plan,
} from '../../shared/types'
import type { EditCommand } from '../planning/editing'
import { RACK_ITEM_TYPES, rackItemTypeLabel } from '../../shared/rackItems'
import type { RackItemType } from '../../shared/types'

export type FieldKey =
  | 'name'
  | 'manufacturer'
  | 'model'
  | 'serialNumber'
  | 'ipAddress'
  | 'status'
  | 'description'
  | 'itemType'
  | 'itemText'
  | 'portType'
  | 'connector'
  | 'speed'
  | 'state'

export interface FieldSpec {
  key: FieldKey
  label: string
  kind: 'text' | 'textarea' | 'select'
  /** For a select: the values offered (besides "—" and a saved value not in the list). */
  options?: readonly string[]
  /** Monospace text (serial numbers, addresses, port names). */
  mono?: boolean
  /** A select's value in words ("cable-manager" → "Cable manager"); the value itself otherwise. */
  optionLabel?: (value: string) => string
  /** A select that must keep a value: no "—" choice. */
  required?: boolean
  /** User text shown as a name (isolated, possibly Hebrew). */
  name?: boolean
}

/** Field values as typed; a missing or empty value is "not set". */
export type Values = Partial<Record<FieldKey, string>>

/** fix: a direct fix on Installed; plan: update_details on a proposed object; none: shown only. */
export type EditMode = 'fix' | 'plan' | 'none'

export const EQUIPMENT_STATUSES = ['active', 'inactive', 'maintenance'] as const
export const PORT_TYPES = ['copper', 'fiber'] as const
export const PORT_STATES = [
  'available',
  'reserved',
  'disabled',
  'faulty',
] as const
export const CONNECTORS = [
  'RJ45',
  'LC',
  'SC',
  'ST',
  'SFP',
  'SFP+',
  'QSFP',
] as const
export const SPEEDS = [
  '100M',
  '1G',
  '2.5G',
  '5G',
  '10G',
  '25G',
  '40G',
  '100G',
] as const

export const EQUIPMENT_FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'manufacturer', label: 'Manufacturer', kind: 'text' },
  { key: 'model', label: 'Model', kind: 'text' },
  { key: 'serialNumber', label: 'Serial number', kind: 'text', mono: true },
  { key: 'ipAddress', label: 'IP address', kind: 'text', mono: true },
  {
    key: 'status',
    label: 'Status',
    kind: 'select',
    options: EQUIPMENT_STATUSES,
  },
  { key: 'description', label: 'Description', kind: 'textarea' },
]

const typeLabel = (v: string) =>
  (RACK_ITEM_TYPES as readonly string[]).includes(v)
    ? rackItemTypeLabel(v as RackItemType)
    : v

/** A rack item's type, and what it is for an Other (decision: the type is a detail). */
export const ITEM_TYPE_FIELD: FieldSpec = {
  key: 'itemType',
  label: 'Type',
  kind: 'select',
  options: RACK_ITEM_TYPES,
  optionLabel: typeLabel,
  required: true,
}
export const ITEM_TEXT_FIELD: FieldSpec = {
  key: 'itemText',
  label: 'What it is',
  kind: 'text',
  name: true,
}

export const PORT_FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text', mono: true },
  { key: 'portType', label: 'Port type', kind: 'select', options: PORT_TYPES },
  { key: 'connector', label: 'Connector', kind: 'select', options: CONNECTORS },
  { key: 'speed', label: 'Speed', kind: 'select', options: SPEEDS },
  { key: 'state', label: 'State', kind: 'select', options: PORT_STATES },
  { key: 'description', label: 'Description', kind: 'textarea' },
]

/** Change-log field names in words. */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  manufacturer: 'Manufacturer',
  model: 'Model',
  serialNumber: 'Serial number',
  ipAddress: 'IP address',
  status: 'Status',
  description: 'Description',
  portType: 'Port type',
  connector: 'Connector',
  speed: 'Speed',
  state: 'State',
  label: 'Label',
  notes: 'Notes',
  location: 'Location',
  rackType: 'Rack type',
  itemType: 'Type',
  itemText: 'What it is',
}

export function editMode(
  context: 'installed' | 'planned',
  proposed: boolean,
  canEdit: boolean,
): EditMode {
  if (context === 'installed') return 'fix'
  return proposed && canEdit ? 'plan' : 'none'
}

/**
 * Equipment has its name in both modes: a fix renames installed equipment, and
 * rename_equipment renames what a plan adds. The mode stays a parameter so the
 * callers say which one they edit. A rack item also has its Type after the
 * name, and What it is while the type (in `values`, else its own) is Other.
 */
export function equipmentFields(
  mode: EditMode,
  equipment?: Pick<Equipment, 'kind' | 'itemType'>,
  values?: Values,
): readonly FieldSpec[] {
  const [name, ...rest] = EQUIPMENT_FIELDS
  const type =
    equipment?.kind === 'rack_item'
      ? [
          ITEM_TYPE_FIELD,
          ...((values?.itemType ?? equipment.itemType) === 'other'
            ? [ITEM_TEXT_FIELD]
            : []),
        ]
      : []
  return [...(mode === 'none' ? [] : [name]), ...type, ...rest]
}

export const canRenamePort = (
  equipment: Pick<Equipment, 'kind'>,
  endpoint: Pick<Endpoint, 'position'>,
) => equipment.kind === 'switch' && (endpoint.position ?? 0) > 0

export const portFields = (
  mode: EditMode,
  canRename: boolean,
): readonly FieldSpec[] =>
  mode === 'fix' && canRename
    ? PORT_FIELDS
    : PORT_FIELDS.filter((f) => f.key !== 'name')

export const equipmentValues = (e: Equipment): Values => ({
  name: e.name,
  ...(e.kind === 'rack_item' && {
    itemType: e.itemType ?? '',
    itemText: e.itemText ?? '',
  }),
  manufacturer: e.manufacturer ?? '',
  model: e.model ?? '',
  serialNumber: e.serialNumber ?? '',
  ipAddress: e.ipAddress ?? '',
  status: e.status ?? '',
  description: e.description ?? '',
})

export const portValues = (p: Endpoint): Values => ({
  name: p.label,
  portType: p.portType ?? '',
  connector: p.connector ?? '',
  speed: p.speed ?? '',
  state: p.state ?? '',
  description: p.description ?? '',
})

/** A select's choices: "" (—) first, the list, then a saved value that is not in the list. */
export function optionsFor(spec: FieldSpec, current: string): string[] {
  const list = [...(spec.options ?? [])]
  return [
    ...(spec.required ? [] : ['']),
    ...list,
    ...(current && !list.includes(current) ? [current] : []),
  ]
}

/**
 * What a save sends: only the fields whose trimmed value changed (the name on
 * its own, the rest as details; an emptied field as "", which clears it), and
 * the trimmed note when there is one.
 */
export function changedFix(
  fields: readonly FieldSpec[],
  before: Values,
  after: Values,
  note = '',
): DirectFix {
  const fix: DirectFix = {}
  const details: Record<string, string> = {}
  for (const f of fields) {
    const was = (before[f.key] ?? '').trim()
    const now = (after[f.key] ?? '').trim()
    if (was === now) continue
    if (f.key === 'name') fix.name = now
    else details[f.key] = now
  }
  // Leaving Other clears its text in the same fix: the server refuses a text on any other type.
  if (
    details.itemType !== undefined &&
    details.itemType !== 'other' &&
    (before.itemType ?? '') === 'other'
  )
    details.itemText = ''
  if (Object.keys(details).length) fix.details = details as Details
  if (note.trim()) fix.note = note.trim()
  return fix
}

/**
 * What Save in plan sends for equipment the plan adds: rename_equipment for a
 * changed name, update_details for changed details, both as one batch (rename
 * first), and nothing when neither changed. A cleared name is sent as it is;
 * the server refuses it in its own words.
 */
export function planEditCommand(
  equipmentId: string,
  fix: DirectFix,
): EditCommand | undefined {
  const target = { id: equipmentId }
  const rename: BatchCommand | undefined =
    fix.name !== undefined
      ? { type: 'rename_equipment', target, name: fix.name }
      : undefined
  const update: BatchCommand | undefined =
    fix.details !== undefined
      ? { type: 'update_details', target, details: fix.details }
      : undefined
  if (rename && update)
    return { type: 'batch', batch: { commands: [rename, update] } }
  return rename ?? update
}

/** A note alone changes nothing. */
export const hasChanges = (fix: DirectFix) =>
  fix.name !== undefined || fix.details !== undefined

export function fixLine(e: ChangeLogEntry) {
  const value = (v: string) =>
    !v ? '(empty)' : e.field === 'itemType' ? typeLabel(v) : v
  return {
    id: e.id,
    at: e.at,
    field: FIELD_LABELS[e.field] ?? e.field,
    from: value(e.oldValue),
    to: value(e.newValue),
    ...(e.note ? { note: e.note } : {}),
  }
}

export function recordedLine(p: Plan) {
  return {
    id: p.id,
    at: p.recordedAt ?? '',
    name: p.name,
    note: p.recordNote ?? '',
    by: p.recordedBy ?? '',
  }
}
