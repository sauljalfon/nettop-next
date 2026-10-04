// Mirrors api/openapi.yaml. Generate these when the write contract stabilizes.
export type Context = 'installed' | 'planned'

export interface Plan {
  id: string
  name: string
  baseRevision: string
  revision: string
  equipment: Equipment[]
  updates?: Equipment[]
  subpanels: Subpanel[]
  endpoints: Endpoint[]
  links: Link[]
}

export interface EquipmentInput {
  name: string
  kind: 'switch' | 'panel'
  role: 'access' | 'aggregation' | 'backbone' | 'passive'
  networkId?: string
  rackId: string
  unit: number
  height: number
  portCount: number
}

export interface HDFInput {
  name: string
  rackId: string
  unit: number
  /** Chassis height in rack units; independent of rows. */
  height: number
  /** Grid rows, 1–32; creates 4 subpanels, 24 positions per row. */
  rows: number
}

export type PlanCommand =
  | {
      type: 'add_equipment'
      expectedRevision: string
      equipment: EquipmentInput
    }
  | {
      type: 'add_hdf'
      expectedRevision: string
      hdf: HDFInput
    }
  | {
      type: 'add_cable'
      expectedRevision: string
      cable: { a: string; b: string }
    }
  | {
      type: 'move_equipment'
      expectedRevision: string
      placement: { equipmentId: string; rackId: string; unit: number }
    }
export interface Equipment {
  id: string
  name: string
  kind: 'switch' | 'panel' | 'hdf'
  role: string
  networkId?: string
  rackId: string
  unit: number
  height: number
}
export interface Subpanel {
  id: string
  equipmentId: string
  row: number
  column: 'A' | 'B' | 'C' | 'D'
}
export interface Network {
  id: string
  name: string
}
export interface Rack {
  nodeId: string
  id: string
  name: string
  units: number
}
export interface Endpoint {
  id: string
  equipmentId: string
  label: string
  subpanelId?: string
  position?: number
  side?: 'front' | 'rear'
}
export interface Link {
  id: string
  a: string
  b: string
  kind: 'cable' | 'internal'
}
export interface Snapshot {
  networks: Network[]
  subpanels: Subpanel[]
  sites: { id: string; name: string }[]
  nodes: { id: string; name: string; siteId: string }[]
  context: Context
  revision: string
  site: string
  room: string
  racks: Rack[]
  equipment: Equipment[]
  endpoints: Endpoint[]
  links: Link[]
}
export type TraceRequest =
  | { mode: 'point_to_point'; start: string; end: string }
  | { mode: 'aggregation'; device: string }
  | { mode: 'aggregation'; start: string }
export interface Hop {
  linkId: string
  from: string
  to: string
  kind: Link['kind']
}
export interface Route {
  start: string
  end: string
  hops: Hop[]
}
export interface TraceResult {
  context: Context
  revision: string
  mode: TraceRequest['mode']
  status: 'reached' | 'unreachable'
  reason: string
  routes: Route[]
}
