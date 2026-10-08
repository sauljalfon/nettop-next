import type { Equipment, Network } from '../../shared/types'
import { facetLabel } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { endpointDetail } from './detail'
import {
  fiberPair,
  hdfFace,
  panelFace,
  switchBank,
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
    location: string
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
  | { kind: 'switch'; rows: FaceEndpoint[][] }
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
    return { kind: 'switch', rows: switchBank(index, e.id, options).rows }
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
