export type InventoryList = 'equipment' | 'ports' | 'cables'

export type ColumnKind =
  'text' | 'mono' | 'name' | 'network' | 'status' | 'endpoint' | 'equipmentLink'

export interface Column {
  key: string
  label: string
  width: number
  kind: ColumnKind
  /** The first column is always shown. */
  first?: true
  /** Compared as a number when sorting (the U column). */
  numeric?: true
}

const col = (
  key: string,
  label: string,
  width: number,
  kind: ColumnKind = 'text',
  more: Partial<Pick<Column, 'first' | 'numeric'>> = {},
): Column => ({ key, label, width, kind, ...more })

export const COLUMNS: Record<InventoryList, readonly Column[]> = {
  equipment: [
    col('name', 'Name', 190, 'name', { first: true }),
    col('kind', 'Kind', 90),
    col('role', 'Role', 110),
    col('net', 'Network', 130, 'network'),
    col('site', 'Site', 140, 'name'),
    col('node', 'Node', 150, 'name'),
    col('rack', 'Rack', 70, 'name'),
    col('unit', 'U', 56, 'mono', { numeric: true }),
    col('manufacturer', 'Manufacturer', 120),
    col('model', 'Model', 130),
    col('serial', 'Serial number', 130, 'mono'),
    col('ip', 'IP address', 120, 'mono'),
    col('status', 'Status', 130, 'status'),
  ],
  ports: [
    col('port', 'Port', 120, 'mono', { first: true }),
    col('equipment', 'Equipment', 150, 'equipmentLink'),
    col('side', 'Side', 70),
    col('net', 'Network', 130, 'network'),
    col('type', 'Type', 80),
    col('connector', 'Connector', 90),
    col('speed', 'Speed', 70),
    col('state', 'State', 120, 'status'),
    col('cable', 'Cable', 90, 'mono'),
    col('far', 'Far end', 210, 'endpoint'),
    col('site', 'Site', 140, 'name'),
    col('node', 'Node', 150, 'name'),
  ],
  cables: [
    col('id', 'Cable', 110, 'mono', { first: true }),
    col('a', 'A end', 220, 'endpoint'),
    col('b', 'B end', 220, 'endpoint'),
    col('net', 'Network', 130, 'network'),
    col('label', 'Label', 180),
    col('status', 'Status', 120, 'status'),
  ],
}

type Choices = Record<InventoryList, readonly (readonly [string, string])[]>

export const PILLS: Choices = {
  equipment: [
    ['site', 'Site'],
    ['node', 'Node'],
    ['net', 'Network'],
    ['kind', 'Kind'],
    ['role', 'Role'],
    ['status', 'Status'],
  ],
  ports: [
    ['equipment', 'Equipment'],
    ['site', 'Site'],
    ['net', 'Network'],
    ['side', 'Side'],
    ['state', 'State'],
    ['type', 'Type'],
  ],
  cables: [
    ['net', 'Network'],
    ['status', 'Status'],
  ],
}

export const GROUPS: Choices = {
  equipment: [
    ['site', 'Site'],
    ['node', 'Node'],
    ['net', 'Network'],
    ['kind', 'Kind'],
    ['role', 'Role'],
    ['status', 'Status'],
  ],
  ports: [
    ['equipment', 'Equipment'],
    ['node', 'Node'],
    ['side', 'Side'],
    ['state', 'State'],
  ],
  cables: [
    ['net', 'Network'],
    ['status', 'Status'],
  ],
}

export const DEFAULT_HIDDEN: Record<InventoryList, readonly string[]> = {
  equipment: ['ip'],
  ports: ['site', 'node'],
  cables: [],
}

export const columnOf = (list: InventoryList, key: string) =>
  COLUMNS[list].find((c) => c.key === key)

/** The columns shown: the first always, the others unless hidden. */
export const visibleColumns = (
  list: InventoryList,
  hidden: ReadonlySet<string>,
) => COLUMNS[list].filter((c) => c.first || !hidden.has(c.key))

export const defaultSort = (list: InventoryList) => ({
  key: list === 'ports' ? 'equipment' : COLUMNS[list][0].key,
  dir: 1 as 1 | -1,
})

/** What a pill, a group or a menu says for an empty value. */
export function emptyText(list: InventoryList, key: string): string {
  if (key === 'side') return 'No side (switch ports)'
  const kind = columnOf(list, key)?.kind
  if (kind === 'network') return 'No network'
  if (kind === 'status') return 'Not set'
  return '(empty)'
}
