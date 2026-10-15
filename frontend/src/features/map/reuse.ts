import type { MapCardData, MapFlowEdge } from './mapGraph'

/**
 * The fields the comparisons below read, so a test can tell when the projection
 * gains one they do not (a changed value in it would then never redraw).
 */
export const CARD_FIELDS = [
  'equipment',
  'location',
  'place',
  'summary',
  'badges',
  'badgeColors',
  'facets',
  'manualKeys',
  'highlighted',
  'highlightRole',
  'dimmed',
  'proposed',
] as const
export const FACET_FIELDS = [
  'key',
  'equipmentId',
  'label',
  'endpointIds',
  'frontEndpointId',
  'rearEndpointId',
  'bridgeLinkId',
  'automatic',
  'manual',
] as const
export const EDGE_FIELDS = [
  'id',
  'source',
  'target',
  'sourceHandle',
  'targetHandle',
  'label',
  'data',
] as const
export const EDGE_DATA_FIELDS = [
  'linkIds',
  'highlighted',
  'highlight',
  'dimmed',
  'proposed',
  'networkId',
  'color',
  'width',
  'count',
  'pairKey',
  'split',
  'splitIndex',
  'splitCount',
] as const

const sameList = <T>(
  a: readonly T[],
  b: readonly T[],
  same: (x: T, y: T) => boolean = Object.is,
) => a.length === b.length && a.every((x, i) => same(x, b[i]))

/**
 * Whether two projections of one card draw the same thing. The projection builds
 * fresh arrays and objects on every run; this compares what they hold, so a
 * route change can leave every card it does not touch as the very same object
 * (and React and React Flow skip it).
 */
export function sameCardData(a: MapCardData, b: MapCardData): boolean {
  return (
    a.equipment === b.equipment &&
    a.location === b.location &&
    sameList(a.place, b.place) &&
    a.summary.cabled === b.summary.cabled &&
    a.summary.total === b.summary.total &&
    a.highlighted === b.highlighted &&
    a.highlightRole === b.highlightRole &&
    a.dimmed === b.dimmed &&
    a.proposed === b.proposed &&
    sameList(a.badges, b.badges) &&
    sameList(a.badgeColors, b.badgeColors) &&
    sameList(a.manualKeys, b.manualKeys) &&
    sameList(
      a.facets,
      b.facets,
      (x, y) =>
        x.key === y.key &&
        x.equipmentId === y.equipmentId &&
        x.label === y.label &&
        x.automatic === y.automatic &&
        x.manual === y.manual &&
        x.frontEndpointId === y.frontEndpointId &&
        x.rearEndpointId === y.rearEndpointId &&
        x.bridgeLinkId === y.bridgeLinkId &&
        sameList(x.endpointIds, y.endpointIds),
    )
  )
}

/** Whether two projections of one line draw the same thing. */
export function sameEdge(a: MapFlowEdge, b: MapFlowEdge): boolean {
  const x = a.data
  const y = b.data
  return (
    a.id === b.id &&
    a.source === b.source &&
    a.target === b.target &&
    a.sourceHandle === b.sourceHandle &&
    a.targetHandle === b.targetHandle &&
    a.label === b.label &&
    sameList(x.linkIds, y.linkIds) &&
    x.highlighted === y.highlighted &&
    x.highlight === y.highlight &&
    x.dimmed === y.dimmed &&
    x.proposed === y.proposed &&
    x.networkId === y.networkId &&
    x.color === y.color &&
    x.width === y.width &&
    x.count === y.count &&
    x.pairKey === y.pairKey &&
    x.split === y.split &&
    x.splitIndex === y.splitIndex &&
    x.splitCount === y.splitCount
  )
}

/** Each item of `next`, replaced by its previous object (same ID) when `same` says nothing changed. */
export function reuseById<T extends { id: string }>(
  previous: ReadonlyMap<string, T>,
  next: readonly T[],
  same: (a: T, b: T) => boolean,
): T[] {
  return next.map((n) => {
    const prior = previous.get(n.id)
    return prior && same(prior, n) ? prior : n
  })
}
