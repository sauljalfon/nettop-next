import type { Endpoint } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { RouteMarks } from './inventory'

export type EndpointState = 'free' | 'cabled' | 'route' | 'selected'

/** One port or one position side as drawn on a face. */
export interface FaceEndpoint {
  /** Absent only for a position the equipment has no endpoint for. */
  endpointId?: string
  label: string
  cabled: boolean
  /** Circuit network (passive) or the device's network (active); absent when unresolved. */
  networkId?: string
  cable?: { linkId: string; farEndpointId: string }
  onRoute: boolean
  selected: boolean
  /** Selected beats on-route beats cabled beats free. */
  state: EndpointState
}

export interface FaceOptions {
  /** Marks of the selected route only. */
  marks?: RouteMarks
  selectedEndpointId?: string
}

function cell(
  index: SnapshotIndex,
  p: Endpoint | undefined,
  label: string,
  options: FaceOptions,
): FaceEndpoint {
  if (!p)
    return {
      label,
      cabled: false,
      onRoute: false,
      selected: false,
      state: 'free',
    }
  const device = index.equipment.get(p.equipmentId)
  const onRoute = options.marks?.endpoints.has(p.id) ?? false
  const selected = options.selectedEndpointId === p.id
  const cabled = index.cabled.has(p.id)
  return {
    endpointId: p.id,
    label,
    cabled,
    networkId:
      index.circuits.get(p.id) ??
      (device && device.role !== 'passive' ? device.networkId : undefined),
    cable: index.cableByEndpoint.get(p.id),
    onRoute,
    selected,
    state: selected
      ? 'selected'
      : onRoute
        ? 'route'
        : cabled
          ? 'cabled'
          : 'free',
  }
}

const numeric = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

const PORTS_PER_ROW = 12

/** A switch's ports in numeric label order, in rows of 12. */
export function switchBank(
  index: SnapshotIndex,
  equipmentId: string,
  options: FaceOptions = {},
): { rows: FaceEndpoint[][] } {
  const ports = (index.lookup.byEquipment.get(equipmentId) ?? [])
    .filter((p) => p.position === undefined)
    .sort((a, b) => numeric(a.label, b.label))
    .map((p) => cell(index, p, p.label, options))
  const rows: FaceEndpoint[][] = []
  for (let i = 0; i < ports.length; i += PORTS_PER_ROW)
    rows.push(ports.slice(i, i + PORTS_PER_ROW))
  return { rows }
}

export interface PanelFace {
  side: 'front' | 'rear'
  /** Positions 1..N of the chosen side, in order. */
  positions: (FaceEndpoint & { position: number })[]
}

/** A standard panel's positions on one side. */
export function panelFace(
  index: SnapshotIndex,
  equipmentId: string,
  side: 'front' | 'rear',
  options: FaceOptions = {},
): PanelFace {
  const bySide = new Map<number, Endpoint>()
  let count = 0
  for (const p of index.lookup.byEquipment.get(equipmentId) ?? []) {
    if (p.position === undefined) continue
    count = Math.max(count, p.position)
    if (p.side === side) bySide.set(p.position, p)
  }
  return {
    side,
    positions: Array.from({ length: count }, (_, i) => ({
      ...cell(index, bySide.get(i + 1), String(i + 1), options),
      position: i + 1,
    })),
  }
}

export const HDF_COLUMNS = ['A', 'B', 'C', 'D'] as const
export const HDF_POSITIONS = 6

export interface HdfBlock {
  /** "3C": the row and column; never parsed for identity. */
  label: string
  row: number
  column: (typeof HDF_COLUMNS)[number]
  subpanelId?: string
  positions: (FaceEndpoint & { position: number; fiberPair: string })[]
}

export interface HdfFace {
  side: 'front' | 'rear'
  rows: number
  /** Row-major: 1A, 1B, 1C, 1D, 2A, ... */
  blocks: HdfBlock[]
}

/** Position 5 is carried on fibers 9 and 10; display text only, never identity. */
export const fiberPair = (position: number) =>
  `${position * 2 - 1},${position * 2}`

/**
 * The full HDF grid on one side: columns A-D, as many rows as the HDF has
 * subpanels for, six positions per block. A block with no endpoint for a
 * position still appears, with no endpoint ID.
 */
export function hdfFace(
  index: SnapshotIndex,
  equipmentId: string,
  side: 'front' | 'rear',
  options: FaceOptions = {},
): HdfFace {
  const found = new Map<
    string,
    { subpanelId: string; at: Map<number, Endpoint> }
  >()
  let rows = 0
  for (const p of index.lookup.byEquipment.get(equipmentId) ?? []) {
    const sub = index.lookup.subpanels.get(p.subpanelId ?? '')
    if (!sub || p.position === undefined) continue
    rows = Math.max(rows, sub.row)
    const key = `${sub.row}${sub.column}`
    let block = found.get(key)
    if (!block) found.set(key, (block = { subpanelId: sub.id, at: new Map() }))
    if (p.side === side) block.at.set(p.position, p)
  }
  const blocks: HdfBlock[] = []
  for (let row = 1; row <= rows; row++)
    for (const column of HDF_COLUMNS) {
      const label = `${row}${column}`
      const block = found.get(label)
      blocks.push({
        label,
        row,
        column,
        subpanelId: block?.subpanelId,
        positions: Array.from({ length: HDF_POSITIONS }, (_, i) => ({
          ...cell(index, block?.at.get(i + 1), `${label} / ${i + 1}`, options),
          position: i + 1,
          fiberPair: fiberPair(i + 1),
        })),
      })
    }
  return { side, rows, blocks }
}
