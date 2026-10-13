import { hasSide } from '../../shared/ports'
import type { Equipment, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { runOf, type RangePair } from '../planning/range'

export type Side = 'front' | 'rear'

/** Where a cable goes: an equipment, and the side for a panel or HDF. */
export interface FarTarget {
  equipmentId: string
  side?: Side
}

export interface RackBranch {
  id: string
  name: string
  units: number
  equipment: Pick<Equipment, 'id' | 'name' | 'kind'>[]
}
export interface NodeBranch {
  id: string
  name: string
  racks: RackBranch[]
}
export interface SiteBranch {
  id: string
  name: string
  nodes: NodeBranch[]
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true })

/**
 * Sites › nodes › racks › equipment, each level by name (numbers in order:
 * Rack 2 before Rack 10), built once per snapshot for the far-end dropdowns.
 * Empty racks and nodes stay, so the dropdowns show the whole place.
 */
export function locationTree(s: Snapshot): SiteBranch[] {
  const inRack = new Map<string, RackBranch['equipment']>()
  for (const e of s.equipment) {
    const list = inRack.get(e.rackId) ?? []
    list.push({ id: e.id, name: e.name, kind: e.kind })
    inRack.set(e.rackId, list)
  }
  return [...s.sites].sort(byName).map((site) => ({
    id: site.id,
    name: site.name,
    nodes: s.nodes
      .filter((n) => n.siteId === site.id)
      .sort(byName)
      .map((node) => ({
        id: node.id,
        name: node.name,
        racks: s.racks
          .filter((r) => r.nodeId === node.id)
          .sort(byName)
          .map((rack) => ({
            id: rack.id,
            name: rack.name,
            units: rack.units,
            equipment: [...(inRack.get(rack.id) ?? [])].sort(byName),
          })),
      })),
  }))
}

/** A place in the tree; '' where a level has nothing chosen. */
export interface Place {
  siteId: string
  nodeId: string
  rackId: string
}

/** What a LocationPicker ends on: an equipment (the patching far end) or a rack (the forms). */
export type PickLevel = 'equipment' | 'rack'

/** `exclude` is a rack in rack mode (Copy rack layout's target) and an equipment in equipment mode (the near end). */
export interface PickRules {
  level: PickLevel
  exclude?: string
}

/** The racks a node offers. */
export function racksOf(node: NodeBranch | undefined, rules: PickRules) {
  const racks = node?.racks ?? []
  return rules.level === 'rack'
    ? racks.filter((r) => r.id !== rules.exclude)
    : racks
}

/** The equipment a rack offers as a far end. */
export function eligibleIn(rack: RackBranch | undefined, rules: PickRules) {
  const all = rack?.equipment ?? []
  return rules.level === 'equipment'
    ? all.filter((e) => e.id !== rules.exclude)
    : all
}

export function findRack(tree: readonly SiteBranch[], place: Place) {
  return tree
    .find((s) => s.id === place.siteId)
    ?.nodes.find((n) => n.id === place.nodeId)
    ?.racks.find((r) => r.id === place.rackId)
}

/** A rack worth landing on: any rack in rack mode, one with equipment to offer otherwise. */
const offers = (rack: RackBranch, rules: PickRules) =>
  rules.level === 'rack' || eligibleIn(rack, rules).length > 0

function firstRack(node: NodeBranch | undefined, rules: PickRules) {
  const racks = racksOf(node, rules)
  return racks.find((r) => offers(r, rules)) ?? racks[0]
}

function firstNode(site: SiteBranch | undefined, rules: PickRules) {
  return (
    site?.nodes.find((n) => racksOf(n, rules).some((r) => offers(r, rules))) ??
    site?.nodes[0]
  )
}

/** Where the user is, for a rack picker with no rack to start at. */
export type Near = { siteId?: string; nodeId?: string }

/**
 * Where the picker starts for `value` (a rack ID in rack mode, an equipment ID
 * otherwise). When it is not in the tree: in rack mode the `near` node (else
 * the near site's first node) with no rack, so a form never adds to a rack
 * nobody chose; failing that, and in equipment mode, the first site and its
 * first node (equipment mode: that node's first rack, as the patching screen
 * always did). Equipment mode ignores `near`.
 */
export function startPlace(
  tree: readonly SiteBranch[],
  value: string | undefined,
  rules: PickRules,
  near?: Near,
): Place {
  for (const site of tree)
    for (const node of site.nodes)
      for (const rack of node.racks)
        if (
          rules.level === 'rack'
            ? rack.id === value
            : rack.equipment.some((e) => e.id === value)
        )
          return { siteId: site.id, nodeId: node.id, rackId: rack.id }
  if (rules.level === 'rack' && near) {
    const inNode = tree.find((s) => s.nodes.some((n) => n.id === near.nodeId))
    if (inNode) return { siteId: inNode.id, nodeId: near.nodeId!, rackId: '' }
    const inSite = tree.find((s) => s.id === near.siteId)
    if (inSite)
      return {
        siteId: inSite.id,
        nodeId: inSite.nodes[0]?.id ?? '',
        rackId: '',
      }
  }
  const site = tree[0]
  const node = site?.nodes[0]
  return {
    siteId: site?.id ?? '',
    nodeId: node?.id ?? '',
    rackId: rules.level === 'rack' ? '' : (node?.racks[0]?.id ?? ''),
  }
}

