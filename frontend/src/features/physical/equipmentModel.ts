import { hasSide } from '../../shared/ports'
import type { Equipment, Network } from '../../shared/types'
import { facetLabel } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { readableEndpoint } from '../pathfinding/hops'
import { endpointDetail } from './detail'
import {
  fiberPair,
  hdfFace,
  panelFace,
  switchBank,
  type SwitchBankGroup,
  type FaceEndpoint,
  type FaceOptions,
  type HdfBlock,
  type HdfFace,
  type PanelFace,
} from './faces'

export interface CellLook {
  /** What the button is filled with: the circuit network's color (cabled), teal (route), or white. */
  fill: 'route' | 'cabled' | 'free'
  /** The dark ring around the selected endpoint; separate from the fill. */
  selected: boolean
}

/**
 * How an endpoint is drawn: by its state, never by its network ID. A free side
 * stays white even when its position carries a circuit through the bridge.
 */
export function cellLook(cell: FaceEndpoint): CellLook {
  return {
    fill: cell.onRoute ? 'route' : cell.cabled ? 'cabled' : 'free',
    selected: cell.selected,
  }
}

/** A block holding a position of the selected route gets the teal border. */
export const blockOnRoute = (block: HdfBlock) =>
  block.positions.some((p) => p.onRoute)

/**
 * The accessible name of an endpoint button: "HDF-01 3C / 5 rear, cabled,
 * Network A, on selected route". `networkName` is only said for cabled sides.
 */
export function endpointAria(
  equipment: { name: string; kind: Equipment['kind']; side?: 'front' | 'rear' },
  cell: FaceEndpoint,
  networkName: string | undefined,
  /** A switch port's place in the bank (1-based); its own label is used when absent. */
  ordinal?: number,
): string {
  const where =
    equipment.kind === 'switch'
      ? `${equipment.name} port ${ordinal ?? cell.label}`
      : `${equipment.name} ${cell.label} ${equipment.side ?? ''}`.trim()
  const look = cellLook(cell)
  return [
    where,
    cell.cabled ? 'cabled' : 'free',
    cell.cabled ? networkName : undefined,
    cell.onRoute ? 'on selected route' : undefined,
    look.selected ? 'selected' : undefined,
  ]
    .filter(Boolean)
    .join(', ')
}

const ROLE: Record<string, string> = {
  access: 'access',
  aggregation: 'AGG',
  backbone: 'BB',
}

/** The muted line under the equipment's name on the face card. */
export function faceMeta(
  e: Pick<Equipment, 'kind' | 'role' | 'networkId' | 'height'>,
  info: {
    rows?: number
    count?: number
    side?: 'front' | 'rear'
    /** Plain-text location; pages render the parts with PlacePath instead and leave it out. */
    location?: string
    networks: readonly Network[]
  },
): string {
  const showing = info.side ? `showing ${info.side}` : undefined
  const parts =
    e.kind === 'hdf'
      ? [
          'HDF',
          `${info.rows ?? 0} rows × A–D`,
          `${(info.rows ?? 0) * 24} positions`,
          `${e.height}U`,
          showing,
        ]
      : e.kind === 'panel'
        ? ['Panel', `${info.count ?? 0} positions`, `${e.height}U`, showing]
        : [
            'Switch',
            `${info.count ?? 0} ports`,
            `${e.height}U`,
            ROLE[e.role] ?? e.role,
            info.networks.find((n) => n.id === e.networkId)?.name,
          ]
  return [...parts, info.location].filter(Boolean).join(' · ')
}

export interface DetailModel {
  endpointId: string
  equipmentId: string
  equipmentName: string
  /** "HDF-01 3C/5 rear": the equipment and the endpoint's own label. */
  title: string
  /** "3C / 5", "1" or "Port 1": the large label. */
  label: string
  side?: 'front' | 'rear'
  networkName?: string
  networkId?: string
  /** Secondary text for an HDF position only, never its identity. */
  fiberPair?: string
  external?: {
    linkId: string
    farEndpointId: string
    farEquipmentId: string
    farEquipmentName: string
    /** "PANEL-A · 1 rear" */
    farTitle: string
    /** "Site / Node / Rack" */
    farLocation: string
    farPlace: string[]
  }
  internal?: {
    endpointId: string
    side: 'front' | 'rear'
    /** "Switch to front" */
    action: string
    /** The cable on the other side of this position, when it has one. */
    linkId?: string
    farTitle?: string
  }
}

