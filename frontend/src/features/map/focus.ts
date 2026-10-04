import type { SnapshotIndex } from './snapshotIndex'

/** A location focus: one site or one node. Presentation only. */
export interface Focus {
  kind: 'site' | 'node'
  id: string
}

export interface OutsideLocation {
  kind: 'node' | 'site' | 'unknown'
  id: string
  name: string
}

/** One real cable that leaves the focus, with both endpoint IDs. */
export interface BoundaryCable {
  linkId: string
  inside: string
  outside: string
  insideEquipmentId: string
  outsideEquipmentId: string
}

/**
 * Every cable from focused equipment to one outside location, summarized. A
 * drawing aid only: it is never a traversal vertex and never sent to the backend.
 */
export interface BoundaryBundle {
  id: string
  location: OutsideLocation
  /** "N cables to <location>". */
  label: string
  /** Every real cable ID, sorted. */
  linkIds: string[]
  cables: BoundaryCable[]
  insideEquipment: string[]
  outsideEquipment: string[]
  /** True while the real neighbor cards are revealed. */
  expanded: boolean
}

export const boundaryId = (
  focus: Focus,
  outside: Pick<OutsideLocation, 'kind' | 'id'>,
) => `boundary:${focus.kind}:${focus.id}|${outside.kind}:${outside.id}`

/** The focus when it exists in this snapshot; a stale focus is ignored. */
export function resolveFocus(
  index: SnapshotIndex,
  focus: Focus | undefined,
): Focus | undefined {
  if (!focus) return undefined
  return (focus.kind === 'node' ? index.nodes : index.sites).has(focus.id)
    ? focus
    : undefined
}

/** Equipment located in the focused site or node; one pass over the equipment. */
export function equipmentInFocus(index: SnapshotIndex, focus: Focus) {
  const result = new Set<string>()
  for (const [id, place] of index.places)
    if ((focus.kind === 'node' ? place.nodeId : place.siteId) === focus.id)
      result.add(id)
  return result
}

function outsideLocation(
  index: SnapshotIndex,
  equipmentId: string,
): OutsideLocation {
  const place = index.places.get(equipmentId)
  const node = index.nodes.get(place?.nodeId ?? '')
  if (node) return { kind: 'node', id: node.id, name: node.name }
  const site = index.sites.get(place?.siteId ?? '')
  if (site) return { kind: 'site', id: site.id, name: site.name }
  return { kind: 'unknown', id: 'unknown', name: 'unknown location' }
}

const plural = (n: number) => `${n} ${n === 1 ? 'cable' : 'cables'}`

export interface FocusInput {
  focus: Focus | undefined
  /** Equipment passing the network filter, before any reveal. */
  passes: ReadonlySet<string>
  /** Equipment a selected route needs; shown regardless of focus and filter. */
  reveal: ReadonlySet<string>
  /** IDs of expanded boundary bundles. */
  expanded: ReadonlySet<string>
}

/**
 * Which cards the map shows under a focus, and the boundary bundles for the
 * cables that leave it. A card must pass both the focus and the filter, except
 * route cards, which are always shown. A cable is summarized when its inside end
 * is shown and its outside end passes the filter but is not itself shown.
 * Expanding a bundle shows its real neighbor cards. One pass over the cables.
 */
export function focusView(
  index: SnapshotIndex,
  input: FocusInput,
): { shown: Set<string>; bundles: BoundaryBundle[] } {
  const { passes, reveal, expanded } = input
  const focus = resolveFocus(index, input.focus)
  if (!focus) return { shown: new Set([...passes, ...reveal]), bundles: [] }

  const inFocus = equipmentInFocus(index, focus)
  const shown = new Set<string>(reveal)
  for (const id of inFocus) if (passes.has(id)) shown.add(id)

  const groups = new Map<
    string,
    { location: OutsideLocation; cables: BoundaryCable[] }
  >()
  for (const l of index.cables) {
    const a = index.owner.get(l.a)
    const b = index.owner.get(l.b)
    if (!a || !b) continue
    const aIn = inFocus.has(a)
    if (aIn === inFocus.has(b)) continue
    const [inside, outside, insideEp, outsideEp] = aIn
      ? [a, b, l.a, l.b]
      : [b, a, l.b, l.a]
    if (!shown.has(inside) || shown.has(outside) || !passes.has(outside))
      continue
    const location = outsideLocation(index, outside)
    const id = boundaryId(focus, location)
    let group = groups.get(id)
    if (!group) groups.set(id, (group = { location, cables: [] }))
    group.cables.push({
      linkId: l.id,
      inside: insideEp,
      outside: outsideEp,
      insideEquipmentId: inside,
      outsideEquipmentId: outside,
    })
  }

  const bundles: BoundaryBundle[] = []
  for (const [id, group] of groups) {
    const cables = group.cables.sort((x, y) => x.linkId.localeCompare(y.linkId))
    const isExpanded = expanded.has(id)
    const outsideEquipment = [
      ...new Set(cables.map((c) => c.outsideEquipmentId)),
    ].sort()
    if (isExpanded) for (const e of outsideEquipment) shown.add(e)
    bundles.push({
      id,
      location: group.location,
      label: `${plural(cables.length)} to ${group.location.name}`,
      linkIds: cables.map((c) => c.linkId),
      cables,
      insideEquipment: [
        ...new Set(cables.map((c) => c.insideEquipmentId)),
      ].sort(),
      outsideEquipment,
      expanded: isExpanded,
    })
  }
  bundles.sort(
    (x, y) =>
      x.location.name.localeCompare(y.location.name) ||
      x.id.localeCompare(y.id),
  )
  return { shown, bundles }
}
