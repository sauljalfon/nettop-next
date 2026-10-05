export interface Named {
  id: string
  name: string
}

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * Equipment whose name contains the query, ignoring case: names that start with
 * it first, then the rest, each group by name (numbers compared as numbers).
 * An empty query matches nothing. Explore uses it to choose the first match on Enter.
 */
export function searchEquipment<T extends Named>(
  equipment: readonly T[],
  query: string,
  limit = Infinity,
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const prefix: T[] = []
  const inside: T[] = []
  for (const e of equipment) {
    const name = e.name.toLowerCase()
    if (name.startsWith(q)) prefix.push(e)
    else if (name.includes(q)) inside.push(e)
  }
  const byName = (a: T, b: T) =>
    natural(a.name, b.name) || a.id.localeCompare(b.id)
  return [...prefix.sort(byName), ...inside.sort(byName)].slice(0, limit)
}
