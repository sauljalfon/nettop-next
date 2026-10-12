import type { PortGroupInput } from '../../shared/types'

/** The most ports and port groups a switch may have (as the server checks). */
export const MAX_SWITCH_PORTS = 96
export const MAX_PORT_GROUPS = 8
const MAX_LABEL = 64

/** One port group row of the Add form, as typed. */
export interface GroupRow {
  count: string
  names: string
  portType: '' | 'copper' | 'fiber'
  connector: string
  speed: string
}

export const emptyRow = (): GroupRow => ({
  count: '',
  names: '',
  portType: '',
  connector: '',
  speed: '',
})

/** Group mode starts from the plain count: the same ports as one group "Port {n}", and an empty row to fill. */
export const rowsFromCount = (count: string): GroupRow[] => [
  { ...emptyRow(), count, names: 'Port {n}' },
  emptyRow(),
]

const whole = (text: string) =>
  /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN

const namesOk = (names: string) => names.split('{n}').length === 2

const labelsOf = (count: number, names: string) =>
  Array.from({ length: count }, (_, i) =>
    names.trim().replace('{n}', String(i + 1)),
  )

/**
 * The groups to send, or what is wrong in words. The server judges the rest in
 * its own words (and a label is never read for anything but display).
 */
export function checkGroups(
  rows: readonly GroupRow[],
): { groups: PortGroupInput[] } | { error: string } {
  if (rows.length === 0) return { error: 'Add at least one port group.' }
  if (rows.length > MAX_PORT_GROUPS)
    return {
      error: `A switch has 1–${MAX_PORT_GROUPS} port groups, not ${rows.length}.`,
    }
  const groups: PortGroupInput[] = []
  let total = 0
  const used = new Set<string>()
  for (const [i, r] of rows.entries()) {
    const who = `Port group ${i + 1}`
    const count = whole(r.count)
    if (!(count >= 1)) return { error: `${who}: Count must be at least 1.` }
    if (!namesOk(r.names))
      return { error: `${who}: Names must contain {n} once.` }
    total += count
    if (total > MAX_SWITCH_PORTS)
      return {
        error: `A switch has 1–${MAX_SWITCH_PORTS} ports, not ${total}.`,
      }
    for (const label of labelsOf(count, r.names)) {
      if (label.length > MAX_LABEL)
        return {
          error: `${who}: port name "${label}" is longer than ${MAX_LABEL} characters.`,
        }
      if (used.has(label.toLowerCase()))
        return { error: `Port name "${label}" is used twice.` }
      used.add(label.toLowerCase())
    }
    const details: NonNullable<PortGroupInput['details']> = {}
    if (r.portType) details.portType = r.portType
    if (r.connector.trim()) details.connector = r.connector.trim()
    if (r.speed.trim()) details.speed = r.speed.trim()
    groups.push({
      count,
      names: r.names.trim(),
      ...(Object.keys(details).length > 0 && { details }),
    })
  }
  return { groups }
}

/** "28 ports: Gi1/0/1 … Gi1/0/24, Te1/1/1 … Te1/1/4": rows that are not valid yet are left out. */
export function groupSummary(rows: readonly GroupRow[]): string {
  let total = 0
  const parts: string[] = []
  for (const r of rows) {
    const count = whole(r.count)
    if (!(count >= 1) || !namesOk(r.names)) continue
    total += count
    const [first, last] = [
      labelsOf(1, r.names)[0],
      labelsOf(count, r.names)[count - 1],
    ]
    parts.push(
      count === 1
        ? first
        : count === 2
          ? `${first}, ${last}`
          : `${first} … ${last}`,
    )
  }
  if (total === 0) return ''
  return `${total} port${total === 1 ? '' : 's'}: ${parts.join(', ')}`
}
