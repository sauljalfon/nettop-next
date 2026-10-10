// Mirrors api/openapi.yaml. Generate these when the write contract stabilizes.
export type Context = 'installed' | 'planned'

export interface Placement {
  equipmentId: string
  rackId: string
  unit: number
}
/** IDs of installed objects a plan removes (omitted lists are empty). */
export interface Removals {
  equipment?: string[]
  links?: string[]
  racks?: string[]
  nodes?: string[]
  sites?: string[]
}
export interface Plan {
  id: string
  name: string
  baseRevision: string
  revision: string
  /** A recorded plan is read-only and keeps its note as the record. */
  status: 'draft' | 'recorded'
  recordedAt?: string
  recordNote?: string
  /** Free-text name until identities exist (M7). */
  recordedBy?: string
  /**
   * Names of the objects the plan touches, by ID (equipment, racks, nodes, sites,
   * endpoints, removed cables), kept by the server so lines read in names even
   * for objects Installed no longer has. Absent on plans saved before labels.
   */
  labels?: Record<string, string>
  /** Proposed containers, applied before equipment. */
  sites?: { id: string; name: string }[]
  nodes?: { id: string; name: string; siteId: string }[]
  racks?: Rack[]
  equipment: Equipment[]
  /** Moves of installed equipment, by ID only. */
  placements?: Placement[]
  removals?: Removals
  /** Legacy: plans saved before placements; read-only, never written. */
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
      placement: Placement
    }
  | { type: 'add_site'; expectedRevision: string; site: { name: string } }
  | {
      type: 'add_node'
      expectedRevision: string
      node: { siteId: string; name: string }
    }
  | {
      type: 'add_rack'
      expectedRevision: string
      /** units 1–60 */
      rack: { nodeId: string; name: string; units: number }
    }
  /**
   * Removes one change of a draft by the key Check reports, with the changes
   * that depend on it. The one command a stale draft accepts. Answers with
   * RemoveChangeResult (use removeChange in api.ts).
   */
  | {
      type: 'remove_change'
      expectedRevision: string
      change: { key: string }
    }
  /**
   * 1–500 commands applied in order, all or nothing, with one revision bump
   * (use sendBatch in api.ts; the answer is BatchResult). No nesting, no
   * remove_change, and a command cannot refer to an object the batch creates.
   */
  | {
      type: 'batch'
      expectedRevision: string
      batch: { commands: BatchCommand[] }
    }
  /** target.id is an equipment ID (delete_equipment), a cable ID (disconnect_cable), or a rack, node or site ID that must be empty after the plan. */
  | {
      type:
        | 'delete_equipment'
        | 'disconnect_cable'
        | 'delete_rack'
        | 'delete_node'
        | 'delete_site'
      expectedRevision: string
      target: { id: string }
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
/** Saved arrangement of a node card on its site's Physical screen. */
export interface NodePosition {
  nodeId: string
  x: number
  y: number
}
/** Only nodes the user has moved have a position. */
export interface SiteLayout {
  siteId: string
  positions: NodePosition[]
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
  /** Find AGG / BB from every port of an active device. */
  | { mode: 'distribution'; device: string }
  /** Find AGG / BB from one exact device, panel, or HDF port. */
  | { mode: 'distribution'; start: string }
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
  /** Distribution routes and mismatches only; absent for point-to-point. */
  destinationEquipmentId?: string
  destinationRole?: 'aggregation' | 'backbone'
  destinationNetworkId?: string
  /** Empty when the source network is unresolved (passive start with no access device). */
  sourceNetworkId?: string
}
export type StartOutcomeName =
  | 'reached'
  | 'mismatch'
  | 'no_destination'
  | 'disconnected'
  | 'unresolved_network'
export interface StartOutcome {
  endpoint: string
  outcome: StartOutcomeName
}
export interface TraceResult {
  context: Context
  revision: string
  mode: TraceRequest['mode']
  status: 'reached' | 'unreachable'
  reason: string
  routes: Route[]
  /** Reached AGG/BB on another network; never routes. */
  mismatches: Route[]
  /** One entry per searched endpoint (distribution mode only). */
  starts: StartOutcome[]
  /** True when results were dropped at the route limit. */
  truncated: boolean
}

/** POST /plans/{id}/record: the recorded plan and the new installed revision. */
export interface RecordResult {
  plan: Plan
  installedRevision: string
}
/** One change of a draft that cannot move to the current installed topology. */
export interface PlanConflict {
  /** "<kind>:<id>", e.g. "place_equipment:panel-a" or "add_cable:cable-7". */
  change: string
  reason: string
}

/** The answer to a remove_change command. */
export interface RemoveChangeResult {
  plan: Plan
  /** Keys removed, the requested one first, then what depended on it. */
  removed: string[]
}
/** POST /plans/{id}/check: read-only. */
export interface CheckResult {
  /** The draft's base is no longer the installed revision. */
  stale: boolean
  conflicts: PlanConflict[]
}

/** A command inside a batch: any plan command that creates, moves or deletes, without its own revision. */
export type BatchCommand =
  | { type: 'add_equipment'; equipment: EquipmentInput }
  | { type: 'add_hdf'; hdf: HDFInput }
  | { type: 'add_cable'; cable: { a: string; b: string } }
  | { type: 'move_equipment'; placement: Placement }
  | { type: 'add_site'; site: { name: string } }
  | { type: 'add_node'; node: { siteId: string; name: string } }
  | { type: 'add_rack'; rack: { nodeId: string; name: string; units: number } }
  | {
      type:
        | 'delete_equipment'
        | 'disconnect_cable'
        | 'delete_rack'
        | 'delete_node'
        | 'delete_site'
      target: { id: string }
    }

/** The answer to a batch: the plan and, per command in order, the ID the server allocated ("" for commands that create nothing). */
export interface BatchResult {
  plan: Plan
  ids: string[]
}
