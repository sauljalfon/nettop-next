import { isPassiveEquipment } from '../../shared/equipment'
import type { Equipment, Link, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { plural } from '../physical/text'

/** One complete circuit: the two active endpoints a cable lies on, access end first. */
export interface Circuit {
  /** Endpoint IDs of the two active ends; the access end is first when there is one. */
  ends: [string, string]
  /** "EDGE-17 port 1 → AGG-03 port 1". */
  label: string
}

/** Each position's other side, from the bridges. Built once per snapshot. */
const bridgeCache = new WeakMap<readonly Link[], ReadonlyMap<string, string>>()
function bridges(s: Snapshot): ReadonlyMap<string, string> {
  let map = bridgeCache.get(s.links)
  if (!map) {
    map = new Map(
      s.links.flatMap((l) =>
        l.kind === 'internal'
          ? ([
              [l.a, l.b],
              [l.b, l.a],
            ] as const)
          : [],
      ),
    )
    bridgeCache.set(s.links, map)
  }
  return map
}

/**
 * From `start`, away from the cable it came by: the active endpoint reached
 * through passive continuity only (a panel or HDF position's other side, then
 * the cable on it, and so on). Sibling ports on a device are never crossed. A
 * dead end (a free side, or a position without a bridge) has no circuit.
 */
function walk(
  s: Snapshot,
  index: SnapshotIndex,
  start: string,
): string | undefined {
  const bridge = bridges(s)
  const seen = new Set<string>()
  let at: string | undefined = start
  while (at && !seen.has(at)) {
    seen.add(at)
    const owner = index.equipment.get(index.owner.get(at) ?? '')
    if (!owner) return undefined
    if (!isPassiveEquipment(owner)) return at
    const mirror = bridge.get(at)
    if (!mirror) return undefined
    at = index.cableByEndpoint.get(mirror)?.farEndpointId
  }
  return undefined
}

/** Endpoint labels by ID, built once per snapshot (a find per circuit would scan every endpoint). */
const labelCache = new WeakMap<
  readonly Snapshot['endpoints'][number][],
  ReadonlyMap<string, string>
>()
function labels(s: Snapshot) {
  let map = labelCache.get(s.endpoints)
  if (!map) {
    map = new Map(s.endpoints.map((p) => [p.id, p.label]))
    labelCache.set(s.endpoints, map)
  }
  return map
}

/** "EDGE-17 port 1": the equipment name and the active endpoint's own label. */
function endLabel(s: Snapshot, index: SnapshotIndex, id: string) {
  const equipment = index.equipment.get(index.owner.get(id) ?? '')
  const label = labels(s).get(id) ?? id
  return `${equipment?.name ?? ''} ${label.toLowerCase()}`.trim()
}

/**
 * The circuits cut by removing these cables: for each cable, both ways through
 * passive continuity to an active endpoint. A cable with a dead end on either
 * side cuts no circuit. The access end comes first and duplicates (two cables of
 * one circuit) are removed.
 */
export function circuitsCut(
  s: Snapshot,
  index: SnapshotIndex,
  cableIds: readonly string[],
): Circuit[] {
  const links = new Map(index.cables.map((l) => [l.id, l]))
  const roleOf = (endpointId: string) =>
    index.equipment.get(index.owner.get(endpointId) ?? '')?.role
  const found = new Map<string, Circuit>()
  for (const id of cableIds) {
    const link = links.get(id)
    if (!link) continue
    let x = walk(s, index, link.a)
    let y = walk(s, index, link.b)
    if (!x || !y) continue
    if (roleOf(y) === 'access' && roleOf(x) !== 'access') [x, y] = [y, x]
    const key = [x, y].sort().join('|')
    if (!found.has(key))
      found.set(key, {
        ends: [x, y],
        label: `${endLabel(s, index, x)} → ${endLabel(s, index, y)}`,
      })
  }
  return [...found.values()]
}

/** What deleting one equipment removes and cuts. Computed once per request. */
export interface EquipmentDeletePreview {
  equipment: Equipment
  endpointCount: number
  /** Every cable on its endpoints, by ID. */
  cableIds: string[]
  circuits: Circuit[]
}

export function equipmentDeletePreview(
  s: Snapshot,
  index: SnapshotIndex,
  equipmentId: string,
): EquipmentDeletePreview | undefined {
  const equipment = index.equipment.get(equipmentId)
  if (!equipment) return undefined
  const cables = new Set<string>()
  let endpointCount = 0
  for (const p of s.endpoints) {
    if (p.equipmentId !== equipmentId) continue
    endpointCount++
    const cable = index.cableByEndpoint.get(p.id)
    if (cable) cables.add(cable.linkId)
  }
  const cableIds = [...cables].sort()
  return {
    equipment,
    endpointCount,
    cableIds,
    circuits: circuitsCut(s, index, cableIds),
  }
}

const SHOWN_CABLES = 8

/** The confirm's words for deleting equipment (the same in the inspector and on the equipment page). */
export function deleteLines(p: EquipmentDeletePreview, proposed: boolean) {
  const name = p.equipment.name
  const unit =
    p.equipment.kind === 'switch'
      ? p.endpointCount === 1
        ? 'port'
        : 'ports'
      : p.endpointCount === 1
        ? 'position'
        : 'positions'
  const bridges =
    p.equipment.kind === 'switch' ? '' : ' and their front/rear bridges'
  const shown = p.cableIds.slice(0, SHOWN_CABLES).join(', ')
  const more =
    p.cableIds.length > SHOWN_CABLES
      ? `, and ${p.cableIds.length - SHOWN_CABLES} more`
      : ''
  const cables = p.cableIds.length
    ? ` and ${plural(p.cableIds.length, 'cable')} (${shown}${more})`
    : ''
  const contents = `its ${p.endpointCount} ${unit}${bridges}${cables}`
  return {
    title: `Delete ${name}?`,
    headline: proposed
      ? `${name} is only in this plan, so its addition is dropped, with ${contents}.`
      : `Removes ${name}, ${contents}.`,
    cutsTitle: p.circuits.length
      ? `Cuts ${plural(p.circuits.length, 'circuit')}:`
      : 'No circuit runs through it.',
    circuits: p.circuits.map((c) => c.label),
    footer: proposed
      ? ''
      : 'Installed is unchanged until the plan is recorded.',
  }
}

/** The confirm's words for disconnecting one cable. */
export function disconnectLines(
  s: Snapshot,
  index: SnapshotIndex,
  linkId: string,
  proposed: boolean,
) {
  const circuits = circuitsCut(s, index, [linkId]).map((c) => c.label)
  return {
    title: `Disconnect ${linkId}?`,
    headline: proposed
      ? 'It is only in this plan, so the proposed cable is dropped.'
      : 'The cable is removed in this plan.',
    circuits,
    cuts: circuits.length
      ? `Cuts ${circuits.join('; ')}.`
      : 'No complete circuit runs through it.',
  }
}
