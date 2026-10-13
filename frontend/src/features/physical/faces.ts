import { comparePorts, hasSide } from '../../shared/ports'
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
  /** A state other than available (reserved, disabled, faulty): drawn hatched, never a trace change. */
  portState?: 'reserved' | 'disabled' | 'faulty'
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
    portState: p.state && p.state !== 'available' ? p.state : undefined,
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

const PORTS_PER_ROW = 12

/** One port group of a switch, drawn as its own bank of jacks (odd above even). */
export interface SwitchBankGroup {
  /** The 1-based port group; 0 for the one bank of ports saved before groups. */
  group: number
  /** "Gi1/0/1–Gi1/0/24 · copper · 1G": the first and last name as they are, then the type and speed; "" for a switch saved before groups. */
  caption: string
  cells: FaceEndpoint[]
}

/**
 * A switch's ports in the order they were made (by position, or by the number
 * in the label for ports saved before groups), in rows of 12, and as banks:
 * one per port group, each with a caption. A switch without groups is one bank
 * with no caption.
 */
export function switchBank(
  index: SnapshotIndex,
  equipmentId: string,
  options: FaceOptions = {},
): { rows: FaceEndpoint[][]; banks: SwitchBankGroup[] } {
  const ports = (index.lookup.byEquipment.get(equipmentId) ?? [])
    .filter((p) => !hasSide(p))
    .sort(comparePorts)
  const cells = ports.map((p) => cell(index, p, p.label, options))
  const rows: FaceEndpoint[][] = []
  for (let i = 0; i < cells.length; i += PORTS_PER_ROW)
    rows.push(cells.slice(i, i + PORTS_PER_ROW))
  const banks: SwitchBankGroup[] = []
  ports.forEach((p, i) => {
    const group = p.portGroup ?? 0
    let bank = banks.at(-1)
    if (!bank || bank.group !== group) {
      bank = { group, caption: '', cells: [] }
      banks.push(bank)
    }
    bank.cells.push(cells[i])
    bank.caption = group > 0 ? caption(ports, bank, i, p) : ''
  })
  return { rows, banks }
}

/** Jack columns a face row holds (the face card's width) and the gap between banks, in columns. */
export const FACE_COLUMNS = 15
const BANK_GAP = 1
/** A bank of more than this many ports is laid out as blocks of this many (12 columns, odd above even). */
const BLOCK_PORTS = 24

/** One block of jacks on the faceplate: a bank, or one 24-port block of a long bank. */
export interface PlateUnit {
  group: number
  /** The bank's caption, on its first block only. */
  caption: string
  cells: FaceEndpoint[]
  /** How many ports of the bank come before this block: a jack's number is start + its place + 1. */
  start: number
}

/** Jack columns of a block: two jacks (odd above even) per column. */
export const unitColumns = (u: Pick<PlateUnit, 'cells'>) =>
  Math.ceil(u.cells.length / 2)

/**
 * Where the banks lie on the faceplate: side by side from left to right (access
 * ports first, uplinks to their right) with a gap between them; what does not
 * fit the face width wraps to the next row. A bank of more than 24 ports is cut
 * into blocks of 24 (12 columns) so it can wrap too. A switch with one bank
 * (one group, or saved before groups) is one strip, as it always was.
 */
export function layoutPlate(banks: readonly SwitchBankGroup[]): PlateUnit[][] {
  if (banks.length === 1)
    return [
      [
        {
          group: banks[0].group,
          caption: banks[0].caption,
          cells: banks[0].cells,
          start: 0,
        },
      ],
    ]
  const units: PlateUnit[] = banks.flatMap((bank) =>
    Array.from(
      { length: Math.ceil(bank.cells.length / BLOCK_PORTS) },
      (_, i) => ({
        group: bank.group,
        caption: i === 0 ? bank.caption : '',
        cells: bank.cells.slice(i * BLOCK_PORTS, (i + 1) * BLOCK_PORTS),
        start: i * BLOCK_PORTS,
      }),
    ),
  )
  const rows: PlateUnit[][] = []
  let used = 0
  for (const unit of units) {
    const width = unitColumns(unit)
    const row = rows.at(-1)
    if (row && used + BANK_GAP + width <= FACE_COLUMNS) {
      row.push(unit)
      used += BANK_GAP + width
    } else {
      rows.push([unit])
      used = width
    }
  }
  return rows
}

/** The column each unit of a plate row starts at, in jack columns. */
export function unitOffsets(row: readonly PlateUnit[]): number[] {
  let at = 0
  return row.map((u) => {
    const start = at
    at += unitColumns(u) + BANK_GAP
    return start
  })
}

/** The caption of a grouped bank as it stands once port `i` is its last one. */
function caption(
  ports: readonly Endpoint[],
  bank: SwitchBankGroup,
  i: number,
  last: Endpoint,
) {
  const first = ports[i - bank.cells.length + 1]
  const range =
    bank.cells.length === 1 ? first.label : `${first.label}–${last.label}`
  return [range, first.portType, first.speed].filter(Boolean).join(' · ')
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
    if (!hasSide(p) || p.position === undefined) continue
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
