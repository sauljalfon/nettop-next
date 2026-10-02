import type { Edge, Node } from '@xyflow/react'
import type { Equipment, Endpoint, Route, Snapshot } from '../../shared/types'
import { routeHighlight } from '../pathfinding/projection'

export interface CanvasData extends Record<string, unknown> {
  kind: 'site' | 'node' | 'rack' | 'equipment' | 'preview'
  name: string
  subtitle: string
  highlighted: boolean
  collapsed?: boolean
  entityID: string
  equipment?: Equipment
  ports?: Endpoint[]
  activePorts?: string[]
  proposed?: boolean
  onToggle?: (id: string) => void
  onOpenRack?: (id: string) => void
  onPort?: (id: string) => void
  onDropItem?: (rackID: string, payload: string) => void
  onConfigure?: () => void
}
export type CanvasNode = Node<CanvasData, 'container' | 'equipment' | 'preview'>
export type CanvasEdge = Edge<{ linkIds: string[] }>

export function locationPath(s: Snapshot, id: string) {
  const equipment = s.equipment.find((e) => e.id === id),
    rack = s.racks.find((r) => r.id === equipment?.rackId),
    node = s.nodes.find((n) => n.id === rack?.nodeId),
    site = s.sites.find((site) => site.id === node?.siteId)
  return [site?.name, node?.name, rack?.name, equipment?.name]
    .filter(Boolean)
    .join(' / ')
}

