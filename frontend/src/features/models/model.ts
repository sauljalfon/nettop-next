// Switch models (D51): pure logic of the models page, the add box and Set model.
import { comparePorts } from '../../shared/ports'
import type { TextPiece } from '../../shared/textPieces'
import type {
  DirectFixItem,
  Endpoint,
  Equipment,
  ModelPortGroup,
  PortDetails,
  SwitchModel,
  SwitchModelInput,
} from '../../shared/types'
import type { EditCommand } from '../planning/editing'
import { checkGroups, type GroupRow } from '../planning/portGroups'

const MAX_NAME = 100
const MAX_MANUFACTURER = 200

const startOf = (g: ModelPortGroup) => g.start ?? 1

// ---------------------------------------------------------------- the editor

/** The editor's rows of a model, as typed. */
export const modelRows = (m: SwitchModel): GroupRow[] =>
  m.portGroups.map((g) => ({
    count: String(g.count ?? ''),
    names: g.names ?? '',
    start: String(startOf(g)),
    portType: g.details?.portType ?? '',
    connector: g.details?.connector ?? '',
    speed: g.details?.speed ?? '',
  }))

/** The model to save from the editor's fields, or what is wrong in words. */
export function modelFromRows(
  name: string,
  manufacturer: string,
  height: number | string,
  rows: readonly GroupRow[],
): { input: SwitchModelInput } | { error: string } {
  const n = name.trim()
  if (!n) return { error: 'Give the model a name.' }
  if (n.length > MAX_NAME)
    return { error: `The name is at most ${MAX_NAME} characters.` }
  const maker = manufacturer.trim()
  if (maker.length > MAX_MANUFACTURER)
    return {
      error: `The manufacturer is at most ${MAX_MANUFACTURER} characters.`,
    }
  const h = typeof height === 'number' ? height : Number(height.trim() || NaN)
  if (!Number.isInteger(h) || h < 1 || h > 10)
    return { error: 'Height is 1–10 rack units.' }
  const groups = checkGroups(rows)
  if ('error' in groups) return groups
  return {
    input: {
      name: n,
      manufacturer: maker,
      height: h,
      portGroups: groups.groups,
    },
  }
}

export const modelPortCount = (m: SwitchModel): number =>
  m.portGroups.reduce((n, g) => n + (g.count ?? 0), 0)

/** The port names in order: each group's `names` with {n} from its start. */
export const modelLabels = (m: SwitchModel): string[] =>
  m.portGroups.flatMap((g) =>
    Array.from({ length: g.count ?? 0 }, (_, i) =>
      (g.names ?? '').replace('{n}', String(startOf(g) + i)),
    ),
  )

// ------------------------------------------------------------------ adding

/** One add_equipment per name, each with the model's ports, height and details. */
export function addSwitchCommands(
  m: SwitchModel,
  place: { rackId: string; units: number[] },
  names: string[],
  role: 'access' | 'aggregation' | 'backbone',
  networkId: string,
): EditCommand[] {
  return names.map((name, i) => ({
    type: 'add_equipment' as const,
    equipment: {
      name,
      kind: 'switch' as const,
      role,
      networkId,
      rackId: place.rackId,
      unit: place.units[i],
      height: m.height,
      portGroups: m.portGroups.map((g) => ({
        ...g,
        ...(g.details && { details: { ...g.details } }),
      })),
      details: {
        ...(m.manufacturer.trim() && { manufacturer: m.manufacturer.trim() }),
        model: m.name,
      },
    },
  }))
}

/**
 * The lowest unit of each of `count` devices of `height` units, the first one
 * with its highest unit at `top`, the next ones below it. Null when a unit is
 * taken, or a device would leave the rack (above `rackUnits` or below U1).
 */
export function stackUnits(
  occupied: ReadonlySet<number>,
  rackUnits: number,
  top: number,
  height: number,
  count: number,
): number[] | null {
  if (count < 1 || height < 1 || top > rackUnits) return null
  const lowest: number[] = []
  for (let k = 0; k < count; k++) {
    const low = top - (k + 1) * height + 1
    if (low < 1) return null
    for (let u = low; u < low + height; u++) if (occupied.has(u)) return null
    lowest.push(low)
  }
  return lowest
}

const TRAILING = /^(.*?)(\d+)$/su