/** Everything the detail panel says about one endpoint, from the per-snapshot index. */
export function detailModel(
  index: SnapshotIndex,
  networks: readonly Network[],
  endpointId: string,
): DetailModel | undefined {
  const d = endpointDetail(index, endpointId)
  const p = index.lookup.endpoints.get(endpointId)
  if (!d || !p) return undefined
  const titleOf = (id: string) => {
    const q = index.lookup.endpoints.get(id)
    const name = index.equipment.get(q?.equipmentId ?? '')?.name ?? ''
    return `${name} · ${q?.label ?? id}`
  }
  const peer = d.internal && endpointDetail(index, d.internal.endpointId)
  return {
    endpointId,
    equipmentId: d.equipmentId,
    equipmentName: d.equipmentName,
    title: `${d.equipmentName} ${p.label}`,
    label: facetLabel(index.lookup, p),
    side: d.side,
    networkName: networks.find((n) => n.id === d.networkId)?.name,
    networkId: d.networkId,
    fiberPair:
      p.subpanelId && p.position !== undefined
        ? fiberPair(p.position)
        : undefined,
    external: d.external && {
      linkId: d.external.linkId,
      farEndpointId: d.external.farEndpointId,
      farEquipmentId: d.external.farEquipmentId,
      farEquipmentName: d.external.farEquipmentName,
      farTitle: titleOf(d.external.farEndpointId),
      farLocation: d.external.farLocation,
      farPlace: d.external.farPlace,
    },
    internal: d.internal && {
      endpointId: d.internal.endpointId,
      side: d.internal.side,
      action: `Switch to ${d.internal.side}`,
      linkId: peer?.external?.linkId,
      farTitle: peer?.external && titleOf(peer.external.farEndpointId),
    },
  }
}

export type Face =
  | {
      kind: 'switch'
      rows: FaceEndpoint[][]
      /** One bank per port group (a switch without groups is one bank). */
      banks: SwitchBankGroup[]
    }
  | { kind: 'panel'; face: PanelFace }
  | { kind: 'hdf'; face: HdfFace }

/** The face to draw for an equipment: its port bank, a panel side, or an HDF side. */
export function faceFor(
  index: SnapshotIndex,
  e: Pick<Equipment, 'id' | 'kind'>,
  side: 'front' | 'rear' | undefined,
  options: FaceOptions,
): Face {
  if (e.kind === 'switch')
    return { kind: 'switch', ...switchBank(index, e.id, options) }
  if (e.kind === 'panel')
    return {
      kind: 'panel',
      face: panelFace(index, e.id, side ?? 'front', options),
    }
  return { kind: 'hdf', face: hdfFace(index, e.id, side ?? 'front', options) }
}

/** `data-face-*` on the explorer's root: the kind, the blocks row-major, and how many positions. */
export function faceMarks(face: Face) {
  if (face.kind === 'switch')
    return {
      kind: 'switch' as const,
      blocks: '',
      positions: face.rows.reduce((n, r) => n + r.length, 0),
    }
  if (face.kind === 'panel')
    return {
      kind: 'panel' as const,
      blocks: '',
      positions: face.face.positions.length,
    }
  return {
    kind: 'hdf' as const,
    blocks: face.face.blocks.map((b) => b.label).join(' '),
    positions: face.face.blocks.reduce((n, b) => n + b.positions.length, 0),
  }
}

/** The network IDs of the cabled endpoints on a face, in the snapshot's network order: one legend swatch each. */
export function legendNetworks(
  face: Face,
  networks: readonly Network[],
): string[] {
  const cells: FaceEndpoint[] =
    face.kind === 'switch'
      ? face.rows.flat()
      : face.kind === 'panel'
        ? face.face.positions
        : face.face.blocks.flatMap((b) => b.positions)
  const present = new Set(
    cells.flatMap((c) => (c.cabled && c.networkId ? [c.networkId] : [])),
  )
  return networks.filter((n) => present.has(n.id)).map((n) => n.id)
}

/**
 * The tooltip of an endpoint: "port 3 · cable-a09 → PANEL-A 3 front", "3C / 5
 * rear · cable-a02 → PANEL-A 1 rear · fiber pair 9,10", or "port 4 · free".
 */
