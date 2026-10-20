import { piecesText, type TextPiece } from '../../shared/textPieces'
import type { Snapshot } from '../../shared/types'
import { endpointNetwork } from '../map/circuitNetwork'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { InventoryRow } from './rows'

/**
 * What the data shows is wrong, from the snapshot alone (nothing is guessed from
 * names, nothing blocks). Each problem's key is `<rule>:<id>`, so a selection
 * survives a refetch.
 */
export function buildProblems(
  snapshot: Snapshot,
  index: SnapshotIndex,
  installedIDs: ReadonlySet<string>,
): InventoryRow[] {
  const planned = snapshot.context === 'planned'
  const networkName = new Map(snapshot.networks.map((n) => [n.id, n.name]))
  const endpoints = new Map(snapshot.endpoints.map((p) => [p.id, p]))
  const rows: InventoryRow[] = []

  const add = (
    key: string,
    equipmentId: string,
    problem: string,
    detail: TextPiece[],
    extra: { endpointId?: string; cableId?: string } = {},
  ) => {
    const p = index.places.get(equipmentId)
    rows.push({
      key,
      equipmentId,
      ...extra,
      icon: index.equipment.get(equipmentId)?.kind,
      proposed: planned && !installedIDs.has(equipmentId),
      i: rows.length,
      values: {
        what: index.equipment.get(equipmentId)?.name ?? '',
        problem,
        detail: piecesText(detail),
        site: index.sites.get(p?.siteId ?? '')?.name ?? '',
        node: index.nodes.get(p?.nodeId ?? '')?.name ?? '',
      },
      raw: {},
      pieces: {},
      parts: { detail },
    })
  }

  // A cable whose two ends carry different circuit networks, at any role.
  const end = (endpointId: string, network: string): TextPiece[] => {
    const p = endpoints.get(endpointId)
    return [
      { name: networkName.get(network) ?? network },
      { text: ' at ' },
      { name: index.equipment.get(p?.equipmentId ?? '')?.name ?? '' },
      { text: ' ' },
      { name: p?.label ?? '' },
    ]
  }
  for (const l of index.cables) {
    const a = endpointNetwork(index, l.a)
    const b = endpointNetwork(index, l.b)
    if (!a || !b || a === b) continue
    add(
      `networks:${l.id}`,
      index.owner.get(l.a) ?? '',
      'A circuit joins two networks',
      [{ text: `${l.id}: ` }, ...end(l.a, a), { text: ' ↔ ' }, ...end(l.b, b)],
      { endpointId: l.a, cableId: l.id },
    )
  }

  // A faulty or disabled port that has a cable.
  for (const p of snapshot.endpoints) {
    if (p.state !== 'faulty' && p.state !== 'disabled') continue
    const cable = index.cableByEndpoint.get(p.id)
    if (!cable) continue
    add(
      `port:${p.id}`,
      p.equipmentId,
      `A ${p.state} port has a cable`,
      [
        { name: p.label },
        { text: ` is ${p.state} and carries ${cable.linkId}` },
      ],
      { endpointId: p.id, cableId: cable.linkId },
    )
  }

  // The same IP address on two or more equipment, each naming the others.
  const byAddress = new Map<string, string[]>()
  for (const e of snapshot.equipment) {
    const address = e.ipAddress?.trim()
    if (!address) continue
    const list = byAddress.get(address)
    if (list) list.push(e.id)
    else byAddress.set(address, [e.id])
  }
  for (const e of snapshot.equipment) {
    const address = e.ipAddress?.trim()
    const group = address ? byAddress.get(address) : undefined
    if (!address || !group || group.length < 2) continue
    const detail: TextPiece[] = [{ text: `${address} is also ` }]
    group
      .filter((id) => id !== e.id)
      .forEach((id, n) => {
        if (n > 0) detail.push({ text: ', ' })
        detail.push({ name: index.equipment.get(id)?.name ?? '' })
      })
    add(`ip:${e.id}`, e.id, 'The same IP address twice', detail)
  }

  // A switch with no serial number.
  for (const e of snapshot.equipment)
    if (e.kind === 'switch' && !e.serialNumber?.trim())
      add(`serial:${e.id}`, e.id, 'A switch has no serial number', [
        { text: 'Fill it in with Edit details' },
      ])

  return rows
}
