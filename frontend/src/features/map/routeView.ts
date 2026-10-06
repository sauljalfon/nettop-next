import type { Route } from '../../shared/types'
import type { SnapshotIndex } from './snapshotIndex'

/** Width of a map card, and the space left between neighbors for the line. */
export const CARD_WIDTH = 240
export const CARD_GAP = 120

/** Room an outline keeps around its cards; the top holds its label, and a node box encloses a rack box. */
export const NODE_PAD = { side: 24, top: 52, bottom: 24 }
export const RACK_PAD = { side: 10, top: 26, bottom: 10 }

export interface RouteViewCard {
  id: string
  x: number
  y: number
}
export interface RouteViewLine {
  linkId: string
  from: string
  to: string
  /** Circuit network of the cable; empty when unresolved. */
  networkId: string
}
/** A run of consecutive cards in one node (or rack), to be outlined. */
export interface RouteViewRun {
  id: string
  locationId: string
  /** "Site / Node", or the rack name. */
  label: string
  cardIds: string[]
}
export interface RouteViewModel {
  cards: RouteViewCard[]
  lines: RouteViewLine[]
  nodeRuns: RouteViewRun[]
  rackRuns: RouteViewRun[]
}

/** Consecutive cards that share a location ID; cards without one are never grouped. */
function runs(
  cardIds: readonly string[],
  kind: 'node' | 'rack',
  locationOf: (id: string) => string | undefined,
  label: (locationId: string) => string,
  minimum: number,
): RouteViewRun[] {
  const result: RouteViewRun[] = []
  const count = new Map<string, number>()
  let current: { locationId: string; cardIds: string[] } | undefined
  const close = () => {
    if (!current || current.cardIds.length < minimum) return
    const n = count.get(current.locationId) ?? 0
    count.set(current.locationId, n + 1)
    result.push({
      id: `${kind}:${current.locationId}:${n}`,
      locationId: current.locationId,
      label: label(current.locationId),
      cardIds: current.cardIds,
    })
  }
  for (const id of cardIds) {
    const locationId = locationOf(id)
    if (current && locationId === current.locationId) current.cardIds.push(id)
    else {
      close()
      current = locationId ? { locationId, cardIds: [id] } : undefined
    }
  }
  close()
  return result
}

/**
 * The route laid out for the route view: one card per equipment in order of
 * first appearance, left to right in hop order, with each cable hop's line and
 * the node and rack runs to outline. Presentation only: a pure function of the
 * route and the snapshot index, and nothing it returns feeds traversal.
 */
export function routeView(route: Route, index: SnapshotIndex): RouteViewModel {
  const order: string[] = []
  const seen = new Set<string>()
  const visit = (endpointId: string) => {
    const id = index.owner.get(endpointId)
    if (id && !seen.has(id)) {
      seen.add(id)
      order.push(id)
    }
  }
  const lines: RouteViewLine[] = []
  visit(route.start)
  for (const hop of route.hops) {
    visit(hop.from)
    visit(hop.to)
    if (hop.kind !== 'cable') continue
    lines.push({
      linkId: hop.linkId,
      from: index.owner.get(hop.from) ?? '',
      to: index.owner.get(hop.to) ?? '',
      networkId:
        index.circuits.get(hop.from) ?? index.circuits.get(hop.to) ?? '',
    })
  }
  const nodeName = (nodeId: string) => {
    const node = index.nodes.get(nodeId)
    const site = index.sites.get(node?.siteId ?? '')
    return site ? `${site.name} / ${node?.name}` : (node?.name ?? nodeId)
  }
  return {
    cards: order.map((id, i) => ({ id, x: i * (CARD_WIDTH + CARD_GAP), y: 0 })),
    lines,
    nodeRuns: runs(
      order,
      'node',
      (id) => index.places.get(id)?.nodeId,
      nodeName,
      1,
    ),
    rackRuns: runs(
      order,
      'rack',
      (id) => {
        const rackId = index.equipment.get(id)?.rackId
        return rackId && index.racks.has(rackId) ? rackId : undefined
      },
      (rackId) => index.racks.get(rackId)?.name ?? rackId,
      2,
    ),
  }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The box around some cards (their measured rectangles) with the padding of its kind. */
export function outlineRect(
  cards: readonly Rect[],
  pad: { side: number; top: number; bottom: number },
): Rect {
  const left = Math.min(...cards.map((c) => c.x))
  const top = Math.min(...cards.map((c) => c.y))
  const right = Math.max(...cards.map((c) => c.x + c.width))
  const bottom = Math.max(...cards.map((c) => c.y + c.height))
  return {
    x: left - pad.side,
    y: top - pad.top,
    width: right - left + 2 * pad.side,
    height: bottom - top + pad.top + pad.bottom,
  }
}

/** The ID a run's outline has on the canvas. */
export const outlineNodeId = (runId: string) => `outline:${runId}`

export interface OutlineBox {
  /** Canvas ID. */
  id: string
  kind: 'node' | 'rack'
  label: string
  rect: Rect
}

/**
 * The boxes to draw: every node run, then every rack run, each around its
 * cards' rectangles (measured, since a card is as tall as its facets make it).
 * A run with no placed card is skipped.
 */
export function outlineBoxes(
  model: RouteViewModel,
  rectOf: (cardId: string) => Rect | undefined,
): OutlineBox[] {
  const make = (
    kind: 'node' | 'rack',
    list: RouteViewRun[],
    pad: typeof NODE_PAD,
  ): OutlineBox[] =>
    list.flatMap((run) => {
      const cards = run.cardIds
        .map(rectOf)
        .filter((r): r is Rect => r !== undefined)
      if (!cards.length) return []
      return {
        id: outlineNodeId(run.id),
        kind,
        label: run.label,
        rect: outlineRect(cards, pad),
      }
    })
  return [
    ...make('node', model.nodeRuns, NODE_PAD),
    ...make('rack', model.rackRuns, RACK_PAD),
  ]
}

/** Everything the route view fits the canvas to: its cards and all its boxes. */
export const fitIds = (model: RouteViewModel): string[] => [
  ...model.cards.map((c) => c.id),
  ...model.nodeRuns.map((r) => outlineNodeId(r.id)),
  ...model.rackRuns.map((r) => outlineNodeId(r.id)),
]
