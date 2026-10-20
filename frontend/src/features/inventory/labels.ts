import type { Endpoint, Link } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { ExportHeader } from '../map/exportRoute'
import { plural } from '../physical/text'
import { asciiLine } from '../physical/sheets'
import { fileDay, fileSlug } from './csv'
import type { EndpointPieces, InventoryRow } from './rows'

export type LabelSource = 'selected' | 'listed' | 'new'

/** 2 × 8 labels on an A4 page. */
export const LABELS_PER_PAGE = 16

export interface CableLabel {
  cableId: string
  /** The cable's label, or "No label". */
  label: string
  /** Both ends, names kept apart. */
  a: EndpointPieces
  b: EndpointPieces
}

/** The cables a plan adds (its links that are cables, not bridges). */
export const newCableIds = (plan: {
  links: readonly Pick<Link, 'id' | 'kind'>[]
}) => plan.links.filter((l) => l.kind === 'cable').map((l) => l.id)

/** The distinct cables of the rows that have one, in the order they come. */
const cablesOf = (rows: readonly InventoryRow[]) => [
  ...new Set(rows.flatMap((r) => (r.cableId ? [r.cableId] : []))),
]

export function labelIds(
  source: LabelSource,
  from: {
    selected: readonly InventoryRow[]
    listed: readonly InventoryRow[]
    planCableIds: readonly string[]
  },
): string[] {
  if (source === 'selected') return cablesOf(from.selected)
  if (source === 'listed') return cablesOf(from.listed)
  return [...new Set(from.planCableIds)]
}

export function buildLabels(
  ids: readonly string[],
  index: SnapshotIndex,
  endpointOf: (id: string) => Endpoint | undefined,
): CableLabel[] {
  const end = (id: string): EndpointPieces => {
    const p = endpointOf(id)
    return {
      equipmentName: index.equipment.get(p?.equipmentId ?? '')?.name ?? '',
      label: p?.label ?? '',
    }
  }
  return ids.flatMap((id) => {
    const link = index.cableById.get(id)
    return link
      ? [
          {
            cableId: id,
            label: link.label || 'No label',
            a: end(link.a),
            b: end(link.b),
          },
        ]
      : []
  })
}

/** The labels in sheets of 16. */
export function pages(labels: readonly CableLabel[]): CableLabel[][] {
  const out: CableLabel[][] = []
  for (let i = 0; i < labels.length; i += LABELS_PER_PAGE)
    out.push(labels.slice(i, i + LABELS_PER_PAGE))
  return out
}

export const labelsFileName = (planName: string | undefined, date: Date) =>
  `cable-labels${planName === undefined ? '' : `-plan-${fileSlug(planName)}`}-${fileDay(date)}.pdf`

/** The header of the PDF's text layer (plain ASCII: the standard fonts have no Hebrew or arrows). */
export const labelsHeader = (
  count: number,
  pageCount: number,
  planName: string | undefined,
  date: string,
): ExportHeader => ({
  title: 'Cable labels',
  lines: [
    `${plural(count, 'label')} - ${plural(pageCount, 'page')}`,
    `${planName === undefined ? 'Installed' : `Proposed: ${planName}`} - ${date}`,
  ],
})

/** One searchable ASCII line per label: cable, label, A end, B end. */
export const labelTextLines = (labels: readonly CableLabel[]): string[] =>
  labels.map((l) =>
    asciiLine(
      [
        l.cableId,
        l.label,
        `${l.a.equipmentName} ${l.a.label}`,
        `${l.b.equipmentName} ${l.b.label}`,
      ].join(' | '),
    ),
  )
