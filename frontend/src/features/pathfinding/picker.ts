import { comparePorts } from '../../shared/ports'
import type { Endpoint, Snapshot } from '../../shared/types'

/** One thing the trace picker can offer: a whole switch, or one exact endpoint. */
export interface PickerItem {
  /** "device:<id>" for a switch's ports, otherwise the endpoint ID. */
  value: string
  /** What is shown: "EDGE-17 · all ports", "HDF-01 · 3C/5 front". */
  label: string
  /** The words that are matched: the equipment name and the endpoint label. */
  search: string
}

export const MAX_MATCHES = 50

/**
 * The picker's list, built once per snapshot. With `devices`, every switch comes
 * first, by name, as "<name> · all ports" (panels and HDFs cannot start whole-device
 * searches); then every endpoint as "equipment · label".
 */
export function pickerItems(
  s: Snapshot,
  { devices }: { devices: boolean },
): PickerItem[] {
  const names = new Map(s.equipment.map((e) => [e.id, e.name]))
  const items: PickerItem[] = []
  if (devices)
    for (const e of [...s.equipment].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    ))
      if (e.kind === 'switch')
        items.push({
          value: `device:${e.id}`,
          label: `${e.name} · all ports`,
          search: `${e.name} all ports`,
        })
  // Each equipment's ports in the order they were made (the snapshot lists them
  // by ID); other equipment keeps the snapshot's order.
  const byEquipment = new Map<string, Endpoint[]>()
  for (const p of s.endpoints) {
    const own = byEquipment.get(p.equipmentId)
    if (own) own.push(p)
    else byEquipment.set(p.equipmentId, [p])
  }
  const ordered = [...byEquipment.values()].flatMap((own) =>
    own.some((p) => (p.position ?? 0) > 0 && !p.side)
      ? [...own].sort(comparePorts)
      : own,
  )
  for (const p of ordered) {
    const name = names.get(p.equipmentId) ?? p.equipmentId
    items.push({
      value: p.id,
      label: `${name} · ${p.label}`,
      search: `${name} ${p.label}`,
    })
  }
  return items
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[\s·]+/)
    .filter(Boolean)

/**
 * Items that contain every space-separated word of the query, ignoring case and
 * word order ("edge-17 3", "hdf-01 3c/5", "panel-a 1 rear"). Items where more of
 * the words are whole words rank first (so "3" finds port 3 before port 13);
 * otherwise the list order is kept. At most `limit` are returned, with the count
 * of the rest. An empty query matches everything.
 */
export function matchPicker(
  items: readonly PickerItem[],
  query: string,
  limit = MAX_MATCHES,
): { matches: PickerItem[]; more: number } {
  const tokens = words(query)
  // Nothing to match: the list's own order, without scoring every item.
  if (tokens.length === 0)
    return {
      matches: items.slice(0, limit),
      more: Math.max(0, items.length - limit),
    }
  const scored: { item: PickerItem; score: number; at: number }[] = []
  items.forEach((item, at) => {
    const text = item.search.toLowerCase()
    if (!tokens.every((t) => text.includes(t))) return
    const own = new Set(words(item.search))
    scored.push({ item, score: tokens.filter((t) => own.has(t)).length, at })
  })
  scored.sort((a, b) => b.score - a.score || a.at - b.at)
  return {
    matches: scored.slice(0, limit).map((x) => x.item),
    more: Math.max(0, scored.length - limit),
  }
}
