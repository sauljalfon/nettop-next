import type { Equipment } from '../../shared/types'
import { facetLabel } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { followPort, type Walk } from './follow'

export type PathJack = {
  endpointId: string
  label: string
  side?: 'front' | 'rear'
  selected: boolean
}
export type PathPlate = {
  kind: 'plate'
  equipmentId: string
  name: string
  equipmentKind: Equipment['kind']
  role: Equipment['role']
  rackId?: string
  /** Site, node and rack names, as index.locationParts gives them. */
  place: string[]
  /** One jack, or two for a panel or HDF position, in path order. */
  jacks: PathJack[]
  /** The plate holding the selected endpoint. */
  here: boolean
  destination?: 'aggregation' | 'backbone'
  proposed: boolean
}
export type PathCable = {
  kind: 'cable'
  linkId: string
  networkId?: string
  proposed: boolean
}
/** Nothing connected on that side. */
export type PathGap = { kind: 'gap' }
export type PathStep = PathPlate | PathCable | PathGap
type Installed = {
  equipment: ReadonlySet<string>
  links: ReadonlySet<string>
}

function jackOf(index: SnapshotIndex, id: string, selected = false): PathJack {
  const p = index.lookup.endpoints.get(id)
  return {
    endpointId: id,
    label: p ? facetLabel(index.lookup, p) : id,
    ...(p?.side ? { side: p.side } : {}),
    selected,
  }
}

function plateOf(
  index: SnapshotIndex,
  installed: Installed | undefined,
  jacks: PathJack[],
  here: boolean,
  destination?: 'aggregation' | 'backbone',
): PathPlate {
  const equipmentId = index.owner.get(jacks[0].endpointId) ?? ''
  const e = index.equipment.get(equipmentId)
  return {
    kind: 'plate',
    equipmentId,
    name: e?.name ?? equipmentId,
    equipmentKind: e?.kind ?? 'switch',
    role: e?.role ?? 'none',
    ...(e?.rackId ? { rackId: e.rackId } : {}),
    place: index.locationParts.get(equipmentId) ?? [],
    jacks,
    here,
    ...(destination ? { destination } : {}),
    proposed: installed ? !installed.equipment.has(equipmentId) : false,
  }
}

/** The start plate of a line: its jacks in path order, the first one selected. */
export function startPlate(
  index: SnapshotIndex,
  endpointIds: string[],
  installed?: Installed,
): PathPlate {
  return plateOf(
    index,
    installed,
    endpointIds.map((id, i) => jackOf(index, id, i === 0)),
    true,
  )
}

/**
 * A walk as cable, plate, cable, plate… in walking direction, after the
 * `start` plate (not part of the result). A plate whose jacks were already
 * placed (`seen`, which starts with the start plate's jacks) ends the line.
 * Pass `seen` to share it between two walks of one line.
 */
export function stepsOfWalk(
  index: SnapshotIndex,
  walk: Walk,
  start: PathPlate,
  installed?: Installed,
  seen: Set<string> = new Set(start.jacks.map((j) => j.endpointId)),
): { steps: PathStep[]; cables: number } {
  const networkOf = (from: string, to: string) =>
    index.circuits.get(from) ??
    index.circuits.get(to) ??
    index.equipment.get(index.owner.get(from) ?? '')?.networkId ??
    index.equipment.get(index.owner.get(to) ?? '')?.networkId

  const out: PathStep[] = []
  const { hops } = walk
  let truncated = false
  for (let i = 0; i < hops.length;) {
    const hop = hops[i]
    const next = hops[i + 1]
    const ids = next?.kind === 'internal' ? [hop.to, next.to] : [hop.to]
    i += ids.length
    if (ids.some((id) => seen.has(id))) {
      truncated = true
      break
    }
    ids.forEach((id) => seen.add(id))
    const destination =
      walk.end.kind === 'destination' && walk.end.endpointId === hop.to
        ? walk.end.role
        : undefined
    out.push(
      {
        kind: 'cable',
        linkId: hop.linkId,
        networkId: networkOf(hop.from, hop.to),
        proposed: installed ? !installed.links.has(hop.linkId) : false,
      },
      plateOf(
        index,
        installed,
        ids.map((id) => jackOf(index, id)),
        false,
        destination,
      ),
    )
  }
  const last = walk.end.endpointId
  if (
    !truncated &&
    (walk.end.kind === 'none' ||
      (walk.end.kind === 'free' && !index.cableByEndpoint.has(last)))
  )
    out.push({ kind: 'gap' })
  return {
    steps: out,
    cables: out.filter((s) => s.kind === 'cable').length,
  }
}

/**
 * The path through one endpoint as a line of plates and cables, built only
 * from stored cables and bridges through `followPort`; nothing is inferred.
 *
 * Rule: a switch port (or any endpoint with no stored bridge) is the first
 * plate and its walk runs to the right. A panel or HDF position sits in the
 * middle: the walk from the selected side, reversed, leads left; the walk from
 * its bridge peer leads right; the selected jack is the left one. Plates and
 * cables alternate; a gap appears only at an end, where nothing is connected.
 * A plate whose jacks were already placed ends the line (a loop in bad data).
 *
 * A jack's label is `facetLabel` (the position of a panel or HDF, "3C / 5",
 * the port label of a switch), the same text the rest of the page shows.
 * A cable's network is the circuit's network where the index has one for
 * either end, else the network of the equipment at that end.
 */
export function pathLine(
  index: SnapshotIndex,
  endpointId: string,
  installed?: Installed,
): { steps: PathStep[]; cables: number } {
  const seen = new Set<string>()
  const peer = index.bridgeByEndpoint.get(endpointId)?.otherEndpointId
  const owner = index.equipment.get(index.owner.get(endpointId) ?? '')
  const bridged = peer !== undefined && owner?.kind !== 'switch'
  seen.add(endpointId)
  if (peer !== undefined && bridged) seen.add(peer)
  const walkFrom = (id: string, from: PathPlate) =>
    stepsOfWalk(index, followPort(index, id), from, installed, seen).steps

  let steps: PathStep[]
  if (!bridged) {
    const here = startPlate(index, [endpointId], installed)
    steps = [here, ...walkFrom(endpointId, here)]
  } else {
    const here = startPlate(index, [endpointId, peer], installed)
    const left = walkFrom(endpointId, here)
      .reverse()
      .map((s) =>
        s.kind === 'plate' ? { ...s, jacks: [...s.jacks].reverse() } : s,
      )
    steps = [...left, here, ...walkFrom(peer, here)]
  }
  return {
    steps,
    cables: steps.filter((s) => s.kind === 'cable').length,
  }
}