/** The highest trailing number among the names plus one, keeping prefix and padding ('' with none). */
export function suggestName(names: readonly string[]): string {
  let best: { prefix: string; digits: string; value: number } | undefined
  for (const name of names) {
    const m = TRAILING.exec(name.trim())
    if (!m) continue
    const value = Number(m[2])
    if (!best || value > best.value)
      best = { prefix: m[1], digits: m[2], value }
  }
  if (!best) return ''
  return best.prefix + String(best.value + 1).padStart(best.digits.length, '0')
}

/** `count` names from `first`: EDGE-33 ×3 → EDGE-33, EDGE-34, EDGE-35; no number → X, X 2, X 3. */
export function seriesNames(first: string, count: number): string[] {
  const name = first.trim()
  const m = TRAILING.exec(name)
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    m
      ? m[1] + String(Number(m[2]) + i).padStart(m[2].length, '0')
      : i === 0
        ? name
        : `${name} ${i + 1}`,
  )
}

/** The network the add box starts on: the rack's when its switches share one, else the header's. */
export function defaultNetwork(
  rackSwitchNetworks: readonly string[],
  headerNetwork?: string,
): { id?: string; why?: 'rack' | 'header' } {
  const rack = new Set(rackSwitchNetworks.filter(Boolean))
  if (rack.size === 1) return { id: [...rack][0], why: 'rack' }
  if (headerNetwork) return { id: headerNetwork, why: 'header' }
  return {}
}

// ------------------------------------------------------------------ renaming

