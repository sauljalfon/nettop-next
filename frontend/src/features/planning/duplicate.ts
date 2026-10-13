import { comparePorts, hasSide } from '../../shared/ports'
import type {
  BatchCommand,
  Endpoint,
  Equipment,
  EquipmentInput,
  PortGroupInput,
  Snapshot,
} from '../../shared/types'

/** The most copies one Duplicate makes: a batch holds 500 commands, a rack at most 60 units. */
export const MAX_COPIES = 60

/** The longest name the server accepts. */
const MAX_NAME = 100

/** One line of a Duplicate or Copy rack layout preview. */
export interface CopyLine {
  /** 1-based, as listed. */
  n: number
  /** The new equipment's name. */
  name: string
  /** The unit it would take (absent when no unit is free). */
  unit?: number
  /** Copy rack layout: the name of the equipment this line copies. */
  sourceName?: string
  /** Why this line cannot be made, in names and in the server's words. */
  problem?: string
  /** The add_equipment or add_hdf that makes it; absent when blocked. */
  command?: BatchCommand
}

/**
 * The next `n` names after `name`: its trailing number counted up with its
 * zero padding kept (EDGE-18 → EDGE-19, AGG-08 → AGG-09), or "-2", "-3"…
 * after a name without one. Names in `taken` are skipped, ignoring case as the
 * server does.
 */
export function nextNames(
  name: string,
  n: number,
  taken: Iterable<string>,
): string[] {
  const used = new Set([...taken].map((t) => t.toLowerCase()))
  const match = name.match(/^(.*?)(\d+)$/)
  const names: string[] = []
  let counter = match ? Number(match[2]) : 1
  const make = (k: number) =>
    match ? match[1] + String(k).padStart(match[2].length, '0') : `${name}-${k}`
  while (names.length < n) {
    counter++
    const candidate = make(counter)
    if (used.has(candidate.toLowerCase())) continue
    used.add(candidate.toLowerCase())
    names.push(candidate)
  }
  return names
}

/**
 * The next `n` positions in a rack where equipment of `height` fits without
 * overlap, going up from `fromUnit` and then wrapping to the bottom of the
 * rack (so the whole rack is searched); `shortfall` is how many did not fit. Each
 * chosen position counts as taken for the next.
 */
export function freeUnits(
  s: Snapshot,
  rackId: string,
  height: number,
  n: number,
  fromUnit: number,
): { units: number[]; shortfall: number } {
  const rack = s.racks.find((r) => r.id === rackId)
  const top = rack?.units ?? 0
  const taken = new Set<number>()
  for (const e of s.equipment)
    if (e.rackId === rackId)
      for (let u = e.unit; u < e.unit + e.height; u++) taken.add(u)
  const units: number[] = []
  const start = Math.min(Math.max(1, fromUnit), Math.max(1, top))
  // Upward from `fromUnit` first, then from the bottom up to just below it.
  const order = [
    ...Array.from(
      { length: Math.max(0, top - start + 1) },
      (_, i) => start + i,
    ),
    ...Array.from({ length: start - 1 }, (_, i) => 1 + i),
  ]
  for (const u of order) {
    if (units.length >= n) break
    if (u + height - 1 > top) continue
    let fits = true
    for (let k = u; k < u + height; k++) if (taken.has(k)) fits = false
    if (!fits) continue
    units.push(u)
    for (let k = u; k < u + height; k++) taken.add(k)
  }
  return { units, shortfall: n - units.length }
}

const unitsWord = (n: number) => (n === 1 ? '1 unit' : `${n} units`)

/** What Duplicate lets the user change before sending. */
export interface DuplicateOverrides {
  /** By copy index; a blank (after trim) keeps the counted-up name. */
  names?: readonly string[]
  /** Switches only; blank keeps the source's network. */
  networkId?: string
  /** By the source's port group index; replaces that group's portType/connector/speed ('' = not set). */
  groups?: readonly GroupDetails[]
}

/** A port group's type, connector and speed as the Duplicate form holds them; '' is not set. */
export interface GroupDetails {
  portType: '' | 'copper' | 'fiber'
  connector: string
  speed: string
}

