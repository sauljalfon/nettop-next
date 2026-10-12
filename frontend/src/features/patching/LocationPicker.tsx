import { useId, useState } from 'react'
import type { NodeBranch, RackBranch, SiteBranch } from './patching'

interface Choice {
  siteId: string
  nodeId: string
  rackId: string
}

/** Where an equipment is in the tree; the first site, node and rack when it is in none. */
function placeOf(tree: readonly SiteBranch[], equipmentId?: string): Choice {
  for (const site of tree)
    for (const node of site.nodes)
      for (const rack of node.racks)
        if (rack.equipment.some((e) => e.id === equipmentId))
          return { siteId: site.id, nodeId: node.id, rackId: rack.id }
  const site = tree[0]
  const node = site?.nodes[0]
  return {
    siteId: site?.id ?? '',
    nodeId: node?.id ?? '',
    rackId: node?.racks[0]?.id ?? '',
  }
}

/**
 * The far end chosen as Site › Node › Rack › Equipment (four dropdowns), so a
 * large network never becomes one long list. Changing a level moves the levels
 * under it to their first entry that holds equipment; a rack with none says so.
 * `exclude` (the near equipment) is never offered.
 */
export default function LocationPicker({
  tree,
  equipmentId,
  exclude,
  freeOf,
  onChange,
}: {
  tree: readonly SiteBranch[]
  equipmentId?: string
  exclude?: string
  freeOf: (equipmentId: string) => number
  onChange: (equipmentId: string) => void
}) {
  const id = useId()
  const [choice, setChoice] = useState(() => placeOf(tree, equipmentId))
  // Follow a far end chosen elsewhere (a recent target, Undo).
  const [shown, setShown] = useState(equipmentId)
  if (shown !== equipmentId) {
    setShown(equipmentId)
    setChoice(placeOf(tree, equipmentId))
  }
  const eligible = (rack?: RackBranch) =>
    (rack?.equipment ?? []).filter((e) => e.id !== exclude)
  const site = tree.find((s) => s.id === choice.siteId) ?? tree[0]
  const node = site?.nodes.find((n) => n.id === choice.nodeId) ?? site?.nodes[0]
  const rack = node?.racks.find((r) => r.id === choice.rackId) ?? node?.racks[0]
  const inRack = eligible(rack)

  /** Moves to `next` and picks its first equipment, when it has one. */
  const go = (next: Choice) => {
    setChoice(next)
    const first = eligible(
      tree
        .find((s) => s.id === next.siteId)
        ?.nodes.find((n) => n.id === next.nodeId)
        ?.racks.find((r) => r.id === next.rackId),
    )[0]
    if (first) onChange(first.id)
  }
  const firstRack = (n?: NodeBranch) =>
    n?.racks.find((r) => eligible(r).length > 0) ?? n?.racks[0]
  const firstNode = (s?: SiteBranch) =>
    s?.nodes.find((n) => n.racks.some((r) => eligible(r).length > 0)) ??
    s?.nodes[0]

  return (
    <div className="location-picker" role="group" aria-label="Far end">
      <label htmlFor={`${id}-site`}>
        Site
        <select
          id={`${id}-site`}
          value={site?.id ?? ''}
          onChange={(e) => {
            const s = tree.find((x) => x.id === e.target.value)
            const n = firstNode(s)
            go({
              siteId: s?.id ?? '',
              nodeId: n?.id ?? '',
              rackId: firstRack(n)?.id ?? '',
            })
          }}
        >
          {tree.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-node`}>
        Node
        <select
          id={`${id}-node`}
          value={node?.id ?? ''}
          disabled={!site?.nodes.length}
          onChange={(e) => {
            const n = site?.nodes.find((x) => x.id === e.target.value)
            go({
              siteId: site?.id ?? '',
              nodeId: n?.id ?? '',
              rackId: firstRack(n)?.id ?? '',
            })
          }}
        >
          {site?.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-rack`}>
        Rack
        <select
          id={`${id}-rack`}
          value={rack?.id ?? ''}
          disabled={!node?.racks.length}
          onChange={(e) =>
            go({
              siteId: site?.id ?? '',
              nodeId: node?.id ?? '',
              rackId: e.target.value,
            })
          }
        >
          {node?.racks.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({eligible(r).length})
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-equipment`}>
        Equipment
        <select
          id={`${id}-equipment`}
          value={inRack.some((e) => e.id === equipmentId) ? equipmentId : ''}
          disabled={inRack.length === 0}
          onChange={(e) => onChange(e.target.value)}
        >
          {inRack.length === 0 && <option value="">No equipment here</option>}
          {inRack.length > 0 && !inRack.some((e) => e.id === equipmentId) && (
            <option value="" disabled>
              Choose…
            </option>
          )}
          {inRack.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {freeOf(e.id)} free
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
