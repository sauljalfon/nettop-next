// Set model (D51) over one or many switches: what is set, what is skipped, what is sent.
import type { TextPiece } from '../../shared/textPieces'
import type { Endpoint, Equipment, SwitchModel } from '../../shared/types'
import {
  modelPortCount,
  setModelPlan,
  type FixInput,
  type Line,
  type LineSection,
} from './model'

/** One request of POST /installed/fixes holds this many fixes. */
export const MAX_FIXES = 500

export interface SwitchPorts {
  equipment: Equipment
  ports: readonly Endpoint[]
}

export interface Section {
  section: Exclude<LineSection, 'kept'>
  /** The sum of what the sections of every switch fill. */
  count: number
  /** The first switch's lines (the others are set the same way). */
  lines: Line[]
}

export interface Overview {
  applicable: (SwitchPorts & { noPositions: boolean })[]
  skipped: { equipment: Equipment; pieces: TextPiece[] }[]
  fixes: FixInput[]
  sections: Section[]
  /** Every switch's Left as typed lines (prefixed with the switch's name when several are set). */
  kept: Line[]
  keptCount: number
  /** The first switch set, whose lines the sections show. */
  firstName: string
  /** Any set switch whose ports have no positions: its face stays one group. */
  noPositions: boolean
  /** More fixes than one request holds. */
  tooMany: boolean
}

const ORDER: Section['section'][] = ['details', 'names', 'fields', 'groups']

/** The model's effect on each switch: those it fits, those skipped (with why), and the fixes. */
export function overview(
  items: readonly SwitchPorts[],
  model: SwitchModel,
): Overview {
  const applicable: Overview['applicable'] = []
  const skipped: Overview['skipped'] = []
  const fixes: FixInput[] = []
  const sums = new Map<Section['section'], Section>()
  const keptLines: { who: string; line: Line }[] = []
  for (const item of items) {
    const { equipment } = item
    if (equipment.kind !== 'switch') {
      skipped.push({
        equipment,
        pieces: [{ name: equipment.name }, { text: ' is not a switch.' }],
      })
      continue
    }
    const plan = setModelPlan(equipment, item.ports, model)
    if ('error' in plan) {
      skipped.push({
        equipment,
        pieces: [{ name: equipment.name }, { text: `: ${plan.why}` }],
      })
      continue
    }
    applicable.push({ ...item, noPositions: plan.noPositions })
    fixes.push(...plan.fixes)
    for (const line of plan.filled) {
      if (line.section === 'kept') continue
      let s = sums.get(line.section)
      if (!s)
        sums.set(
          line.section,
          (s = { section: line.section, count: 0, lines: [] }),
        )
      s.count += line.count
      if (applicable.length === 1) s.lines.push(line)
    }
    for (const line of plan.kept) keptLines.push({ who: equipment.name, line })
  }
  const many = applicable.length > 1
  const kept = keptLines.map(({ who, line }) =>
    many
      ? { ...line, pieces: [{ name: who }, { text: ' · ' }, ...line.pieces] }
      : line,
  )
  return {
    applicable,
    skipped,
    fixes,
    sections: ORDER.flatMap((k) => sums.get(k) ?? []),
    kept,
    keptCount: kept.length,
    firstName: applicable[0]?.equipment.name ?? '',
    noPositions: applicable.some((a) => a.noPositions),
    tooMany: fixes.length > MAX_FIXES,
  }
}

/**
 * What follows a model's name in the list when it cannot be chosen: why this
 * switch does not fit, or for many switches that none does. Undefined when it fits.
 */
export function modelNote(
  items: readonly SwitchPorts[],
  model: SwitchModel,
): string | undefined {
  const switches = items.filter((i) => i.equipment.kind === 'switch')
  const results = switches.map((i) => setModelPlan(i.equipment, i.ports, model))
  if (results.some((r) => !('error' in r))) return undefined
  if (switches.length === 1) {
    const r = results[0]
    if ('error' in r)
      return r.error === 'ports'
        ? `(this switch has ${switches[0].ports.length})`
        : `(${r.why})`
  }
  return '(no selected switch fits)'
}

export { modelPortCount }