/** A copy of `source` called `name` at `unit` in `rackId`: kind, role, network, height and size, never cables or details. */
function copyCommand(
  s: Snapshot,
  size: ReadonlyMap<string, number>,
  source: Equipment,
  name: string,
  rackId: string,
  unit: number,
  overrides: Pick<DuplicateOverrides, 'networkId' | 'groups'> = {},
): BatchCommand {
  if (source.kind === 'hdf') {
    const rows = Math.max(
      1,
      ...s.subpanels
        .filter((p) => p.equipmentId === source.id)
        .map((p) => p.row),
    )
    return {
      type: 'add_hdf',
      hdf: { name, rackId, unit, height: source.height, rows },
    }
  }
  const equipment: EquipmentInput = {
    name,
    kind: source.kind,
    role: source.role as EquipmentInput['role'],
    rackId,
    unit,
    height: source.height,
  }
  const groups = source.kind === 'switch' ? portGroupsOf(s, source.id) : []
  // A switch made with port groups is copied with them (the labels as they are,
  // in order, and each group's type, connector and speed); any other switch, and
  // a panel, by its count.
  if (groups.length > 0)
    equipment.portGroups = groups.map((g, i) => {
      const given = overrides.groups?.[i]
      return given ? { labels: g.labels, ...detailsOf(given) } : g
    })
  else equipment.portCount = size.get(source.id) ?? 0
  const networkId =
    source.kind === 'switch' && overrides.networkId?.trim()
      ? overrides.networkId.trim()
      : source.networkId
  if (networkId) equipment.networkId = networkId
  return { type: 'add_equipment', equipment }
}

/** `{ details }` with the fields that are set (trimmed), or nothing. */
function detailsOf(d: GroupDetails): { details?: PortGroupInput['details'] } {
  const details: NonNullable<PortGroupInput['details']> = {}
  if (d.portType) details.portType = d.portType
  if (d.connector.trim()) details.connector = d.connector.trim()
  if (d.speed.trim()) details.speed = d.speed.trim()
  return Object.keys(details).length > 0 ? { details } : {}
}

/**
 * A switch's port groups as add_equipment takes them: each group's labels as
 * they are, in position order, with the portType, connector and speed of its
 * first port. Empty for a switch saved before groups (its ports have no
 * group). Never a serial number, state, description or any other detail.
 */
function portGroupsOf(s: Snapshot, equipmentId: string): PortGroupInput[] {
  const ports = s.endpoints
    .filter((p) => p.equipmentId === equipmentId && !hasSide(p))
    .sort(comparePorts)
  if (ports.length === 0 || ports.some((p) => !p.portGroup)) return []
  const groups: { first: Endpoint; labels: string[] }[] = []
  for (const p of ports) {
    const last = groups.at(-1)
    if (last && last.first.portGroup === p.portGroup) last.labels.push(p.label)
    else groups.push({ first: p, labels: [p.label] })
  }
  return groups.map(({ first, labels }) => {
    const details: PortGroupInput['details'] = {}
    if (first.portType) details.portType = first.portType
    if (first.connector) details.connector = first.connector
    if (first.speed) details.speed = first.speed
    return Object.keys(details).length > 0 ? { labels, details } : { labels }
  })
}

/**
 * The port groups of a switch made with groups, for the Duplicate form: a
 * caption ("Gi1/0/1–Gi1/0/24 (24)", or just the label for a group of one), the
 * count and the type, connector and speed of the group's first port ('' when
 * not set). Empty for a switch without groups, a panel and an HDF.
 */
export function sourceGroups(
  s: Snapshot,
  equipmentId: string,
): {
  caption: string
  first: string
  last: string
  count: number
  details: GroupDetails
}[] {
  const source = s.equipment.find((e) => e.id === equipmentId)
  if (source?.kind !== 'switch') return []
  return portGroupsOf(s, equipmentId).map((g) => {
    const labels = g.labels ?? []
    const d = g.details ?? {}
    return {
      first: labels[0],
      last: labels[labels.length - 1],
      caption:
        labels.length === 1
          ? labels[0]
          : `${labels[0]}–${labels[labels.length - 1]} (${labels.length})`,
      count: labels.length,
      details: {
        portType: d.portType ?? '',
        connector: d.connector ?? '',
        speed: d.speed ?? '',
      },
    }
  })
}

/**
 * One line for what each copy will have, from the groups as they will be made:
 * "Each copy: 28 ports · Gi1/0/1 … Gi1/0/24 copper RJ45 1G, Te1/1/1 … Te1/1/4
 * fiber SFP+ 10G". Each group is its first and last label ("first … last"; a
 * group of one is its label), then its type, connector and speed, leaving out
 * what is not set. "1 port" for one; '' for no groups.
 */
export function copySummary(
  groups: readonly {
    first: string
    last: string
    count: number
    details: GroupDetails
  }[],
): string {
  if (groups.length === 0) return ''
  const total = groups.reduce((n, g) => n + g.count, 0)
  const parts = groups.map((g) => {
    const range = g.count === 1 ? g.first : `${g.first} … ${g.last}`
    const { portType, connector, speed } = g.details
    return [range, portType, connector.trim(), speed.trim()]
      .filter(Boolean)
      .join(' ')
  })
  return `Each copy: ${total} port${total === 1 ? '' : 's'} · ${parts.join(', ')}`
}