/** After the user picks a site: its first node with something to offer, and that node's first such rack. */
export function chooseSite(
  tree: readonly SiteBranch[],
  siteId: string,
  rules: PickRules,
): Place {
  const site = tree.find((s) => s.id === siteId)
  const node = firstNode(site, rules)
  return {
    siteId: site?.id ?? '',
    nodeId: node?.id ?? '',
    rackId: firstRack(node, rules)?.id ?? '',
  }
}

/** After the user picks a node: its first rack with something to offer; '' when it has no rack. */
export function chooseNode(
  tree: readonly SiteBranch[],
  siteId: string,
  nodeId: string,
  rules: PickRules,
): Place {
  const node = tree
    .find((s) => s.id === siteId)
    ?.nodes.find((n) => n.id === nodeId)
  return { siteId, nodeId, rackId: firstRack(node, rules)?.id ?? '' }
}

/**
 * The place for a value set from outside (a recent target, Undo, a refetch, the
 * form echoing what the picker reported): the same place when it already shows
 * that value, so the user's Site and Node stay put; else where the value starts.
 */
export function follow(
  tree: readonly SiteBranch[],
  place: Place,
  value: string | undefined,
  rules: PickRules,
  near?: Near,
): Place {
  const shown =
    rules.level === 'rack'
      ? place.rackId === (value ?? '')
      : eligibleIn(findRack(tree, place), rules).some((e) => e.id === value)
  return shown ? place : startPlace(tree, value, rules, near)
}

/** Endpoints of an equipment without a cable. */
export function freeCount(index: SnapshotIndex, equipmentId: string): number {
  return (index.lookup.byEquipment.get(equipmentId) ?? []).filter(
    (p) => !index.cabled.has(p.id),
  ).length
}

const passive = (index: SnapshotIndex, equipmentId: string) =>
  index.equipment.get(equipmentId)?.kind !== 'switch'

/**
 * The side a passive far end starts on: the near jack's side when it is passive
 * too (a rear jack is usually cabled rear to rear), else the side last used for
 * that equipment in this session, else the front. A switch has none.
 */
export function farSide(
  index: SnapshotIndex,
  nearEndpointId: string,
  farEquipmentId: string,
  sides: ReadonlyMap<string, Side>,
): Side | undefined {
  if (!passive(index, farEquipmentId)) return undefined
  const near = index.lookup.endpoints.get(nearEndpointId)
  if (near && hasSide(near)) return near.side
  return sides.get(farEquipmentId) ?? 'front'
}

/**
 * The far end the screen starts on: the last far target of the session (never
 * the near equipment), else equipment with a free endpoint in the near end's
 * node (panels and HDFs first), else the first other equipment.
 */
export function farDefault(
  s: Snapshot,
  index: SnapshotIndex,
  nearEndpointId: string,
  recent: readonly FarTarget[],
  sides: ReadonlyMap<string, Side>,
): FarTarget | undefined {
  const own = index.owner.get(nearEndpointId)
  const last = recent.find(
    (t) => t.equipmentId !== own && index.equipment.has(t.equipmentId),
  )
  if (last)
    return {
      equipmentId: last.equipmentId,
      side: passive(index, last.equipmentId)
        ? (last.side ?? farSide(index, nearEndpointId, last.equipmentId, sides))
        : undefined,
    }
  const node = index.places.get(own ?? '')?.nodeId
  const others = locationTree(s)
    .flatMap((site) => site.nodes)
    .flatMap((n) =>
      n.racks.flatMap((r) => r.equipment.map((e) => [n.id, e] as const)),
    )
    .filter(([, e]) => e.id !== own)
  const near = others
    .filter(([n, e]) => n === node && freeCount(index, e.id) > 0)
    .map(([, e]) => e)
  const pick =
    near.find((e) => e.kind !== 'switch') ?? near[0] ?? others[0]?.[1]
  if (!pick) return undefined
  return {
    equipmentId: pick.id,
    side: farSide(index, nearEndpointId, pick.id, sides),
  }
}

/**
 * The first endpoint of an equipment's side that is not taken, in range order,
 * after `afterId` when given (from the start otherwise). `taken` also covers
 * cables made moments ago, before the refreshed topology arrives.
 */
export function nextFree(
  s: Snapshot,
  equipmentId: string,
  side: Side | undefined,
  taken: (endpointId: string) => boolean,
  afterId?: string,
): string | undefined {
  const run = runOf(s, equipmentId, side)
  const from = afterId ? run.findIndex((e) => e.id === afterId) + 1 : 0
  return run.slice(from).find((e) => !taken(e.id))?.id
}

export interface PairMark {
  /** The pair's number, 1-based, as listed. */
  n: number
  /** Why the pair cannot be made, in names; absent when it can. */
  problem?: string
}

/** Each pair's number on both faceplates, by endpoint. */
export function pairMarks(pairs: readonly RangePair[]): {
  near: Map<string, PairMark>
  far: Map<string, PairMark>
} {
  const near = new Map<string, PairMark>()
  const far = new Map<string, PairMark>()
  for (const p of pairs) {
    const mark = { n: p.n, problem: p.problem }
    if (p.near) near.set(p.near.id, mark)
    if (p.far) far.set(p.far.id, mark)
  }
  return { near, far }
}
