import type { TextPiece } from '../../shared/textPieces'
import type { Equipment, Snapshot } from '../../shared/types'
import type { NetworkHierarchy } from '../map/hierarchy'
import { passiveSentence, wayUp } from '../map/hierarchyDetails'
import type { SnapshotIndex } from '../map/snapshotIndex'

export function inspectorHeader(
  s: Snapshot,
  index: SnapshotIndex,
  equipment: Equipment,
  installedIDs: ReadonlySet<string>,
) {
  const summary = index.summaries.get(equipment.id) ?? { cabled: 0, total: 0 }
  return {
    name: equipment.name,
    role: equipment.role,
    network:
      equipment.kind === 'switch'
        ? s.networks.find((n) => n.id === equipment.networkId)?.name
        : undefined,
    proposed: !installedIDs.has(equipment.id),
    summary: `${summary.cabled} of ${summary.total} cabled`,
  }
}

/** The site, node and rack of an equipment; whatever is unknown is left out. */
export function inspectorLocation(index: SnapshotIndex, equipmentId: string) {
  const rack = index.racks.get(index.equipment.get(equipmentId)?.rackId ?? '')
  const node = index.nodes.get(rack?.nodeId ?? '')
  const site = index.sites.get(node?.siteId ?? '')
  return {
    ...(site && { site: { id: site.id, name: site.name } }),
    ...(node && { node: { id: node.id, name: node.name } }),
    ...(rack && { rack: { id: rack.id, name: rack.name } }),
  }
}

/**
 * Find AGG / BB from every port is only for switches: the backend rejects a
 * whole-device start from a panel or an HDF (those start from one position).
 */
export const canFindFromDevice = (equipment: Pick<Equipment, 'kind'>) =>
  equipment.kind === 'switch'

/**
 * The card's one-line way up. An access switch or a mid AGG: its circuits toward the top and the
 * devices they reach ("3 uplinks: AGG-03, AGG-08, BB-01"); with none, what the tree says
 * ("No uplink · no port cabled", "No BB uplink"). A passive: how many circuits run through it. A
 * BB, a rack item or an unknown ID: none.
 */
export function wayUpLine(
  hierarchies: ReadonlyMap<string, NetworkHierarchy>,
  index: SnapshotIndex,
  id: string,
): TextPiece[] | undefined {
  const equipment = index.equipment.get(id)
  if (!equipment) return undefined
  if (equipment.role === 'passive')
    return passiveSentence(hierarchies, index, id)
  const rows = wayUp(hierarchies, index, id)
  const reached: string[] = []
  let circuits = 0
  let gap: TextPiece[] | undefined
  for (const row of rows) {
    const device = row.find((step) => step.kind === 'device')
    const tops = row.find((step) => step.kind === 'tops')
    if (!device) {
      gap ??= row.find((step) => step.kind === 'gap')?.text
      continue
    }
    circuits += 1
    const ids = [device.equipmentId, ...(tops?.kind === 'tops' ? tops.ids : [])]
    for (const far of ids) if (!reached.includes(far)) reached.push(far)
  }
  if (circuits === 0) return gap
  const names = reached.flatMap((far, i): TextPiece[] => [
    ...(i ? [{ text: ', ' }] : []),
    { name: index.equipment.get(far)?.name ?? far },
  ])
  return [
    { text: `${circuits} ${circuits === 1 ? 'uplink' : 'uplinks'}: ` },
    ...names,
  ]
}

/** The card's Model line: manufacturer and model, then the serial number; none when all are empty. */
export function modelLine(
  equipment: Pick<Equipment, 'manufacturer' | 'model' | 'serialNumber'>,
): TextPiece[] | undefined {
  const d = equipment
  const model = [d?.manufacturer, d?.model]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(' ')
  const serial = d?.serialNumber?.trim()
  if (!model && !serial) return undefined
  return [
    ...(model ? [{ name: model }] : []),
    ...(model && serial ? [{ text: ' · ' }] : []),
    ...(serial ? [{ text: 'SN ' }, { name: serial }] : []),
  ]
}
