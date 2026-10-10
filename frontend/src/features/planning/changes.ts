import type { Plan, PlanConflict } from '../../shared/types'
import { plural } from '../physical/text'

export const MAX_NOTE = 500
export const MAX_RECORDED_BY = 100

/** A draft whose base is no longer the installed revision. */
export const isStale = (plan: Plan, installedRevision: string) =>
  plan.status !== 'recorded' && plan.baseRevision !== installedRevision

/** Plans that can still be edited and opened in Plan view; recorded ones never. */
export const draftsOf = (plans: readonly Plan[]) =>
  plans.filter((p) => p.status !== 'recorded')

/** Recorded plans, newest first. */
export const recordedOf = (plans: readonly Plan[]) =>
  plans
    .filter((p) => p.status === 'recorded')
    .sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''))

/** The plan selector's text: a stale draft says it is behind Installed. */
export const planOption = (plan: Plan, installedRevision: string) =>
  `${plan.name} · revision ${plan.revision}${isStale(plan, installedRevision) ? ' · behind Installed' : ''}`

/** "Recorded on 9 Oct 2026, 14:25 by Dana Cohen · Installed EDGE-18". */
export function recordedLine(plan: Plan, locale = 'en-GB') {
  const when = plan.recordedAt
    ? new Date(plan.recordedAt).toLocaleString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  return `Recorded on ${when}${plan.recordedBy ? ` by ${plan.recordedBy}` : ''} · ${plan.recordNote ?? ''}`
}

/** What the review step needs before it enables Record. */
export function reviewState(input: {
  note: string
  recordedBy: string
  problems: number
  checking: boolean
  pending: boolean
}) {
  const note = input.note.trim()
  const by = input.recordedBy.trim()
  const noteError = !note
    ? 'Add a note: what was done.'
    : note.length > MAX_NOTE
      ? `Keep the note under ${MAX_NOTE} characters.`
      : ''
  const byError = !by
    ? 'Add who recorded this.'
    : by.length > MAX_RECORDED_BY
      ? `Keep the name under ${MAX_RECORDED_BY} characters.`
      : ''
  return {
    noteError,
    byError,
    canRecord:
      !noteError &&
      !byError &&
      input.problems === 0 &&
      !input.checking &&
      !input.pending,
  }
}

/** "3 changes no longer fit the current Installed:". */
export const conflictsTitle = (n: number) =>
  `${plural(n, 'change')} no longer fit${n === 1 ? 's' : ''} the current Installed:`

/** The toast after recording. */
export function recordedMessage(name: string, changes: number, others: number) {
  return (
    `Recorded ${plural(changes, 'change')} from “${name}”. Installed is updated` +
    (others > 0
      ? `; ${plural(others, 'other draft')} now need${others === 1 ? 's' : ''} Update draft`
      : '') +
    '.'
  )
}

/** Conflicts left after dropping one change (and whatever depended on it). */
export const withoutKeys = (
  conflicts: readonly PlanConflict[],
  removed: readonly string[],
) => conflicts.filter((c) => !removed.includes(c.change))

/** The conflict a server answered "this plan is already recorded" with. */
export const isAlreadyRecorded = (status: number, message: string) =>
  status === 409 && /recorded and read-only/.test(message)

const KEY = 'nettop.recordedBy'
type Store = Pick<Storage, 'getItem' | 'setItem'>
const browser = (): Store | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** The name last used to record in this browser; empty when storage is unavailable. */
export function lastRecordedBy(store: Store | undefined = browser()): string {
  try {
    return store?.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberRecordedBy(
  name: string,
  store: Store | undefined = browser(),
) {
  try {
    store?.setItem(KEY, name.trim())
  } catch {
    // Storage may be blocked or full: the name just is not remembered.
  }
}
