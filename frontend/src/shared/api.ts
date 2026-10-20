import type {
  BatchCommand,
  BatchResult,
  ChangeLogEntry,
  ChangeLogKind,
  Context,
  DirectFix,
  DirectFixItem,
  Network,
  NodePosition,
  Plan,
  PlanCommand,
  CheckResult,
  Health,
  PlanConflict,
  RecordResult,
  RemoveChangeResult,
  Snapshot,
  MapLayout,
  SiteLayout,
  TraceRequest,
  TraceResult,
} from './types'

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Set by Update draft (409): every change that cannot move. */
    public conflicts?: PlanConflict[],
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new APIError(
      response.status,
      body?.error ??
        `API request failed (${response.status}). Check the Go server is running.`,
      Array.isArray(body?.conflicts) ? body.conflicts : undefined,
    )
  }
  return response.json() as Promise<T>
}

function contextQuery(context: Context, planID?: string, revision?: string) {
  const query = new URLSearchParams({ context })
  if (context === 'planned' && planID) query.set('planId', planID)
  if (revision) query.set('expectedRevision', revision)
  return query.toString()
}
/** The API's health and environment; the header reads the environment once. */
export const getHealth = (signal?: AbortSignal) =>
  request<Health>('/health', { signal })
export const getSnapshot = (
  context: Context,
  signal?: AbortSignal,
  planID?: string,
) => request<Snapshot>(`/topology?${contextQuery(context, planID)}`, { signal })
export const trace = (
  context: Context,
  body: TraceRequest,
  planID?: string,
  revision?: string,
) =>
  request<TraceResult>(`/traces?${contextQuery(context, planID, revision)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getPlans = (signal?: AbortSignal) =>
  request<Plan[]>('/plans', { signal })
export const createPlan = (name: string, expectedBaseRevision: string) =>
  request<Plan>('/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, expectedBaseRevision }),
  })
export const sendPlanCommand = (id: string, command: PlanCommand) =>
  request<Plan>(`/plans/${encodeURIComponent(id)}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
/**
 * Record a draft as installed. `note` (1–500 characters) and `recordedBy`
 * (1–100 characters, free text until identities exist) are required.
 */
export const recordPlan = (
  id: string,
  expectedRevision: string,
  note: string,
  recordedBy: string,
) =>
  request<RecordResult>(`/plans/${encodeURIComponent(id)}/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision, note, recordedBy }),
  })
/**
 * Undo or drop one change of a draft, named by a conflict's `change` key or a
 * summary line's key. Allowed on a stale draft.
 */
export const removeChange = (
  id: string,
  expectedRevision: string,
  key: string,
) =>
  request<RemoveChangeResult>(`/plans/${encodeURIComponent(id)}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'remove_change',
      expectedRevision,
      change: { key },
    }),
  })
/**
 * Applies 1–500 commands in order, all or nothing, with one revision bump. The
 * answer lists the IDs the server allocated, one per command ("" for commands
 * that create nothing). A failing command is a 422 that names its 1-based
 * position and why; nothing is saved then.
 */
export const sendBatch = (
  id: string,
  expectedRevision: string,
  commands: BatchCommand[],
) =>
  request<BatchResult>(`/plans/${encodeURIComponent(id)}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'batch',
      expectedRevision,
      batch: { commands },
    }),
  })
/** Read-only check of a draft against the current installed topology. */
export const checkPlan = (id: string) =>
  request<CheckResult>(`/plans/${encodeURIComponent(id)}/check`, {
    method: 'POST',
  })
/** Recorded plans that added, moved or removed an object, newest first. */
export const recordedPlansFor = (objectId: string, signal?: AbortSignal) =>
  request<Plan[]>(`/plans?objectId=${encodeURIComponent(objectId)}`, { signal })
/** Update draft: move a draft to the current installed revision. */
export const rebasePlan = (id: string, expectedRevision: string) =>
  request<Plan>(`/plans/${encodeURIComponent(id)}/rebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision }),
  })

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const getSiteLayout = (siteID: string, signal?: AbortSignal) =>
  request<SiteLayout>(`/sites/${encodeURIComponent(siteID)}/layout`, {
    signal,
  })
/** Last write wins per node; the server validates the node belongs to the site. */
export const saveNodePosition = (
  siteID: string,
  nodeID: string,
  position: { x: number; y: number },
) =>
  request<NodePosition>(
    `/sites/${encodeURIComponent(siteID)}/layout/nodes/${encodeURIComponent(nodeID)}`,
    json('PUT', position),
  )
export const getMapLayout = (signal?: AbortSignal) =>
  request<MapLayout>('/map-layout', { signal })
/** Last write wins per node; the server validates the node exists. */
export const saveMapPosition = (
  nodeID: string,
  position: { x: number; y: number },
) =>
  request<NodePosition>(
    `/map-layout/nodes/${encodeURIComponent(nodeID)}`,
    json('PUT', position),
  )
export const resetMapLayout = async () => {
  const response = await fetch('/api/map-layout', { method: 'DELETE' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new APIError(
      response.status,
      body?.error ?? `API request failed (${response.status}).`,
    )
  }
}
export const resetSiteLayout = async (siteID: string) => {
  const response = await fetch(
    `/api/sites/${encodeURIComponent(siteID)}/layout`,
    { method: 'DELETE' },
  )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new APIError(
      response.status,
      body?.error ?? `API request failed (${response.status}).`,
    )
  }
}

export const createNetwork = (name: string) =>
  request<Network>('/networks', json('POST', { name }))
export const renameNetwork = (id: string, name: string) =>
  request<Network>(
    `/networks/${encodeURIComponent(id)}`,
    json('PATCH', { name }),
  )

const FIX_PATH: Record<ChangeLogKind, string> = {
  equipment: 'equipment',
  endpoint: 'endpoints',
  link: 'links',
  site: 'sites',
  node: 'nodes',
  rack: 'racks',
}
/**
 * A direct fix of installed names and details (never topology): the server
 * writes one change-log row per changed field and keeps the topology revision,
 * so drafts stay current. 404 unknown object, 409 duplicate name, 422 invalid.
 */
export const fixInstalled = (kind: ChangeLogKind, id: string, fix: DirectFix) =>
  request<{ changes: ChangeLogEntry[] }>(
    `/installed/${FIX_PATH[kind]}/${encodeURIComponent(id)}`,
    json('PATCH', fix),
  )
/**
 * Up to 500 direct fixes of details in one request, applied in order and all
 * or nothing: any refusal (422, naming the fix by its position) writes
 * nothing. The note goes on every change-log row.
 */
export const fixInstalledMany = (fixes: DirectFixItem[], note?: string) =>
  request<{ changes: ChangeLogEntry[] }>(
    '/installed/fixes',
    json('POST', {
      fixes: fixes.map((f) => ({ ...f, kind: FIX_PATH[f.kind] })),
      ...(note === undefined ? {} : { note }),
    }),
  )
/** An object's direct fixes, newest first. */
export const getChangeLog = (
  kind: ChangeLogKind,
  id: string,
  signal?: AbortSignal,
) =>
  request<ChangeLogEntry[]>(
    `/change-log?entityKind=${kind}&entityId=${encodeURIComponent(id)}`,
    { signal },
  )
