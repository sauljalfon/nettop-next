import type { SnapshotIndex } from '../map/snapshotIndex'
import {
  resolveLocation,
  sameLocation,
  SITES,
  type PhysicalLocation,
} from './location'

/** Session-only navigation state: where we are and where Back goes. */
export interface PhysicalHistory {
  current: PhysicalLocation
  back: readonly PhysicalLocation[]
}

export type HistoryAction =
  | { type: 'navigate'; to: PhysicalLocation }
  /** Swaps the current location without a history entry (selecting an endpoint, switching sides). */
  | { type: 'replace'; to: PhysicalLocation }
  | { type: 'back' }

export function initialHistory(): PhysicalHistory {
  return { current: SITES, back: [] }
}

/**
 * Navigating (including a breadcrumb to an ancestor) pushes the current
 * location; Back pops and restores it exactly. Going where we already are is a
 * no-op, so a repeated click does not grow the stack.
 */
export function historyReducer(
  state: PhysicalHistory,
  action: HistoryAction,
): PhysicalHistory {
  if (action.type === 'back') {
    if (state.back.length === 0) return state
    return {
      current: state.back[state.back.length - 1],
      back: state.back.slice(0, -1),
    }
  }
  if (sameLocation(state.current, action.to)) return state
  if (action.type === 'replace') return { current: action.to, back: state.back }
  return { current: action.to, back: [...state.back, state.current] }
}

export interface Breadcrumb {
  label: string
  location: PhysicalLocation
}

/** Sites, then each existing ancestor down to the location, with names. */
export function breadcrumbs(
  index: SnapshotIndex,
  location: PhysicalLocation,
): Breadcrumb[] {
  const l = resolveLocation(index, location)
  const crumbs: Breadcrumb[] = [{ label: 'Sites', location: SITES }]
  if (!l.siteId) return crumbs
  crumbs.push({
    label: index.sites.get(l.siteId)!.name,
    location: { level: 'site', siteId: l.siteId },
  })
  if (!l.nodeId) return crumbs
  crumbs.push({
    label: index.nodes.get(l.nodeId)!.name,
    location: { level: 'node', siteId: l.siteId, nodeId: l.nodeId },
  })
  if (!l.rackId) return crumbs
  crumbs.push({
    label: index.racks.get(l.rackId)!.name,
    location: {
      level: 'rack',
      siteId: l.siteId,
      nodeId: l.nodeId,
      rackId: l.rackId,
    },
  })
  if (!l.equipmentId) return crumbs
  crumbs.push({
    label: index.equipment.get(l.equipmentId)!.name,
    location: {
      level: 'equipment',
      siteId: l.siteId,
      nodeId: l.nodeId,
      rackId: l.rackId,
      equipmentId: l.equipmentId,
    },
  })
  return crumbs
}
