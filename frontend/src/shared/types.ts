// Mirrors api/openapi.yaml. Generate these when the write contract stabilizes.
export type Context = 'installed' | 'planned'

export interface Plan {
  id: string
  name: string
  baseRevision: string
  revision: string
  equipment: Equipment[]
  updates?: Equipment[]
  endpoints: Endpoint[]
  links: Link[]
}

export interface EquipmentInput {
  name: string
  kind: 'switch' | 'panel'
  role: 'access' | 'aggregation' | 'passive'
  rackId: string
  unit: number
  height: number
  portCount: number
}

export type PlanCommand =
  | {
      type: 'add_equipment'
      expectedRevision: string
      equipment: EquipmentInput
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
  kind: 'switch' | 'panel'
  role: string
  rackId: string
  unit: number
  height: number
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
  subpanel?: string
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