const same = (a: string | undefined, b: string) =>
  (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()

/** The switches whose Model detail is the old name (trimmed, ignoring case). */
export const renameTargets = (
  equipment: readonly Equipment[],
  oldName: string,
): Equipment[] =>
  oldName.trim() === ''
    ? []
    : equipment.filter((e) => e.kind === 'switch' && same(e.model, oldName))

// ----------------------------------------------------------------- set model

/** What the dialog says when `setModelPlan` is told the ports have no positions. */
export const NO_POSITIONS_NOTE =
  "This switch's ports have no positions, so its face stays one group"

/** A fix of POST /installed/fixes (a port's `name` is part of DirectFixItem). */
export type FixInput = DirectFixItem

export type LineSection = 'details' | 'names' | 'fields' | 'groups' | 'kept'

/**
 * One line of What changes or Left as typed. Names stay their own pieces
 * (never joined for display); `count` is how many values the line fills.
 */
export interface Line {
  section: LineSection
  pieces: TextPiece[]
  count: number
}

export type SetModelPlan =
  | {
      fixes: FixInput[]
      filled: Line[]
      kept: Line[]
      /** The ports have no positions: their face stays one group (NO_POSITIONS_NOTE). */
      noPositions: boolean
    }
  | { error: 'ports' | 'groups'; why: string }

type PortField = 'portType' | 'connector' | 'speed'
const FIELDS: { key: PortField; word: string }[] = [
  { key: 'portType', word: 'type' },
  { key: 'connector', word: 'connector' },
  { key: 'speed', word: 'speed' },
]

const range = (from: number, to: number) =>
  from === to ? `Port ${from}` : `Ports ${from}–${to}`

/** Group sizes of the ports in order, by runs of the same port group. */
function runs(ports: readonly Endpoint[]): number[] {
  const sizes: number[] = []
  let last: number | undefined
  for (const p of ports) {
    const g = p.portGroup ?? 0
    if (sizes.length > 0 && g === last) sizes[sizes.length - 1]++
    else {
      sizes.push(1)
      last = g
    }
  }
  return sizes
}

/**
 * Set model by position (the face's order). Always sets Manufacturer and
 * Model; the ports get only what is empty (blank type, connector, speed; a
 * name equal to "Port n"); a port group only when every port is in one group
 * today and the ports have positions. Anything else that differs is listed
 * in `kept` and left alone.
 */
export function setModelPlan(
  sw: Equipment,
  ports: readonly Endpoint[],
  m: SwitchModel,
): SetModelPlan {
  const total = modelPortCount(m)
  if (ports.length !== total)
    return {
      error: 'ports',
      why: `This switch has ${ports.length} ports; ${m.name} has ${total}.`,
    }
  const ordered = [...ports].sort(comparePorts)
  const noPositions = ordered.some((p) => !((p.position ?? 0) > 0))
  const now = runs(ordered)
  const modelSizes = m.portGroups.map((g) => g.count ?? 0)
  if (
    now.length > 1 &&
    (now.length !== modelSizes.length ||
      now.some((n, i) => n !== modelSizes[i]))
  )
    return {
      error: 'groups',
      why: `its groups are ${modelSizes.join(' + ')}; this switch's are ${now.join(' + ')}`,
    }

  const fixes: FixInput[] = []
  const filled: Line[] = []
  const kept: Line[] = []

  const detailLine = (word: string, old: string | undefined, next: string) => {
    const before = (old ?? '').trim()
    filled.push({
      section: 'details',
      count: 1,
      pieces: [
        { text: `${word}: ` },
        before ? { name: before } : { text: 'empty' },
        { text: ' → ' },
        { name: next },
      ],
    })
  }
  const details: { manufacturer?: string; model?: string } = {}
  const maker = m.manufacturer.trim()
  if (maker && (sw.manufacturer ?? '').trim() !== maker) {
    details.manufacturer = maker
    detailLine('Manufacturer', sw.manufacturer, maker)
  }
  if ((sw.model ?? '').trim() !== m.name) {
    details.model = m.name
    detailLine('Model', sw.model, m.name)
  }
  if (details.manufacturer !== undefined || details.model !== undefined)
    fixes.push({ kind: 'equipment', id: sw.id, details })

  const labels = modelLabels(m)
  const specs = m.portGroups.flatMap((g, gi) =>
    Array.from({ length: g.count ?? 0 }, () => ({ group: gi + 1, g })),
  )
  const regroup = now.length === 1 && !noPositions

  const fillRuns: {
    from: number
    to: number
    sig: string
    text: string
    n: number
  }[] = []
  const groupRuns = new Map<number, { from: number; to: number; n: number }>()

  ordered.forEach((p, i) => {
    const n = i + 1
    const { group, g } = specs[i]
    const fix: FixInput = { kind: 'endpoint', id: p.id }

    const want = labels[i]
    if (p.label !== want) {
      if (p.label === `Port ${p.position || n}`) {
        fix.name = want
        filled.push({
          section: 'names',
          count: 1,
          pieces: [{ name: p.label }, { text: ' → ' }, { name: want }],
        })
      } else
        kept.push({
          section: 'kept',
          count: 1,
          pieces: [
            { name: p.label },
            { text: ' is not renamed; the model says ' },
            { name: want },
            { text: '. Kept.' },
          ],
        })
    }

    const fill: Pick<PortDetails, PortField> = {}
    for (const { key, word } of FIELDS) {
      const wanted = g.details?.[key]
      if (!wanted) continue
      const have = (p[key] ?? '').trim()
      if (!have) (fill as Record<PortField, string>)[key] = wanted
      else if (have.toLowerCase() !== wanted.toLowerCase())
        kept.push({
          section: 'kept',
          count: 1,
          pieces: [
            { name: p.label },
            {
              text: ` ${word} is ${have}; the model says ${wanted}. Kept.`,
            },
          ],
        })
    }
    const filledKeys = FIELDS.filter((f) => fill[f.key] !== undefined)
    if (filledKeys.length > 0) {
      fix.details = fill
      const sig = filledKeys.map((f) => `${f.key}=${fill[f.key]}`).join('|')
      const text = filledKeys.map((f) => fill[f.key]).join(' · ')
      const last = fillRuns.at(-1)
      if (last && last.sig === sig && last.to === n - 1) {
        last.to = n
        last.n += filledKeys.length
      } else fillRuns.push({ from: n, to: n, sig, text, n: filledKeys.length })
    }

    if (regroup && (p.portGroup ?? 0) !== group) {
      fix.portGroup = group
      const r = groupRuns.get(group)
      if (r) {
        r.to = n
        r.n++
      } else groupRuns.set(group, { from: n, to: n, n: 1 })
    }

    if (fix.name !== undefined || fix.details || fix.portGroup !== undefined)
      fixes.push(fix)
  })

  for (const r of fillRuns)
    filled.push({
      section: 'fields',
      count: r.n,
      pieces: [{ text: `${range(r.from, r.to)}: ${r.text}` }],
    })
  for (const [group, r] of groupRuns)
    filled.push({
      section: 'groups',
      count: r.n,
      pieces: [{ text: `${range(r.from, r.to)}: group ${group}` }],
    })
  return { fixes, filled, kept, noPositions }
}
