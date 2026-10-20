export type InventoryList =
  'equipment' | 'ports' | 'cables' | 'racks' | 'problems' | 'work'

export type ColumnKind =
  | 'text'
  | 'mono'
  | 'name'
  | 'network'
  | 'status'
  | 'endpoint'
  | 'equipmentLink'
  /** The Work list's action, drawn as a chip with its icon. */
  | 'chip'
  /** Text with each name apart (Where, Detail): the row's `parts`. */
  | 'pieces'

export interface Column {
  key: string
  label: string
  width: number
  kind: ColumnKind
  /** The first column is always shown. */
  first?: true
  /** Compared as a number when sorting (the U column). */
  numeric?: true
  /** A unit written after the number (racks: 12U). */
  suffix?: 'U'
  /** Holds several values (Missing, Fits): not sortable or groupable. */
  list?: true
}

const col = (
  key: string,
  label: string,
  width: number,
  kind: ColumnKind = 'text',
  more: Partial<Pick<Column, 'first' | 'numeric' | 'suffix' | 'list'>> = {},
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
    col('used', 'Ports used', 96, 'mono', { numeric: true }),
    col('free', 'Ports free', 96, 'mono', { numeric: true }),
    col('manufacturer', 'Manufacturer', 120),
    col('model', 'Model', 130),
    col('serial', 'Serial number', 130, 'mono'),
    col('ip', 'IP address', 120, 'mono'),
    col('status', 'Status', 130, 'status'),
    col('missing', 'Missing', 200, 'text', { list: true }),
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
  racks: [
    col('rack', 'Rack', 150, 'name', { first: true }),
    col('site', 'Site', 140, 'name'),
    col('node', 'Node', 150, 'name'),
    col('units', 'Height', 76, 'mono', { numeric: true, suffix: 'U' }),
    col('used', 'Used', 70, 'mono', { numeric: true, suffix: 'U' }),
    col('free', 'Free', 70, 'mono', { numeric: true, suffix: 'U' }),
    col('gap', 'Largest free block', 170, 'mono', { numeric: true }),
    col('count', 'Equipment', 96, 'mono', { numeric: true }),
    col('fits', 'Fits', 150, 'text', { list: true }),
  ],
  problems: [
    col('what', 'Object', 190, 'name', { first: true }),
    col('problem', 'Problem', 220),
    col('detail', 'Detail', 470, 'pieces'),
    col('site', 'Site', 140, 'name'),
    col('node', 'Node', 150, 'name'),
  ],
  work: [
    col('what', 'Object', 250, 'name', { first: true }),
    col('n', 'Step', 64, 'mono', { numeric: true }),
    col('action', 'Action', 110, 'chip'),
    col('where', 'Where', 380, 'pieces'),
    col('detail', 'Detail', 280, 'pieces'),
    col('node', 'Node', 140, 'name'),
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
    ['missing', 'Missing'],
  ],
  ports: [
    ['equipment', 'Equipment'],
    ['site', 'Site'],
    ['node', 'Node'],
    ['net', 'Network'],
    ['connected', 'Connected'],
    ['side', 'Side'],
    ['state', 'State'],
    ['type', 'Type'],
  ],
  cables: [
    ['net', 'Network'],
    ['status', 'Status'],
  ],
  racks: [
    ['site', 'Site'],
    ['node', 'Node'],
    ['fits', 'Fits'],
  ],
  problems: [
    ['problem', 'Problem'],
    ['site', 'Site'],
  ],
  work: [
    ['action', 'Action'],
    ['node', 'Node'],
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
    ['connected', 'Connected'],
  ],
  cables: [
    ['net', 'Network'],
    ['status', 'Status'],
  ],
  racks: [
    ['site', 'Site'],
    ['node', 'Node'],
  ],
  problems: [
    ['problem', 'Problem'],
    ['node', 'Node'],
  ],
  work: [
    ['action', 'Action'],
    ['node', 'Node'],
  ],
}

export const DEFAULT_HIDDEN: Record<InventoryList, readonly string[]> = {
  equipment: ['manufacturer', 'ip', 'missing'],
  ports: ['site', 'node'],
  cables: [],
  racks: ['fits'],
  problems: [],
  work: ['node'],
}

export const columnOf = (list: InventoryList, key: string) =>
  COLUMNS[list].find((c) => c.key === key)

/** The columns shown: the first always, the others unless hidden. */
export const visibleColumns = (
  list: InventoryList,
  hidden: ReadonlySet<string>,
) => COLUMNS[list].filter((c) => c.first || !hidden.has(c.key))

const SORT_FIRST: Partial<Record<InventoryList, string>> = {
  ports: 'equipment',
  problems: 'problem',
  work: 'n',
}

export const defaultSort = (list: InventoryList) => ({
  key: SORT_FIRST[list] ?? COLUMNS[list][0].key,
  dir: 1 as 1 | -1,
})

/** A column can be sorted unless it holds several values. */
export const sortable = (list: InventoryList, key: string) =>
  !columnOf(list, key)?.list

/** What a pill, a group or a menu says for an empty value. */
export function emptyText(list: InventoryList, key: string): string {
  if (key === 'side') return 'No side (switch ports)'
  if (key === 'missing') return 'Nothing missing'
  if (key === 'fits') return 'Full'
  const kind = columnOf(list, key)?.kind
  if (kind === 'network') return 'No network'
  if (kind === 'status') return 'Not set'
  return '(empty)'
}