export function hierarchyGraph(
  s: Snapshot,
  collapsed: Set<string>,
  route?: Route,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [],
    edges: CanvasEdge[] = []
  const trace = routeHighlight(s, route)
  const equipmentByRack = new Map(
    s.racks.map((r) => [r.id, s.equipment.filter((e) => e.rackId === r.id)]),
  )
  const rackSize = (id: string) => ({
    width: 280,
    height: collapsed.has(`rack:${id}`)
      ? 125
      : Math.max(250, (equipmentByRack.get(id)?.length ?? 0) * 146 + 114),
  })
  const nodeSize = (id: string) => {
    const racks = s.racks.filter((r) => r.nodeId === id)
    return {
      width: collapsed.has(`node:${id}`)
        ? 320
        : Math.max(320, racks.length * 308 + 28),
      height: collapsed.has(`node:${id}`)
        ? 125
        : Math.max(330, ...racks.map((r) => rackSize(r.id).height + 125)),
    }
  }
  const representative = new Map<string, string>()
  let siteX = 40
  const add = (
    id: string,
    parentId: string | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
    data: CanvasData,
  ) =>
    nodes.push({
      id,
      type: 'container',
      parentId,
      extent: parentId ? 'parent' : undefined,
      position: { x, y },
      style: { width, height },
      data,
      dragHandle: '.container-heading',
      zIndex: 0,
    })
  for (const site of s.sites) {
    const locations = s.nodes.filter((n) => n.siteId === site.id),
      closed = collapsed.has(`site:${site.id}`)
    const width = closed
        ? 360
        : Math.max(
            400,
            locations.reduce((sum, n) => sum + nodeSize(n.id).width + 28, 44),
          ),
      height = closed
        ? 110
        : Math.max(400, ...locations.map((n) => nodeSize(n.id).height + 124))
    const siteEquipment = s.equipment.filter((e) =>
      s.racks.some(
        (r) => r.id === e.rackId && locations.some((n) => n.id === r.nodeId),
      ),
    )
    add(`site:${site.id}`, undefined, siteX, 40, width, height, {
      kind: 'site',
      name: site.name,
      subtitle: `${locations.length} nodes · ${siteEquipment.length} equipment`,
      entityID: site.id,
      collapsed: closed,
      highlighted: siteEquipment.some((e) => trace.equipmentIds.has(e.id)),
    })
    siteX += width + 100
    let nodeX = 28
    for (const location of locations) {
      const racks = s.racks.filter((r) => r.nodeId === location.id),
        nodeEquipment = s.equipment.filter((e) =>
          racks.some((r) => r.id === e.rackId),
        ),
        nodeClosed = collapsed.has(`node:${location.id}`)
      if (!closed) {
        const size = nodeSize(location.id)
        add(
          `node:${location.id}`,
          `site:${site.id}`,
          nodeX,
          88,
          size.width,
          size.height,
          {
            kind: 'node',
            name: location.name,
            subtitle: `${racks.length} racks · ${nodeEquipment.length} equipment`,
            entityID: location.id,
            collapsed: nodeClosed,
            highlighted: nodeEquipment.some((e) =>
              trace.equipmentIds.has(e.id),
            ),
          },
        )
        nodeX += size.width + 28
      }
      let rackX = 20
      for (const rack of racks) {
        const equipment = equipmentByRack.get(rack.id) ?? [],
          rackClosed = collapsed.has(`rack:${rack.id}`)
        if (!closed && !nodeClosed) {
          const size = rackSize(rack.id)
          add(
            `rack:${rack.id}`,
            `node:${location.id}`,
            rackX,
            96,
            size.width,
            size.height,
            {
              kind: 'rack',
              name: rack.name,
              subtitle: `${equipment.length} equipment · ${equipment.reduce((sum, e) => sum + e.height, 0)}/${rack.units}U`,
              entityID: rack.id,
              collapsed: rackClosed,
              highlighted: equipment.some((e) => trace.equipmentIds.has(e.id)),
            },
          )
          rackX += 308
        }
        equipment.forEach((e, i) => {
          const ancestor = closed
            ? `site:${site.id}`
            : nodeClosed
              ? `node:${location.id}`
              : rackClosed
                ? `rack:${rack.id}`
                : e.id
          representative.set(e.id, ancestor)
          if (ancestor !== e.id) return
          nodes.push({
            id: e.id,
            type: 'equipment',
            parentId: `rack:${rack.id}`,
            position: { x: 26, y: 94 + i * 146 },
            style: { width: 228, height: 124 },
            zIndex: 5,
            data: {
              kind: 'equipment',
              name: e.name,
              subtitle: `${e.role} · U${e.unit} · ${e.height}U`,
              entityID: e.id,
              equipment: e,
              ports: s.endpoints.filter((p) => p.equipmentId === e.id),
              activePorts: [...trace.endpointIds],
              highlighted: trace.equipmentIds.has(e.id),
              proposed: s.context === 'planned',
            },
          })
        })
      }
    }
  }
  const endpointOwner = new Map(s.endpoints.map((p) => [p.id, p.equipmentId])),
    buckets = new Map<string, CanvasEdge>()
  const byID = new Map(nodes.map((node) => [node.id, node]))
  const centerX = (id: string): number => {
    const node = byID.get(id)
    if (!node) return 0
    let x = node.position.x + Number(node.style?.width ?? 0) / 2
    let parent = node.parentId
    while (parent) {
      const ancestor = byID.get(parent)
      if (!ancestor) break
      x += ancestor.position.x
      parent = ancestor.parentId
    }
    return x
  }
  for (const cable of s.links.filter((l) => l.kind === 'cable')) {
    const source = representative.get(endpointOwner.get(cable.a) ?? ''),
      target = representative.get(endpointOwner.get(cable.b) ?? '')
    if (!source || !target || source === target) continue
    const summarized =
      source !== endpointOwner.get(cable.a) ||
      target !== endpointOwner.get(cable.b)
    const key = summarized ? [source, target].sort().join('|') : cable.id
    const existing = buckets.get(key)
    if (existing) {
      existing.data!.linkIds.push(cable.id)
      existing.label = `${existing.data!.linkIds.length} cables`
      continue
    }
    const sourceEquipment = s.equipment.find(
        (e) => e.id === endpointOwner.get(cable.a),
      ),
      targetEquipment = s.equipment.find(
        (e) => e.id === endpointOwner.get(cable.b),
      )
    const sameRack = sourceEquipment?.rackId === targetEquipment?.rackId,
      reverse = centerX(source) > centerX(target)
    const sourceSide = reverse ? 'out-left' : 'out',
      targetSide = reverse || sameRack ? 'in-right' : 'in'
    buckets.set(key, {
      id: `visual:${key}`,
      source,
      target,
      sourceHandle:
        source === sourceEquipment?.id
          ? `${cable.a}:${sourceSide}`
          : sourceSide,
      targetHandle:
        target === targetEquipment?.id
          ? `${cable.b}:${targetSide}`
          : targetSide,
      type: 'smoothstep',
      data: { linkIds: [cable.id] },
      label: summarized ? '1 cable' : undefined,
      zIndex: 10,
    })
  }
  for (const edge of buckets.values()) {
    const active = edge.data!.linkIds.some((id) => trace.linkIds.has(id))
    edge.animated = active
    edge.style = {
      stroke: active ? '#108b79' : '#9bacc0',
      strokeWidth: active ? 3 : 1.8,
    }
    edges.push(edge)
  }
  return { nodes, edges }
}