/** Ports of a switch, positions of a panel (its front sides), per equipment. */
function sizes(s: Snapshot): Map<string, number> {
  const size = new Map<string, number>()
  for (const e of s.endpoints)
    if (e.side !== 'rear')
      size.set(e.equipmentId, (size.get(e.equipmentId) ?? 0) + 1)
  return size
}

/** What the server says of a switch (1–96 ports) or panel (1–48 positions) of this size. */
const sizeProblem = (source: Equipment, count: number) => {
  if (source.kind === 'hdf') return undefined
  const most = source.kind === 'switch' ? 96 : 48
  return count < 1 || count > most
    ? `port count must be between 1 and ${most}`
    : undefined
}

/**
 * "N more like <name>": `count` copies into the next free units of `rackId`
 * from `fromUnit`, named by counting up. A line with no free unit says so.
 */
export function duplicateLines(
  s: Snapshot,
  equipmentId: string,
  count: number,
  rackId: string,
  fromUnit: number,
  overrides: DuplicateOverrides = {},
): CopyLine[] {
  const source = s.equipment.find((e) => e.id === equipmentId)
  const rack = s.racks.find((r) => r.id === rackId)
  if (!source || !rack || count < 1) return []
  const size = sizes(s)
  const defaults = nextNames(
    source.name,
    count,
    s.equipment.map((e) => e.name),
  )
  // A blank keeps the counted-up name; anything else is used as typed (trimmed).
  const names = defaults.map((d, i) => overrides.names?.[i]?.trim() || d)
  const existing = new Set(s.equipment.map((e) => e.name.toLowerCase()))
  const uses = new Map<string, number>()
  for (const n of names)
    uses.set(n.toLowerCase(), (uses.get(n.toLowerCase()) ?? 0) + 1)
  const nameProblem = (name: string) =>
    name.length > MAX_NAME
      ? `Names are at most ${MAX_NAME} characters`
      : existing.has(name.toLowerCase())
        ? `${name} is already the name of other equipment`
        : (uses.get(name.toLowerCase()) ?? 0) > 1
          ? `${name} is used twice`
          : undefined
  const { units } = freeUnits(s, rackId, source.height, count, fromUnit)
  return names.map((name, i) => {
    const unit = units[i]
    if (unit === undefined)
      return {
        n: i + 1,
        name,
        problem: `${rack.name} has no free unit for ${name}`,
      }
    const problem =
      nameProblem(name) ?? sizeProblem(source, size.get(source.id) ?? 0)
    return {
      n: i + 1,
      name,
      unit,
      problem,
      command: problem
        ? undefined
        : copyCommand(s, size, source, name, rackId, unit, overrides),
    }
  })
}

/**
 * Copy rack layout: one copy of each piece of equipment of the source rack at
 * the same unit in the target, with new names. `problem` refuses the whole
 * copy (the same rack, a target that is not empty, a source with nothing in
 * it); a line that does not fit the target says so in the server's words.
 */
export function copyLayout(
  s: Snapshot,
  sourceRackId: string,
  targetRackId: string,
): { lines: CopyLine[]; problem?: string } {
  const source = s.racks.find((r) => r.id === sourceRackId)
  const target = s.racks.find((r) => r.id === targetRackId)
  if (!source || !target) return { lines: [] }
  if (source.id === target.id)
    return { lines: [], problem: 'Choose another rack to copy into' }
  const items = s.equipment
    .filter((e) => e.rackId === source.id)
    .sort((a, b) => a.unit - b.unit)
  if (items.length === 0)
    return { lines: [], problem: `${source.name} has no equipment to copy` }
  const notEmpty = s.equipment.some((e) => e.rackId === target.id)
  const size = sizes(s)
  const taken = s.equipment.map((e) => e.name)
  const lines = items.map((item, i): CopyLine => {
    const [name] = nextNames(item.name, 1, taken)
    taken.push(name)
    const base = { n: i + 1, name, unit: item.unit, sourceName: item.name }
    const fits = item.unit + item.height - 1 <= target.units
    const problem = fits
      ? sizeProblem(item, size.get(item.id) ?? 0)
      : `${target.name} has units 1–${target.units}; ${unitsWord(item.height)} from U${item.unit} ${item.height === 1 ? 'does' : 'do'} not fit`
    return {
      ...base,
      problem,
      command: problem
        ? undefined
        : copyCommand(s, size, item, name, target.id, item.unit),
    }
  })
  return notEmpty
    ? { lines, problem: `${target.name} is not empty` }
    : { lines }
}
