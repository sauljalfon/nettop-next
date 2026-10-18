import type { Edge, Node } from '@xyflow/react'
import type { Position, Rect } from '../physical/layout'
import { cardRoleLabel } from './cardRole'
import {
  endpointPlace,
  type Focus,
  type FocusGroup,
  type FocusStep,
} from './focus'
import {
  FOCUS_CENTER_HEIGHT,
  FOCUS_GAP,
  groupKey,
  type FocusItem,
  type FocusLine,
} from './focusLayout'
import { pillPoint } from './overviewFlow'
import type { SnapshotIndex } from './snapshotIndex'

/** A passive equipment on a circuit and where, kept apart so the name can be isolated (D33). */
export interface StepPiece {
  name: string
  place: string
}

/** A line's label: pieces, never one joined string. */
export type FocusLabel =
  | { kind: 'direct' }
  | { kind: 'steps'; steps: StepPiece[]; more: number }
  | { kind: 'count'; count: number }

export interface PortPiece {
  id: string
  label: string
  equipment: string
}

/** One row of a line's circuit panel. */
export interface PanelCircuit {
  start: PortPiece
  end: PortPiece
  via: StepPiece[]
}

export interface FocusLineData extends Record<string, unknown> {
  from: string
  to: string
  circuits: PanelCircuit[]
  /** Absent for a group reached from several parents. */
  label?: FocusLabel
  /** Where the label sits: on the line, clear of every card. */
  pill: Position
}

export interface FocusCardData extends Record<string, unknown> {
  equipmentId: string
  name: string
  role: string
  /** A switch's network; absent for a passive. */
  networkId?: string
  /** Site, node and rack names, for PlacePath. */
  place: string[]
  unit: number
  proposed: boolean
  dimmed: boolean
  selected: boolean
  side: 'center' | 'left' | 'right'
}

export interface FocusGroupData extends Record<string, unknown> {
  key: string
  nodeId?: string
  nodeName: string
  count: number
  side: 'left' | 'right'
  open: boolean
  /** The members while the card is open. */
  members: { id: string; name: string }[]
}

export interface FocusEndRow {
  port: { id: string; label: string }
  via: StepPiece[]
  end: {
    kind: string
    equipment: string
    place: string
    side?: 'front' | 'rear'
  }
}

export type FocusCenterNode = Node<FocusCardData, 'focusCenter'>
export type FocusCardNode = Node<FocusCardData, 'focusCard'>
export type FocusGroupNode = Node<FocusGroupData, 'focusGroup'>
export type FocusEndsNode = Node<{ rows: FocusEndRow[] }, 'focusEnds'>
export type FocusFlowNode =
  FocusCenterNode | FocusCardNode | FocusGroupNode | FocusEndsNode

/** More than this many via steps are cut to the first two and "+N more". */
const MAX_STEPS = 3
const KEPT_STEPS = 2
const ENDS_WIDTH = 360

/**
 * A Focus as React Flow nodes and edges: the center, a card per neighbour, a
 * card per group, the box of the center's dead ends, and a line per pair with a
 * label made of pieces. A projection only; it never feeds a trace.
 */
