import type { Edge, Node } from '@xyflow/react'
import type { Position } from '../physical/layout'
import type { RouteMarks } from '../physical/inventory'
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
  labelShape,
  type FocusItem,
  type FocusLine,
} from './focusLayout'
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

/** A line is drawn and opens the circuit panel; it carries no text (its label is on the card it leads to). */
export interface FocusLineData extends Record<string, unknown> {
  from: string
  to: string
  circuits: PanelCircuit[]
  /** A cable of the selected route is among the line's circuits. */
  onRoute: boolean
}

/** One line that ends at a card, as a row of that card. */
export interface FocusIncoming {
  /** The edge's ID: what the row opens. */
  lineId: string
  label: FocusLabel
  onRoute: boolean
  /** The line has circuits to list; a group's line does not. */
  hasCircuits: boolean
  /** The card the line comes from. */
  parentName: string
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
  /** The selected route passes through this equipment (teal; never dimmed). */
  onRoute: boolean
  side: 'center' | 'left' | 'right'
  /** The lines that end here, one row each. */
  incoming: FocusIncoming[]
  /** The card's height, from focusCardHeight; the layout stacks with the same number. */
  height: number
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
  /** The selected route passes through a member. */
  onRoute: boolean
  /** The lines that end here, one row each. */
  incoming: FocusIncoming[]
  height: number
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

const ENDS_WIDTH = 360

/**
 * A Focus as React Flow nodes and edges: the center, a card per neighbour, a
 * card per group (each with a row per line that ends there, made of pieces),
 * the box of the center's dead ends, and a line per pair. A projection only; it never feeds a trace.
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
  /** What the selected route touches; D11: it is never dimmed. */
  marks?: RouteMarks
}): { nodes: FocusFlowNode[]; edges: Edge[] } {
  const {
    index,
    focus,
    layout,
    selected,
    networkId,
    installedIds,
    openGroups,
    marks,
  } = args
  const onRouteEquipment = (id: string) => !!marks?.equipment.has(id)
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

  // A line's row goes to the card it leads to: line.to, the outer end.
  const edgeOnRoute = (line: FocusLine) =>
    !!marks &&
    (line.circuits.length > 0
      ? line.circuits.some((c) => c.linkIds.some((id) => marks.links.has(id)))
      : onRouteEquipment(line.from) &&
        !!groups.get(line.to)?.equipmentIds.some(onRouteEquipment))
  const incomingOf = (id: string): FocusIncoming[] =>
    layout.lines
      .filter((line) => line.to === id)
      .flatMap((line) => {
        const shape = labelShape(line)
        if (!shape) return []
        let label: FocusLabel
        if (shape.kind === 'steps') {
          const via = steps(line.circuits[0].via)
          label = {
            kind: 'steps',
            steps: via.slice(0, shape.shown),
            more: shape.more,
          }
        } else label = shape
        return [
          {
            lineId: `line:${line.id}`,
            label,
            onRoute: edgeOnRoute(line),
            hasCircuits: line.circuits.length > 0,
            parentName: nameOf(line.from),
          },
        ]
      })

  const nodes: FocusFlowNode[] = []
  for (const item of layout.items) {
    const topLeft = { x: item.x - item.width / 2, y: item.y - item.height / 2 }
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
          onRoute: g.equipmentIds.some(onRouteEquipment),
          incoming: incomingOf(item.id),
          height: item.height,
        },
      })
      continue
    }
    const e = index.equipment.get(item.id)
    if (!e) continue
    const isCenter = item.kind === 'center'
    const onRoute = onRouteEquipment(e.id)
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
        e.networkId !== networkId &&
        !onRoute,
      selected: e.id === selected,
      onRoute,
      side: item.side,
      incoming: incomingOf(item.id),
      height: item.height,
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
    const onRoute = edgeOnRoute(line)
    const data: FocusLineData = {
      onRoute,
      from: line.from,
      to: line.to,
      circuits,
    }
    return {
      id: `line:${line.id}`,
      source: line.from,
      target: line.to,
      type: 'focusLine',
      interactionWidth: 20,
      data,
      style: {
        stroke: onRoute ? 'var(--route)' : 'var(--mixed-networks)',
        strokeWidth: onRoute ? 5 : 3,
        strokeLinecap: 'round' as const,
      },
    }
  })
  return { nodes, edges }
}
