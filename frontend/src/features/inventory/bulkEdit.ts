import type {
  Details,
  DirectFixItem,
  Endpoint,
  Equipment,
} from '../../shared/types'
import {
  EQUIPMENT_FIELDS,
  PORT_FIELDS,
  equipmentValues,
  portValues,
  type FieldKey,
  type FieldSpec,
  type Values,
} from '../details/model'
import type { EditCommand } from '../planning/editing'
import type { InventoryRow } from './rows'

/** The lists whose rows can be edited together. */
export type BulkList = 'equipment' | 'ports'
/** Installed: direct fixes; a plan: update_details on what the plan adds. */
export type BulkMode = 'installed' | 'plan'

/** The most rows one request carries (the direct fixes' limit). */
export const BULK_MAX = 500
/** What a field says to clear its value on every row ("" keeps it). */
export const BULK_CLEAR = '— (clear)'
export const BULK_PLAN_REFUSAL =
  'In a plan only what it adds is edited; installed details are fixed on Installed'

const KEYS: Record<BulkList, readonly FieldKey[]> = {
  equipment: ['manufacturer', 'model', 'status'],
  ports: ['portType', 'connector', 'speed', 'state'],
}

/** The fields offered, with the value lists of the details model. */
export const bulkFields = (list: BulkList): readonly FieldSpec[] =>
  (list === 'equipment' ? EQUIPMENT_FIELDS : PORT_FIELDS).filter((f) =>
    KEYS[list].includes(f.key),
  )

/** What is typed or chosen per field: "" keeps, BULK_CLEAR clears. */
export type BulkInput = Partial<Record<FieldKey, string>>

/** One selected object with the values it has now. */
export interface BulkTarget {
  /** The equipment ID or the endpoint ID. */
  id: string
  kind: 'equipment' | 'endpoint'
  /** The plan adds it (an installed object is never edited in a plan). */
  proposed: boolean
  current: Values
}

export function bulkTargets(
  list: BulkList,
  rows: readonly InventoryRow[],
  lookup: {
    equipment: ReadonlyMap<string, Equipment>
    endpoints: ReadonlyMap<string, Endpoint>
  },
): BulkTarget[] {
  const out: BulkTarget[] = []
  for (const row of rows) {
    if (list === 'equipment') {
      const e = lookup.equipment.get(row.key)
      if (e)
        out.push({
          id: e.id,
          kind: 'equipment',
          proposed: row.proposed,
          current: equipmentValues(e),
        })
    } else {
      const p = lookup.endpoints.get(row.key)
      if (p)
        out.push({
          id: p.id,
          kind: 'endpoint',
          proposed: row.proposed,
          current: portValues(p),
        })
    }
  }
  return out
}

/** The value a field would get: undefined keeps it, "" clears it. */
function wanted(input: BulkInput, key: FieldKey): string | undefined {
  const typed = (input[key] ?? '').trim()
  if (typed === '') return undefined
  return typed === BULK_CLEAR ? '' : typed
}

/** The details one target would change, none when nothing differs. */
function changes(
  list: BulkList,
  input: BulkInput,
  t: BulkTarget,
): Details | undefined {
  const details: Record<string, string> = {}
  for (const key of KEYS[list]) {
    const next = wanted(input, key)
    if (next !== undefined && (t.current[key] ?? '') !== next)
      details[key] = next
  }
  return Object.keys(details).length ? (details as Details) : undefined
}

/** "What changes": per filled field, the rows whose value really changes. */
export function changeCounts(
  list: BulkList,
  input: BulkInput,
  targets: readonly BulkTarget[],
): { fields: { key: FieldKey; label: string; count: number }[]; rows: number } {
  const fields = bulkFields(list)
    .filter((f) => wanted(input, f.key) !== undefined)
    .map((f) => ({
      key: f.key,
      label: f.label,
      count: targets.filter(
        (t) => (t.current[f.key] ?? '') !== wanted(input, f.key),
      ).length,
    }))
  return {
    fields,
    rows: targets.filter((t) => changes(list, input, t)).length,
  }
}

/** Why the selection cannot be edited here, in words; undefined when it can. */
export function bulkRefusal(
  mode: BulkMode,
  targets: readonly BulkTarget[],
): string | undefined {
  if (targets.length === 0) return 'Select rows to edit'
  if (targets.length > BULK_MAX) return `Select at most ${BULK_MAX} rows`
  if (mode === 'plan' && targets.some((t) => !t.proposed))
    return BULK_PLAN_REFUSAL
  return undefined
}

/** The Installed request: a fix of details for each row that changes (fixInstalledMany). */
export function installedFixes(
  list: BulkList,
  input: BulkInput,
  targets: readonly BulkTarget[],
): DirectFixItem[] {
  return targets.flatMap((t) => {
    const details = changes(list, input, t)
    return details ? [{ kind: t.kind, id: t.id, details }] : []
  })
}

/** The plan's request: one batch of update_details for the rows that change. */
export function planBatch(
  list: BulkList,
  input: BulkInput,
  targets: readonly BulkTarget[],
): EditCommand | undefined {
  if (bulkRefusal('plan', targets)) return undefined
  const commands = targets.flatMap((t) => {
    const details = changes(list, input, t)
    return details
      ? [{ type: 'update_details' as const, target: { id: t.id }, details }]
      : []
  })
  return commands.length ? { type: 'batch', batch: { commands } } : undefined
}
