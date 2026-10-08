import { facetLabel } from '../map/facets'
import type { Network } from '../../shared/types'
import type { ExportHeader } from '../map/exportRoute'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { readableEndpoint } from '../pathfinding/hops'
import type { Inventory } from './inventory'

export interface RackSheetRow {
  unit: string
  name: string
  kind: string
  role: string
  /** Empty for passive equipment. */
  network: string
}

/** The rack sheet's table: each equipment from the top unit down. */
export function rackSheetRows(
  inv: Inventory,
  rackId: string,
  networks: readonly Network[],
): RackSheetRow[] {
  return (inv.equipmentByRack.get(rackId) ?? [])
    .map((id) => inv.equipment.get(id)!)
    .sort((a, b) => b.unit - a.unit)
    .map((e) => ({
      unit:
        e.height > 1 ? `U${e.unit}–U${e.unit + e.height - 1}` : `U${e.unit}`,
      name: e.name,
      kind: e.kind,
      role: e.role,
      network:
        e.role === 'passive'
          ? ''
          : (networks.find((n) => n.id === e.networkId)?.name ?? ''),
    }))
}

export interface EquipmentSheetRow {
  label: string
  /** "front", "rear", or "" for a port. */
  side: string
  cableId: string
  farEnd: string
  farLocation: string
}

/** The equipment sheet's table: only the cabled endpoints, by position and then side. */
export function equipmentSheetRows(
  index: SnapshotIndex,
  equipmentId: string,
): EquipmentSheetRow[] {
  const rows = (index.lookup.byEquipment.get(equipmentId) ?? []).flatMap(
    (p) => {
      const cable = index.cableByEndpoint.get(p.id)
      if (!cable) return []
      const far = index.lookup.endpoints.get(cable.farEndpointId)
      return [
        {
          label: facetLabel(index.lookup, p),
          side: p.side ?? '',
          cableId: cable.linkId,
          farEnd: readableEndpoint(index, cable.farEndpointId),
          farLocation: index.locations.get(far?.equipmentId ?? '') ?? '',
        },
      ]
    },
  )
  const order = { front: 0, rear: 1, '': 2 } as const
  return rows.sort(
    (a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }) ||
      order[a.side as keyof typeof order] - order[b.side as keyof typeof order],
  )
}

/** The band above a sheet: the name, "Site / Node / Rack", then Installed (or Proposed: plan) and the date. */
export function sheetHeader(input: {
  title: string
  location: string
  plan?: string
  date: string
}): ExportHeader {
  return {
    title: input.title,
    lines: [
      input.location,
      `${input.plan ? `Proposed: ${input.plan}` : 'Installed'} · ${input.date}`,
    ],
  }
}

/** rack-Rack-SM01.pdf, equipment-HDF-01.pdf: safe characters only. */
export function sheetFileName(kind: 'rack' | 'equipment', name: string) {
  const safe = name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${kind}-${safe}.pdf`
}

/** ASCII for the PDF's text layer (the standard PDF fonts have no arrows or dashes). */
export const asciiLine = (line: string) =>
  line
    .replaceAll('↔', '<->')
    .replaceAll('→', '->')
    .replaceAll('·', '-')
    .replaceAll('–', '-')
    .replace(/[^\x20-\x7e]/g, '?')

/** The invisible text layer: the header, the column names, then one line per row. */
export function sheetTextLines(
  header: ExportHeader,
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): string[] {
  return [
    header.title,
    ...header.lines,
    columns.join(' | '),
    ...rows.map((r) => r.join(' | ')),
  ].map(asciiLine)
}
