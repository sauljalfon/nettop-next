import type {
  Context,
  Network,
  NodePosition,
  Plan,
  PlanCommand,
  Snapshot,
  SiteLayout,
  TraceRequest,
  TraceResult,
} from './types'

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
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