export function endpointTooltip(
  index: SnapshotIndex,
  equipment: Pick<Equipment, 'kind'>,
  cell: FaceEndpoint & { fiberPair?: string },
  ordinal: number | undefined,
  side: 'front' | 'rear' | undefined,
): string {
  const where =
    equipment.kind === 'switch'
      ? `port ${ordinal ?? cell.label}`
      : equipment.kind === 'panel'
        ? `position ${cell.label} ${side ?? ''}`.trim()
        : `${cell.label} ${side ?? ''}`.trim()
  const cable = cell.cable
    ? `${cell.cable.linkId} → ${readableEndpoint(index, cell.cable.farEndpointId).replace(' · ', ' ')}`
    : 'free'
  return [where, cable, cell.fiberPair && `fiber pair ${cell.fiberPair}`]
    .filter(Boolean)
    .join(' · ')
}

export type ChainItem =
  | {
      kind: 'box'
      /** far: this side's far end; self: this endpoint; other: the same position's other side; otherFar: that side's far end; none: no cable. */
      role: 'far' | 'self' | 'other' | 'otherFar' | 'none'
      /** "PANEL-A · 1 rear", "3C / 5 rear", "no cable". */
      title: string
      /** "Site / Node / Rack" of a far end. */
      sub?: string
      /** The same far end's site, node and rack, for rendering. */
      place?: string[]
      endpointId?: string
      /** The side an "other" box switches to. */
      side?: 'front' | 'rear'
      /** What a click does: go to that endpoint (pushes history) or switch to the other side (replaces). */
      action?: 'go' | 'switch'
      onRoute: boolean
    }
  | {
      kind: 'link'
      link: 'cable' | 'bridge'
      /** The cable ID, or "bridge". */
      label: string
      onRoute: boolean
    }

/**
 * The connection of one endpoint drawn top to bottom: this side's far end, the
 * cable, this endpoint, the bridge, the same position's other side, its cable,
 * and that cable's far end. A switch port is only far end, cable and port. A
 * side with no cable is a "no cable" box. Hops of the selected route are marked.
 */
export function connectionChain(
  index: SnapshotIndex,
  networks: readonly Network[],
  endpointId: string,
  marks?: { endpoints: ReadonlySet<string>; links: ReadonlySet<string> },
): ChainItem[] {
  const p = index.lookup.endpoints.get(endpointId)
  const detail = detailModel(index, networks, endpointId)
  if (!p || !detail) return []
  const on = (id?: string) => !!id && !!marks?.endpoints.has(id)
  const onLink = (id?: string) => !!id && !!marks?.links.has(id)
  const place = (id: string) => {
    const q = index.lookup.endpoints.get(id)!
    const label = facetLabel(index.lookup, q)
    return !hasSide(q) ? label : `${label} ${q.side ?? ''}`.trim()
  }
  const farBox = (
    role: 'far' | 'otherFar',
    far: NonNullable<DetailModel['external']> | undefined,
    cableId?: string,
    farId?: string,
  ): ChainItem[] =>
    far && cableId && farId
      ? [
          {
            kind: 'box',
            role,
            title: readableEndpoint(index, farId),
            sub: far.farLocation,
            place: far.farPlace,
            endpointId: farId,
            action: 'go',
            onRoute: on(farId),
          },
        ]
      : [{ kind: 'box', role: 'none', title: 'no cable', onRoute: false }]
  const cableLink = (id?: string): ChainItem[] =>
    id ? [{ kind: 'link', link: 'cable', label: id, onRoute: onLink(id) }] : []

  const top = farBox(
    'far',
    detail.external,
    detail.external?.linkId,
    detail.external?.farEndpointId,
  )
  const items: ChainItem[] = [
    ...top,
    ...(detail.external ? cableLink(detail.external.linkId) : []),
    {
      kind: 'box',
      role: 'self',
      title: place(endpointId),
      endpointId,
      onRoute: on(endpointId),
    },
  ]
  if (!detail.internal) return items
  const bridgeId = index.lookup.bridges.get(endpointId)
  const otherId = detail.internal.endpointId
  const otherDetail = detailModel(index, networks, otherId)
  items.push(
    {
      kind: 'link',
      link: 'bridge',
      label: 'bridge',
      onRoute: onLink(bridgeId),
    },
    {
      kind: 'box',
      role: 'other',
      title: place(otherId),
      endpointId: otherId,
      side: detail.internal.side,
      action: 'switch',
      onRoute: on(otherId),
    },
  )
  const far = otherDetail?.external
  items.push(
    ...(far ? cableLink(far.linkId) : []),
    ...farBox('otherFar', far, far?.linkId, far?.farEndpointId),
  )
  return items
}
