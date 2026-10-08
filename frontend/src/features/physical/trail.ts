import type { Route } from '../../shared/types'
import { facetKey } from '../map/facets'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { PhysicalLocation } from './location'

/** One visit of the route to an equipment: where it enters and where it leaves. */
export interface TrailStep {
  equipmentId: string
  /** The endpoints the route uses on this equipment, in route order (one, or both sides of a position). */
  endpointIds: string[]
  /** "PANEL-A 1 F→R", "HDF-01 3C/5 R→F", "EDGE-17 Port 1". */
  label: string
  /** Opened by a click: where the route enters the equipment. */
  openEndpointId: string
}

const INITIAL = { front: 'F', rear: 'R' } as const

/**
 * The route as steps. Hops across an internal bridge stay on one equipment, so
 * a passive position is one step with its side change; a cable starts the next.
 * Names, positions and sides come from the structure, never from stored labels.
 */
export function trailSteps(
  index: SnapshotIndex,
  route: Route | undefined,
): TrailStep[] {
  if (!route) return []
  const groups: string[][] = [[route.start]]
  for (const hop of route.hops) {
    if (hop.kind === 'internal') groups[groups.length - 1].push(hop.to)
    else groups.push([hop.to])
  }
  return groups.flatMap((endpointIds) => {
    const first = index.lookup.endpoints.get(endpointIds[0])
    const equipment = index.equipment.get(first?.equipmentId ?? '')
    if (!first || !equipment) return []
    const sides = endpointIds
      .map((id) => index.lookup.endpoints.get(id)?.side)
      .flatMap((side) => (side ? [INITIAL[side]] : []))
    const label =
      first.position === undefined
        ? `${equipment.name} ${first.label}`
        : `${equipment.name} ${facetKey(index.lookup, first)} ${sides.join('→')}`.trim()
    return [
      {
        equipmentId: equipment.id,
        endpointIds,
        label,
        openEndpointId: endpointIds[0],
      },
    ]
  })
}

/**
 * The step the page shows: the one that uses the selected endpoint (either side
 * of a position), or, with no endpoint selected, the only visit to that
 * equipment. None above the equipment level, or when the page is off the route.
 */
export function currentStep(
  steps: readonly TrailStep[],
  location: PhysicalLocation,
): number | undefined {
  if (location.level !== 'equipment') return undefined
  if (location.endpointId) {
    const at = steps.findIndex((s) =>
      s.endpointIds.includes(location.endpointId!),
    )
    return at < 0 ? undefined : at
  }
  const visits = steps.flatMap((s, i) =>
    s.equipmentId === location.equipmentId ? [i] : [],
  )
  return visits.length === 1 ? visits[0] : undefined
}

/** The step Prev or Next opens: from no current step, Next opens the first and Prev has nothing. */
export function stepTarget(
  steps: readonly TrailStep[],
  current: number | undefined,
  direction: 'prev' | 'next',
): TrailStep | undefined {
  if (current === undefined) return direction === 'next' ? steps[0] : undefined
  return steps[current + (direction === 'next' ? 1 : -1)]
}
