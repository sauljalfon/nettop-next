import type {
  BatchCommand,
  Equipment,
  EquipmentInput,
  Snapshot,
} from '../../shared/types'

/** The most copies one Duplicate makes: a batch holds 500 commands, a rack at most 60 units. */
export const MAX_COPIES = 60

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

/** A copy of `source` called `name` at `unit` in `rackId`: kind, role, network, height and size, never cables or details. */
function copyCommand(
  s: Snapshot,
  size: ReadonlyMap<string, number>,
  source: Equipment,
  name: string,
  rackId: string,
  unit: number,
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
    portCount: size.get(source.id) ?? 0,
  }
  if (source.networkId) equipment.networkId = source.networkId
  return { type: 'add_equipment', equipment }
}

/** Ports of a switch, positions of a panel (its front sides), per equipment. */
function sizes(s: Snapshot): Map<string, number> {
  const size = new Map<string, number>()
  for (const e of s.endpoints)
    if (e.side !== 'rear')
      size.set(e.equipmentId, (size.get(e.equipmentId) ?? 0) + 1)
  return size
}

/** What the server says of a switch or panel with this many ports or positions. */
const sizeProblem = (source: Equipment, count: number) =>
  source.kind !== 'hdf' && (count < 1 || count > 48)
    ? 'port count must be between 1 and 48'
    : undefined

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
): CopyLine[] {
  const source = s.equipment.find((e) => e.id === equipmentId)
  const rack = s.racks.find((r) => r.id === rackId)
  if (!source || !rack || count < 1) return []
  const size = sizes(s)
  const names = nextNames(
    source.name,
    count,
    s.equipment.map((e) => e.name),
  )
  const { units } = freeUnits(s, rackId, source.height, count, fromUnit)
  return names.map((name, i) => {
    const unit = units[i]
    if (unit === undefined)
      return {
        n: i + 1,
        name,
        problem: `${rack.name} has no free unit for ${name}`,
      }
    const problem = sizeProblem(source, size.get(source.id) ?? 0)
    return {
      n: i + 1,
      name,
      unit,
      problem,
      command: problem
        ? undefined
        : copyCommand(s, size, source, name, rackId, unit),
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

/** The racks of a snapshot for the trace picker's combobox: "Rack A03 · Building A". */
export function rackItems(s: Snapshot) {
  const nodes = new Map(s.nodes.map((n) => [n.id, n.name]))
  return s.racks.map((r) => {
    const node = nodes.get(r.nodeId) ?? ''
    return {
      value: r.id,
      label: node ? `${r.name} · ${node}` : r.name,
      search: `${r.name} ${node}`,
    }
  })
}
