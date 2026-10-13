import type { Plan, Snapshot } from '../../shared/types'
import { plural } from '../physical/text'

export const GROUPS = [
  'Containers added',
  'Equipment added',
  'Moved',
  'Removed',
  'Cables connected',
  'Cables disconnected',
] as const
export type ChangeGroup = (typeof GROUPS)[number]

/** Where a line takes you: the object it is about, when it still has a place. */
export type GoTarget =
  | { kind: 'equipment'; equipmentId: string }
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'container'; siteId?: string; nodeId?: string; rackId?: string }

export interface ChangeLine {
  /** The remove_change key, "<kind>:<id>": the same one Check reports. */
  key: string
  group: ChangeGroup
  /** Names only, never IDs. */
  text: string
  go?: GoTarget
}

const unitRange = (unit: number, height: number) =>
  height > 1 ? `U${unit}–${unit + height - 1}` : `U${unit}`

/**
 * The grouped summary of a plan, in the order Check applies its changes. Names
 * come from the plan's own additions first, then from Installed; nothing here
 * needs the proposed snapshot, so a stale draft (whose proposed topology cannot
 * be built) is described too. Something Installed no longer has is described
 * without its ID.
 */
export function planSummary(plan: Plan, installed: Snapshot): ChangeLine[] {
  const by = <T extends { id: string }>(own: T[] | undefined, base: T[]) => {
    const map = new Map(base.map((x) => [x.id, x]))
    for (const x of own ?? []) map.set(x.id, x)
    return map
  }
  const labels = plan.labels ?? {}
  const sites = by(plan.sites, installed.sites)
  const nodes = by(plan.nodes, installed.nodes)
  const racks = by(plan.racks, installed.racks)
  const equipment = by(plan.equipment, installed.equipment)
  const wasEquipment = new Map(installed.equipment.map((e) => [e.id, e]))
  // Endpoints are only looked up for the few IDs the plan mentions.
  const wanted = new Set<string>()
  for (const l of plan.links)
    if (l.kind !== 'internal') wanted.add(l.a).add(l.b)
  for (const id of plan.removals?.links ?? []) {
    const link = installed.links.find((l) => l.id === id)
    if (link) wanted.add(link.a).add(link.b)
  }
  const endpoints = new Map<string, { equipmentId: string; label: string }>()
  for (const p of installed.endpoints)
    if (wanted.has(p.id)) endpoints.set(p.id, p)
  for (const p of plan.endpoints) endpoints.set(p.id, p)
  const endpointName = (id: string) => {
    const p = endpoints.get(id)
    return p
      ? `${equipment.get(p.equipmentId)?.name ?? labels[p.equipmentId] ?? 'Equipment'} · ${p.label}`
      : (labels[id] ?? 'An endpoint')
  }
  const siteOf = (nodeId: string) => nodes.get(nodeId)?.siteId
  // A name: the live object's, else the one the plan kept, else a plain word.
  const siteName = (id: string) => sites.get(id)?.name ?? labels[id] ?? 'a site'
  const nodeName = (id: string) => nodes.get(id)?.name ?? labels[id] ?? 'a node'
  const rackName = (id: string) => racks.get(id)?.name ?? labels[id] ?? 'a rack'

  const lines: ChangeLine[] = []
  const add = (line: ChangeLine) => lines.push(line)

  for (const s of plan.sites ?? [])
    add({
      key: `add_site:${s.id}`,
      group: 'Containers added',
      text: `Site · ${s.name}`,
      go: { kind: 'container', siteId: s.id },
    })
  for (const n of plan.nodes ?? [])
    add({
      key: `add_node:${n.id}`,
      group: 'Containers added',
      text: `Node · ${n.name} in ${siteName(n.siteId)}`,
      go: { kind: 'container', siteId: n.siteId, nodeId: n.id },
    })
  for (const r of plan.racks ?? [])
    add({
      key: `add_rack:${r.id}`,
      group: 'Containers added',
      text: `Rack · ${r.name} (${r.units}U) in ${nodeName(r.nodeId)}`,
      go: {
        kind: 'container',
        siteId: siteOf(r.nodeId),
        nodeId: r.nodeId,
        rackId: r.id,
      },
    })
  for (const e of plan.equipment) {
    const rows = Math.max(
      0,
      ...plan.subpanels.filter((s) => s.equipmentId === e.id).map((s) => s.row),
    )
    const what =
      e.kind === 'hdf' ? `HDF, ${plural(rows, 'row')}` : `${e.role} ${e.kind}`
    add({
      key: `add_equipment:${e.id}`,
      group: 'Equipment added',
      text: `${e.name} · ${what} · ${rackName(e.rackId)} ${unitRange(e.unit, e.height)}`,
      go: { kind: 'equipment', equipmentId: e.id },
    })
  }
  for (const r of plan.renames ?? []) {
    const added = plan.equipment.find((e) => e.id === r.id)
    add({
      key: `rename_equipment:${r.id}`,
      group: 'Equipment added',
      text: `Rename ${added?.name ?? labels[r.id] ?? 'equipment'} → ${r.name}`,
      go: added ? { kind: 'equipment', equipmentId: r.id } : undefined,
    })
  }
  const placements = [
    ...(plan.placements ?? []),
    ...(plan.updates ?? []).map((u) => ({
      equipmentId: u.id,
      rackId: u.rackId,
      unit: u.unit,
    })),
  ]
  for (const pl of placements) {
    const was = wasEquipment.get(pl.equipmentId)
    const name = equipment.get(pl.equipmentId)?.name ?? labels[pl.equipmentId]
    const to = `${rackName(pl.rackId)} U${pl.unit}`
    // A recorded plan has already moved it, so there is no "from" to show.
    const text =
      plan.status === 'recorded' && name
        ? `${name} · moved to ${to}`
        : was
          ? `${was.name} · ${rackName(was.rackId)} U${was.unit} → ${to}`
          : name
            ? `${name} · now ${to}`
            : `Equipment no longer in Installed · now ${to}`
    add({
      key: `place_equipment:${pl.equipmentId}`,
      group: 'Moved',
      text,
      go: was ? { kind: 'equipment', equipmentId: pl.equipmentId } : undefined,
    })
  }
  const cablesOf = (equipmentId: string) => {
    const own = new Set(
      installed.endpoints
        .filter((p) => p.equipmentId === equipmentId)
        .map((p) => p.id),
    )
    return installed.links.filter(
      (l) => l.kind === 'cable' && (own.has(l.a) || own.has(l.b)),
    ).length
  }
  const removals = plan.removals
  for (const id of removals?.equipment ?? []) {
    const e = wasEquipment.get(id)
    add({
      key: `remove_equipment:${id}`,
      group: 'Removed',
      text: e
        ? `${e.name} with ${plural(cablesOf(id), 'cable')}`
        : (labels[id] ?? 'Equipment no longer in Installed'),
    })
  }
  for (const [kind, ids, label, source] of [
    ['remove_rack', removals?.racks, 'Rack', racks],
    ['remove_node', removals?.nodes, 'Node', nodes],
    ['remove_site', removals?.sites, 'Site', sites],
  ] as const)
    for (const id of ids ?? [])
      add({
        key: `${kind}:${id}`,
        group: 'Removed',
        text: source.has(id)
          ? `${label} · ${(source.get(id) as { name: string }).name}`
          : labels[id]
            ? `${label} · ${labels[id]}`
            : `${label} no longer in Installed`,
      })
  for (const l of plan.links)
    if (l.kind !== 'internal')
      add({
        key: `add_cable:${l.id}`,
        group: 'Cables connected',
        text: `${endpointName(l.a)} ↔ ${endpointName(l.b)}`,
        go: { kind: 'endpoint', endpointId: l.a },
      })
  for (const id of removals?.links ?? []) {
    const link = installed.links.find((l) => l.id === id)
    add({
      key: `remove_cable:${id}`,
      group: 'Cables disconnected',
      text: link
        ? `${endpointName(link.a)} ↔ ${endpointName(link.b)}`
        : (labels[id] ?? 'A cable no longer in Installed'),
    })
  }
  return lines
}

/** The non-empty groups, in the documented order. */
export function groupLines(lines: readonly ChangeLine[]) {
  return GROUPS.map((group) => ({
    group,
    lines: lines.filter((l) => l.group === group),
  })).filter((g) => g.lines.length > 0)
}

/** The line a Check conflict key (or an Undo key) names. */
export const lineForKey = (lines: readonly ChangeLine[], key: string) =>
  lines.find((l) => l.key === key)

/**
 * The toast after Undo or Drop: the change by name, and how many dependent
 * changes went with it (`removed` is the keys the server removed, the named
 * one first).
 */
export function undoMessage(
  lines: readonly ChangeLine[],
  removed: readonly string[],
) {
  const first = removed[0] ? lineForKey(lines, removed[0])?.text : undefined
  const more = removed.length - 1
  return (
    `Undid: ${first ?? 'a change'}` +
    (more > 0 ? ` (also undid ${plural(more, 'dependent change')})` : '')
  )
}
