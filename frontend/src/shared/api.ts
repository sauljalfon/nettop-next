import type {
  Context,
  Plan,
  PlanCommand,
  Snapshot,
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
