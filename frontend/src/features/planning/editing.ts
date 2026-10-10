import { useRef } from 'react'
import type { Plan, PlanCommand } from '../../shared/types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

/** A plan command without its revision: the workspace adds the draft's current one. */
export type EditCommand = DistributiveOmit<PlanCommand, 'expectedRevision'>

/**
 * Sends one command to the open draft, refreshes the plan and the planned
 * topology (keeping location and selection), shows the saved toast, and returns
 * the saved plan. It rejects with the server's own error (an APIError for
 * 409/422), which the form or confirm that asked shows in the server's words.
 * It is undefined whenever editing is off: Installed, or a draft that is not
 * current.
 */
export type PlanEdit = (command: EditCommand) => Promise<Plan>

/** The server's prefix on a refused command; the reason after it is what the user needs. */
const REFUSED = 'invalid plan command: '

/** The text to show for a failed command: the server's own words, without its technical prefix. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message)
    return 'Could not save. Check the API logs.'
  return error.message.startsWith(REFUSED)
    ? error.message.slice(REFUSED.length)
    : error.message
}

/**
 * The last PlanEdit that was defined. While a draft reloads (after a 409, or a
 * save) `edit` is briefly undefined; a form that is open keeps working with this
 * one, so its error stays on screen instead of the form vanishing.
 */
export function useLastEdit(edit: PlanEdit | undefined) {
  const last = useRef(edit)
  if (edit) last.current = edit
  return last.current
}