export function projectFocus(args: {
  index: SnapshotIndex
  focus: Focus
  layout: { items: readonly FocusItem[]; lines: readonly FocusLine[] }
  selected: string
  networkId?: string
  colors?: ReadonlyMap<string, string>
  /** Equipment of the installed topology; one outside it is proposed. */
  installedIds?: ReadonlySet<string>
  openGroups: ReadonlySet<string>
}): { nodes: FocusFlowNode[]; edges: Edge[] } {
  const {
    index,
    focus,
    layout,
    selected,
    networkId,
    installedIds,
    openGroups,
  } = args
  const nameOf = (id: string) => index.equipment.get(id)?.name ?? id
  const steps = (via: readonly FocusStep[]): StepPiece[] =>
    via.map((v) => ({ name: nameOf(v.equipmentId), place: v.place }))
  const port = (id: string): PortPiece => ({
    id,
    label: index.lookup.endpoints.get(id)?.label ?? id,
    equipment: nameOf(index.owner.get(id) ?? ''),
  })

  const groups = new Map<string, FocusGroup>()
  focus.rings.forEach((ring, i) => {
    for (const g of ring.groups) groups.set(groupKey(i + 1, g), g)
  })

  const nodes: FocusFlowNode[] = []
  const rects: Rect[] = []
  const centres = new Map<string, Position>()
  for (const item of layout.items) {
    const topLeft = { x: item.x - item.width / 2, y: item.y - item.height / 2 }
    rects.push({
      left: topLeft.x,
      top: topLeft.y,
      right: topLeft.x + item.width,
      bottom: topLeft.y + item.height,
    })
    centres.set(item.id, { x: item.x, y: item.y })
    if (item.kind === 'group') {
      const g = groups.get(item.id)!
      const open = openGroups.has(item.id)
      nodes.push({
        id: item.id,
        type: 'focusGroup',
        position: topLeft,
        focusable: false,
        draggable: false,
        zIndex: open ? 10 : 0,
        data: {
          key: item.id,
          nodeId: g.nodeId,
          nodeName: g.nodeId ? (index.nodes.get(g.nodeId)?.name ?? '') : '',
          count: g.equipmentIds.length,
          side: g.side,
          open,
          members: open
            ? g.equipmentIds.map((id) => ({ id, name: nameOf(id) }))
            : [],
        },
      })
      continue
    }
    const e = index.equipment.get(item.id)
    if (!e) continue
    const isCenter = item.kind === 'center'
    const data: FocusCardData = {
      equipmentId: e.id,
      name: e.name,
      role: cardRoleLabel(e),
      networkId: e.kind === 'switch' ? e.networkId : undefined,
      place: index.locationParts.get(e.id) ?? [],
      unit: e.unit,
      proposed: !!installedIds && !installedIds.has(e.id),
      dimmed:
        !isCenter &&
        !!networkId &&
        e.kind === 'switch' &&
        e.networkId !== networkId,
      selected: e.id === selected,
      side: item.side,
    }
    nodes.push({
      id: item.id,
      type: isCenter ? 'focusCenter' : 'focusCard',
      position: topLeft,
      focusable: false,
      draggable: false,
      data,
    } as FocusCenterNode | FocusCardNode)
  }

  const rows: FocusEndRow[] = focus.ends.map((end) => {
    const at = index.lookup.endpoints.get(end.end.endpointId)
    return {
      port: {
        id: end.start,
        label: index.lookup.endpoints.get(end.start)?.label ?? end.start,
      },
      via: steps(end.via),
      end: {
        kind: end.end.kind,
        equipment: nameOf(at?.equipmentId ?? ''),
        place: at ? endpointPlace(index, at) : '',
        side: at?.side,
      },
    }
  })
  if (rows.length > 0)
    nodes.push({
      id: 'ends',
      type: 'focusEnds',
      position: { x: -ENDS_WIDTH / 2, y: FOCUS_CENTER_HEIGHT / 2 + FOCUS_GAP },
      focusable: false,
      draggable: false,
      data: { rows },
    })

  const edges: Edge[] = layout.lines.map((line) => {
    const circuits: PanelCircuit[] = line.circuits.map((c) => ({
      start: port(c.start),
      end: port(c.end),
      via: steps(c.via),
    }))
    let label: FocusLabel | undefined
    if (line.circuits.length === 1) {
      const via = steps(line.circuits[0].via)
      label =
        via.length === 0
          ? { kind: 'direct' }
          : via.length > MAX_STEPS
            ? {
                kind: 'steps',
                steps: via.slice(0, KEPT_STEPS),
                more: via.length - KEPT_STEPS,
              }
            : { kind: 'steps', steps: via, more: 0 }
    } else if (line.count > 0) label = { kind: 'count', count: line.count }
    const data: FocusLineData = {
      from: line.from,
      to: line.to,
      circuits,
      label,
      pill: pillPoint(centres.get(line.from)!, centres.get(line.to)!, rects),
    }
    return {
      id: `line:${line.id}`,
      source: line.from,
      target: line.to,
      type: 'focusLine',
      interactionWidth: 20,
      data,
      style: {
        stroke: 'var(--mixed-networks)',
        strokeWidth: 3,
        strokeLinecap: 'round' as const,
      },
    }
  })
  return { nodes, edges }
}
