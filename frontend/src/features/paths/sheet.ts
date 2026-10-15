import type { TextPiece } from '../../shared/textPieces'
import type { Equipment, Network } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { Walk } from './follow'

export type KindTag = 'Access' | 'AGG' | 'BB' | 'Panel' | 'HDF'

/** An equipment name and one of its ports, kept apart so the name can be isolated. */
export interface Spot {
  equipmentId: string
  name: string
  /** A switch port's label, or "front 3C/5" / "rear 2". */
  port: string
}

export interface PlaceItem {
  type: 'place'
  rackId: string
  site: string
  node: string
  rack: string
  /** Absent when the rack has no known node or site. */
  siteId?: string
  nodeId?: string
}

export interface RowItem {
  type: 'row'
  equipmentId: string
  name: string
  tag: KindTag
  unit: number
  /** "start · out 1", "in front 1 → out rear 1", "in 1"… */
  text: string
  /** The port entered ("1", "front 3C/5"); absent on the start row. */
  inPort?: string
  /** The port left; absent on a switch end and on a passive entered and not left. */
  outPort?: string
  /** The endpoint a click opens. */
  endpointId: string
  /** A last passive with nothing after it. */
  stop?: boolean
}

export interface CableItem {
  type: 'cable'
  linkId: string
  /** Absent when the cable has no (or a blank) label. */
  label?: string
  shortId: string
  fullId: string
  /**
   * Site or node: the place that was left. Rack: the rack the cable reaches
   * (same node). Absent when the cable stays in its rack.
   */
  note?: { kind: 'site' | 'node' | 'rack'; name: string }
}

export type SheetItem = PlaceItem | RowItem | CableItem

