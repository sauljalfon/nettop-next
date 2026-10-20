import { piecesText, type TextPiece } from '../../shared/textPieces'
import type { Endpoint, Plan, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { plural } from '../physical/text'
import {
  planSummary,
  type ChangeGroup,
  type ChangeLine,
} from '../planning/summary'
import type { TypeIconKind } from './icons'
import type { InventoryRow } from './rows'

export type WorkAction =
  'Remove' | 'Move' | 'Add' | 'Rename' | 'Connect' | 'Disconnect'

const ACTIONS: Record<string, WorkAction> = {
  remove_equipment: 'Remove',
  remove_rack: 'Remove',
  remove_node: 'Remove',
  remove_site: 'Remove',
  place_equipment: 'Move',
  add_site: 'Add',
  add_node: 'Add',
  add_rack: 'Add',
  add_equipment: 'Add',
  rename_equipment: 'Rename',
  add_cable: 'Connect',
  remove_cable: 'Disconnect',
}

/** The order to do the changes in: removals, moves, additions (containers first), cables. */
const ORDER: Record<ChangeGroup, number> = {
  Removed: 0,
  Moved: 1,
  'Containers added': 2,
  'Equipment added': 3,
  'Cables connected': 4,
  'Cables disconnected': 5,
}

const KIND = { switch: 'Switch', panel: 'Panel', hdf: 'HDF' } as const
const name = (n: string): TextPiece => ({ name: n })
const text = (t: string): TextPiece => ({ text: t })

/** Site › node › rack (· U) of what exists in this snapshot; the parts that are known. */
function placePieces(
  index: SnapshotIndex,
  parts: { rackId?: string; nodeId?: string; siteId?: string; unit?: number },
): { pieces: TextPiece[]; node: string } {
  const rack = index.racks.get(parts.rackId ?? '')
  const node = index.nodes.get(rack?.nodeId ?? parts.nodeId ?? '')
  const site = index.sites.get(node?.siteId ?? parts.siteId ?? '')
  const names = [site?.name, node?.name, rack?.name].filter(
    (n): n is string => n !== undefined,
  )
  const pieces: TextPiece[] = []
  names.forEach((n, i) => {
    if (i > 0) pieces.push(text(' › '))
    pieces.push(name(n))
  })
  if (rack && parts.unit !== undefined) pieces.push(text(` · U${parts.unit}`))
  return { pieces, node: node?.name ?? '' }
}

/**
 * The Work list of a plan: one row per line of the Changes drawer (planSummary),
 * numbered in the order to do them. Where comes from Installed for a removal and
 * a disconnect and from the proposed topology for the rest; an object with no
 * place has an empty Where.
 */
export function buildWorkList(
  plan: Plan,
  installed: Snapshot,
  installedIndex: SnapshotIndex,
  proposed: Snapshot,
  proposedIndex: SnapshotIndex,
): InventoryRow[] {
  const lines = planSummary(plan, installed)
    .map((line, n) => ({ line, n }))
    .sort((a, b) => ORDER[a.line.group] - ORDER[b.line.group] || a.n - b.n)
    .map((x) => x.line)

  const endpointMaps = new Map<Snapshot, Map<string, Endpoint>>()
  const endpointsOf = (snapshot: Snapshot) => {
    let map = endpointMaps.get(snapshot)
    if (!map)
      endpointMaps.set(
        snapshot,
        (map = new Map(snapshot.endpoints.map((p) => [p.id, p]))),
      )
    return map
  }

  return lines.map((line: ChangeLine, i): InventoryRow => {
    const colon = line.key.indexOf(':')
    const rule = line.key.slice(0, colon)
    const id = line.key.slice(colon + 1)
    const action = ACTIONS[rule]
    const fromInstalled = action === 'Remove' || action === 'Disconnect'
    const index = fromInstalled ? installedIndex : proposedIndex
    const snapshot = fromInstalled ? installed : proposed

    let what = ''
    let where: TextPiece[] = []
    let node = ''
    let detail: TextPiece[] = []
    let equipmentId = ''
    let endpointId: string | undefined
    let cableId: string | undefined
    let icon: TypeIconKind = 'switch'
    let place: InventoryRow['place']
    let gone = false

    const equipment = index.equipment.get(id)
    const onEquipment = () => {
      if (!equipment) return
      equipmentId = equipment.id
      icon = equipment.kind
      const p = placePieces(index, {
        rackId: equipment.rackId,
        unit: equipment.unit,
      })
      where = p.pieces
      node = p.node
    }

    switch (rule) {
      case 'remove_equipment': {
        gone = true
        onEquipment()
        if (equipment) {
          const cables = installedIndex.cablesByEquipment.get(id)?.length ?? 0
          const kind = equipment.model || KIND[equipment.kind]
          detail = [
            text(
              cables === 0
                ? kind
                : cables === 1
                  ? `${kind}; its cable goes too`
                  : `${kind}; its ${plural(cables, 'cable')} go too`,
            ),
          ]
        }
        break
      }
      case 'place_equipment': {
        onEquipment()
        const was = installedIndex.equipment.get(id)
        if (was && equipment) {
          const wasRack = installedIndex.racks.get(was.rackId)
          const toRack = proposedIndex.racks.get(equipment.rackId)
          detail =
            was.rackId === equipment.rackId || !wasRack || !toRack
              ? [text(`From U${was.unit} to U${equipment.unit}`)]
              : [
                  text('From '),
                  name(wasRack.name),
                  text(` U${was.unit} to `),
                  name(toRack.name),
                  text(` U${equipment.unit}`),
                ]
        }
        break
      }
      case 'add_equipment': {
        onEquipment()
        const added = plan.equipment.find((e) => e.id === id)
        if (added) {
          const ports = plan.endpoints.filter(
            (p) => p.equipmentId === id,
          ).length
          const make = [added.manufacturer, added.model]
            .filter(Boolean)
            .join(' ')
          const count =
            added.kind === 'switch'
              ? plural(ports, 'port')
              : plural(Math.ceil(ports / 2), 'position')
          const net = proposed.networks.find((n) => n.id === added.networkId)
          detail = [
            text([make, count].filter(Boolean).join(', ') + (net ? ', ' : '')),
            ...(net ? [name(net.name)] : []),
          ]
        }
        break
      }
      case 'rename_equipment': {
        onEquipment()
        const to = plan.renames?.find((r) => r.id === id)?.name
        what = to ?? ''
        const was =
          plan.equipment.find((e) => e.id === id)?.name ?? plan.labels?.[id]
        if (was) detail = [text('Was '), name(was)]
        break
      }
      case 'add_site':
      case 'remove_site':
        icon = 'rack'
        if (rule === 'add_site') place = { siteId: id }
        else gone = true
        break
      case 'add_node':
      case 'remove_node': {
        icon = 'rack'
        if (rule === 'remove_node') gone = true
        const n = index.nodes.get(id)
        if (n) {
          if (rule === 'add_node') place = { siteId: n.siteId, nodeId: id }
          const p = placePieces(index, { siteId: n.siteId })
          where = p.pieces
          node = n.name
        }
        break
      }
      case 'add_rack':
      case 'remove_rack': {
        icon = 'rack'
        if (rule === 'remove_rack') gone = true
        const r = index.racks.get(id)
        if (r) {
          if (rule === 'add_rack')
            place = {
              siteId: index.nodes.get(r.nodeId)?.siteId,
              nodeId: r.nodeId,
              rackId: id,
            }
          const p = placePieces(index, { nodeId: r.nodeId })
          where = p.pieces
          node = p.node
        }
        const units = plan.racks?.find((x) => x.id === id)?.units
        if (rule === 'add_rack' && units !== undefined)
          detail = [text(`${units}U`)]
        break
      }
      case 'add_cable':
      case 'remove_cable': {
        what = id
        icon = 'cable'
        const link = index.cableById.get(id)
        if (!link) break
        cableId = id
        endpointId = link.a
        const ends = endpointsOf(snapshot)
        const end = (endpoint: string): TextPiece[] => {
          const p = ends.get(endpoint)
          return p
            ? [
                name(index.equipment.get(p.equipmentId)?.name ?? ''),
                text(' '),
                name(p.label),
              ]
            : []
        }
        where = [...end(link.a), text(' ↔ '), ...end(link.b)]
        const owner = index.owner.get(link.a) ?? ''
        equipmentId = owner
        // A cable cut with its equipment leaves nothing to open.
        gone = rule === 'remove_cable' && !proposedIndex.equipment.has(owner)
        const a = index.equipment.get(owner)
        if (a) node = placePieces(index, { rackId: a.rackId }).node
        detail = [text(link.label ? `Label "${link.label}"` : 'No label')]
        break
      }
    }

    if (!what) {
      const first = line.pieces.find((p) => 'name' in p)
      what = first && 'name' in first ? first.name : line.text
    }
    return {
      key: line.key,
      equipmentId,
      ...(endpointId ? { endpointId } : {}),
      ...(cableId ? { cableId } : {}),
      icon,
      ...(place ? { place } : {}),
      ...(gone ? { gone: true as const } : {}),
      proposed: action === 'Add' || action === 'Connect' || action === 'Rename',
      i,
      values: {
        what,
        n: String(i + 1),
        action,
        where: piecesText(where),
        detail: piecesText(detail),
        node,
      },
      raw: {},
      pieces: {},
      parts: { where, detail },
    }
  })
}
