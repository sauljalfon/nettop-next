// Mirrors api/openapi.yaml. Generate these when the write contract stabilizes.
export type Context = 'installed' | 'planned'

/** The environment the API was started with (APP_ENV). */
export type AppEnvironment = 'dev' | 'test' | 'prod'

/** GET /api/health. */
export interface Health {
  status: string
  storage: string
  environment: AppEnvironment
}

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
/**
 * Optional details of an object (step 11). Flat optional strings; absent means
 * not set. Descriptive data only: nothing that follows continuity reads them.
 * Value sets: equipment status active/inactive/maintenance; port type
 * copper/fiber; port state available/reserved/disabled/faulty; cable status
 * active/inactive/testing; rack type standard/wall-mount/open-frame. Text is at
 * most 200 characters (1,000 for description and notes); ipAddress is IPv4 or
 * IPv6; serialNumber is unique among filled values, ignoring case.
 */
export interface EquipmentDetails {
  manufacturer?: string
  model?: string
  serialNumber?: string
  ipAddress?: string
  status?: 'active' | 'inactive' | 'maintenance'
  description?: string
}
export interface PortDetails {
  portType?: 'copper' | 'fiber'
  /** Free text; RJ45, LC, SC, ST, SFP, SFP+ and QSFP are suggestions. */
  connector?: string
  /** Free text such as "10G". */
  speed?: string
  state?: 'available' | 'reserved' | 'disabled' | 'faulty'
  description?: string
}
/** Cables only; a bridge carries none. */
export interface CableDetails {
  label?: string
  status?: 'active' | 'inactive' | 'testing'
  notes?: string
}
export interface PlaceDetails {
  location?: string
  description?: string
}
export interface RackDetails extends PlaceDetails {
  rackType?: 'standard' | 'wall-mount' | 'open-frame'
}
/**
 * The `details` payload of a command: any subset of the detail fields. An empty
 * string clears a field; an unknown name is a 400, a field that does not apply
 * to the object a 422.
 */
export type Details = EquipmentDetails &
  PortDetails &
  CableDetails &
  RackDetails

/** change_log's entity kinds (singular); the PATCH path uses the plural. */
export type ChangeLogKind =
  'equipment' | 'endpoint' | 'link' | 'site' | 'node' | 'rack'

/** One field changed by a direct fix (GET /change-log, PATCH /installed/...). */
export interface ChangeLogEntry {
  id: number
  at: string
  entityKind: ChangeLogKind
  entityId: string
  field: string
  oldValue: string
  newValue: string
  note?: string
}

/**
 * A direct fix of an installed object: its name (a switch port's label) and
 * detail fields only, never topology. An empty string clears a detail.
 */
export interface DirectFix {
  name?: string
  details?: Details
  note?: string
}

/** One fix of POST /installed/fixes: details only (names are changed one at a time). */
export interface DirectFixItem {
  kind: ChangeLogKind
  id: string
  details?: Details
}

/** Up to 500 direct fixes applied in order, all or nothing. */
export interface DirectFixMany {
  fixes: DirectFixItem[]
  note?: string
}

/** update_details changes on objects the plan adds, one entry per object. */
export interface DetailUpdate {
  id: string
  details: Details
}

/** The proposed name of one piece of equipment the plan adds (rename_equipment). */
export interface Rename {
  id: string
  name: string
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
  sites?: Site[]
  nodes?: LocationNode[]
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
  /** update_details entries (undo with remove_change key update_details:<id>). */
  details?: DetailUpdate[]
  /** rename_equipment entries (undo with remove_change key rename_equipment:<id>). */
  renames?: Rename[]
}

export interface EquipmentInput {
  name: string
  kind: 'switch' | 'panel'
  role: 'access' | 'aggregation' | 'backbone' | 'passive'
  networkId?: string
  rackId: string
  unit: number
  height: number
  /** Switch ports (1–96) or panel positions (1–48). A switch given portGroups leaves it out. */
  portCount?: number
  /**
   * Switches only, 1–8 groups: the ports are named and described in groups. Ports
   * get position 1…N in group order and portGroup 1…G. Without them a switch
   * has one group, "Port {n}".
   */
  portGroups?: PortGroupInput[]
  details?: EquipmentDetails
}