export interface Sheet {
  title: { from: Spot; to?: Spot }
  counts: { cables: number; passives: number; racks: number }
  /** Network name, only when known. */
  network?: string
  items: SheetItem[]
  /** `at` is absent when no cable is connected; `role` is set for an AGG or BB. */
  end: {
    kind: Walk['end']['kind']
    at?: Spot
    role?: 'aggregation' | 'backbone'
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** "4 cables · 3 passives · 3 racks · network {name}" */
export function metaPieces(sheet: Sheet): TextPiece[] {
  const { cables, passives, racks } = sheet.counts
  const text = [
    plural(cables, 'cable'),
    plural(passives, 'passive'),
    plural(racks, 'rack'),
  ].join(' · ')
  return sheet.network
    ? [{ text: `${text} · network ` }, { name: sheet.network }]
    : [{ text }]
}

/** "leaves {site}", "leaves {node}", "to {rack}, same node" */
export function notePieces(note: NonNullable<CableItem['note']>): TextPiece[] {
  return note.kind === 'rack'
    ? [{ text: 'to ' }, { name: note.name }, { text: ', same node' }]
    : [{ text: 'leaves ' }, { name: note.name }]
}

/** The end line of the plan's table. */
export function endPieces(sheet: Sheet): TextPiece[] {
  const { kind, at, role } = sheet.end
  if (kind === 'none' || !at)
    return [{ text: 'No cable is connected to this port.' }]
  const lead = (text: string): TextPiece[] => [{ text }, { name: at.name }]
  switch (kind) {
    case 'destination':
      return [
        ...lead('Ends at '),
        {
          text: ` · ${at.port}, ${role === 'aggregation' ? 'an AGG' : 'a BB'}.`,
        },
      ]
    case 'switch':
      return [
        ...lead('Ends at another switch, '),
        {
          text: ` · ${at.port}. It does not reach an AGG or BB from here.`,
        },
      ]
    case 'free':
      return [
        ...lead('Ends at a free position: nothing is connected to '),
        { text: ` · ${at.port}.` },
      ]
    default:
      return [...lead('Ends at '), { text: ` · ${at.port}.` }]
  }
}

export function shortId(id: string) {
  return id.length <= 8 ? id : `…${id.slice(-6)}`
}

function kindTag(e: Equipment | undefined): KindTag {
  if (e?.kind === 'panel') return 'Panel'
  if (e?.kind === 'hdf') return 'HDF'
  if (e?.role === 'aggregation') return 'AGG'
  if (e?.role === 'backbone') return 'BB'
  return 'Access'
}

/** A segment is one equipment visit: the endpoint it is entered at, and the one it is left from. */
interface Segment {
  endpoints: string[]
}

export function buildSheet(
  index: SnapshotIndex,
  networks: readonly Network[],
  walk: Walk,
): Sheet {
  const endpoint = (id: string) => index.lookup.endpoints.get(id)
  const equipmentOf = (id: string) =>
    index.equipment.get(endpoint(id)?.equipmentId ?? '')

  /** Switch ports use their label; positions read "front 3C/5" (never the stored label). */
  const spot = (id: string) => {
    const p = endpoint(id)
    if (!p) return id
    if (p.position === undefined || !p.side) return p.label
    const sub = index.lookup.subpanels.get(p.subpanelId ?? '')
    const place = sub
      ? `${sub.row}${sub.column}/${p.position}`
      : `${p.position}`
    return `${p.side} ${place}`
  }
  const spotOf = (id: string): Spot => ({
    equipmentId: endpoint(id)?.equipmentId ?? '',
    name: equipmentOf(id)?.name ?? id,
    port: spot(id),
  })

  // Group the endpoints of the walk by equipment visit: a cable ends a visit.
  const segments: Segment[] = [{ endpoints: [walk.start] }]
  for (const hop of walk.hops) {
    if (hop.kind === 'internal')
      segments[segments.length - 1].endpoints.push(hop.to)
    else segments.push({ endpoints: [hop.to] })
  }

  const placeOf = (equipmentId: string) => {
    const rackId = index.equipment.get(equipmentId)?.rackId ?? ''
    const rack = index.racks.get(rackId)
    const node = index.nodes.get(rack?.nodeId ?? '')
    const site = index.sites.get(node?.siteId ?? '')
    return {
      rackId,
      rack: rack?.name ?? '',
      nodeId: node?.id,
      node: node?.name ?? '',
      siteId: site?.id,
      site: site?.name ?? '',
    }
  }

  const items: SheetItem[] = []
  const racks = new Set<string>()
  let passives = 0
  let previous: ReturnType<typeof placeOf> | undefined
  let cableIndex = 0
  const cableHops = walk.hops.filter((h) => h.kind === 'cable')

  segments.forEach((seg, i) => {
    const first = seg.endpoints[0]
    const last = seg.endpoints[seg.endpoints.length - 1]
    const eq = equipmentOf(first)
    const place = placeOf(eq?.id ?? '')
    const isFirst = i === 0
    const isLast = i === segments.length - 1
    const passive = eq?.kind !== 'switch'

    if (!isFirst) {
      const hop = cableHops[cableIndex++]
      const link = index.cableById.get(hop.linkId)
      const label = link?.label?.trim()
      let note: CableItem['note']
      if (previous && previous.siteId !== place.siteId)
        note = { kind: 'site', name: previous.site }
      else if (previous && previous.nodeId !== place.nodeId)
        note = { kind: 'node', name: previous.node }
      else if (previous && previous.rackId !== place.rackId)
        note = { kind: 'rack', name: place.rack }
      items.push({
        type: 'cable',
        linkId: hop.linkId,
        ...(label ? { label } : {}),
        shortId: shortId(hop.linkId),
        fullId: hop.linkId,
        ...(note ? { note } : {}),
      })
    }
    if (!previous || previous.rackId !== place.rackId)
      items.push({
        type: 'place',
        rackId: place.rackId,
        site: place.site,
        node: place.node,
        rack: place.rack,
        ...(place.siteId ? { siteId: place.siteId } : {}),
        ...(place.nodeId ? { nodeId: place.nodeId } : {}),
      })
    racks.add(place.rackId)
    previous = place

    const stop = passive && isLast && walk.end.kind === 'free'
    let text: string
    if (!passive)
      text = isFirst ? `start · out ${spot(first)}` : `in ${spot(first)}`
    else {
      const body =
        seg.endpoints.length > 1
          ? `in ${spot(first)} → out ${spot(last)}`
          : isFirst
            ? `start · out ${spot(first)}`
            : `in ${spot(first)}`
      text = stop ? `${body} · nothing connected` : body
    }
    if (passive) passives++
    const twoSided = passive && seg.endpoints.length > 1
    const inPort = !isFirst ? spot(first) : undefined
    const outPort = twoSided ? spot(last) : isFirst ? spot(first) : undefined
    items.push({
      type: 'row',
      equipmentId: eq?.id ?? '',
      name: eq?.name ?? first,
      tag: kindTag(eq),
      unit: eq?.unit ?? 0,
      text,
      ...(inPort ? { inPort } : {}),
      ...(outPort ? { outPort } : {}),
      endpointId: first,
      ...(stop ? { stop: true } : {}),
    })
  })

  const counts = { cables: cableHops.length, passives, racks: racks.size }
  const network = networks.find((n) => n.id === walk.networkId)?.name

  const endId = walk.end.endpointId

  return {
    title: {
      from: spotOf(walk.start),
      ...(walk.end.kind === 'none' ? {} : { to: spotOf(endId) }),
    },
    counts,
    ...(network ? { network } : {}),
    items,
    end:
      walk.end.kind === 'none'
        ? { kind: 'none' }
        : {
            kind: walk.end.kind,
            at: spotOf(endId),
            ...(walk.end.kind === 'destination' ? { role: walk.end.role } : {}),
          },
  }
}