/** Count ports named by `names` (exactly one "{n}"), numbered from `start` (default 1). */
export interface PortGroupInput {
  /** With names (a pattern with one "{n}"). */
  count?: number
  names?: string
  start?: number
  /** Or the labels as they are, instead of count and names (Duplicate copies a group this way). */
  labels?: string[]
  details?: Pick<PortDetails, 'portType' | 'connector' | 'speed'>
}

export interface HDFInput {
  name: string
  rackId: string
  unit: number
  /** Chassis height in rack units; independent of rows. */
  height: number
  /** Grid rows, 1–32; creates 4 subpanels, 24 positions per row. */
  rows: number
  /** Details of the HDF itself. */
  details?: EquipmentDetails
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
      cable: { a: string; b: string; details?: CableDetails }
    }
  | {
      type: 'move_equipment'
      expectedRevision: string
      placement: Placement
    }
  | {
      type: 'add_site'
      expectedRevision: string
      site: { name: string; details?: PlaceDetails }
    }
  | {
      type: 'add_node'
      expectedRevision: string
      node: { siteId: string; name: string; details?: PlaceDetails }
    }
  | {
      type: 'add_rack'
      expectedRevision: string
      /** units 1–60 */
      rack: {
        nodeId: string
        name: string
        units: number
        details?: RackDetails
      }
    }
  /**
   * Sets or clears details of an object the plan adds (including a proposed
   * equipment's ports); undone by remove_change with update_details:<id>. An
   * installed object is refused (422): installed details are changed by a
   * direct fix.
   */
  | {
      type: 'update_details'
      expectedRevision: string
      target: { id: string }
      details: Details
    }
  /**
   * Renames equipment the plan adds; undone by remove_change with
   * rename_equipment:<id>. Installed equipment is refused (422): it is renamed
   * by a direct fix.
   */
  | {
      type: 'rename_equipment'
      expectedRevision: string
      target: { id: string }
      name: string
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
export interface Equipment extends EquipmentDetails {
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
/** Saved arrangement of the conceptual overview: one space for the whole network. */
export interface MapLayout {
  positions: NodePosition[]
}
export interface Rack extends RackDetails {
  nodeId: string
  id: string
  name: string
  units: number
}
export interface Site extends PlaceDetails {
  id: string
  name: string
}
export interface LocationNode extends PlaceDetails {
  id: string
  name: string
  siteId: string
}
export interface Endpoint extends PortDetails {
  id: string
  equipmentId: string
  label: string
  subpanelId?: string
  /**
   * Panels and HDFs: the position on a side. Switches: the order of the port
   * (1…N in port group order); absent on ports saved before groups, which are
   * ordered by the number in their label. Only `side` tells a panel position
   * from a switch port.
   */
  position?: number
  side?: 'front' | 'rear'
  /** Switches: the 1-based port group; absent on ports saved before groups. */
  portGroup?: number
}
export interface Link extends CableDetails {
  id: string
  a: string
  b: string
  kind: 'cable' | 'internal'
}
export interface Snapshot {
  networks: Network[]
  subpanels: Subpanel[]
  sites: Site[]
  nodes: LocationNode[]
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
  | {
      type: 'add_cable'
      cable: { a: string; b: string; details?: CableDetails }
    }
  | { type: 'move_equipment'; placement: Placement }
  | { type: 'add_site'; site: { name: string; details?: PlaceDetails } }
  | {
      type: 'add_node'
      node: { siteId: string; name: string; details?: PlaceDetails }
    }
  | {
      type: 'add_rack'
      rack: {
        nodeId: string
        name: string
        units: number
        details?: RackDetails
      }
    }
  | { type: 'update_details'; target: { id: string }; details: Details }
  | { type: 'rename_equipment'; target: { id: string }; name: string }
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
