import { useState } from 'react'
import { APIError, rebasePlan } from '../../shared/api'
import type { Plan } from '../../shared/types'
import { plural } from '../physical/text'
import { errorMessage } from './editing'
import { rebaseSession } from './rebaseSession'

/**
 * Update draft (answer 5): re-check the whole draft on the current Installed.
 * Success moves it there; a 409 with conflicts is kept in the rebase session for
 * the card and the drawer to list. Nothing is half-applied, nothing is retried.
 */
export function useUpdateDraft({
  plan,
  onSaved,
  notify,
  onConflicts,
}: {
  plan: Plan
  onSaved: (plan: Plan) => Promise<void>
  notify: (message: string) => void
  /** Called when conflicts were found, to open the Changes drawer on them. */
  onConflicts?: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    setPending(true)
    setError('')
    try {
      const updated = await rebasePlan(plan.id, plan.revision)
      rebaseSession.clear(plan.id)
      await onSaved(updated)
      notify(`“${plan.name}” now sits on the current Installed.`)
    } catch (e) {
      if (e instanceof APIError && e.status === 409 && e.conflicts?.length) {
        rebaseSession.set(plan.id, e.conflicts)
        const n = e.conflicts.length
        notify(
          `${plural(n, 'change')} no longer fit${n === 1 ? 's' : ''} the current Installed. The draft is unchanged.`,
        )
        onConflicts?.()
      } else setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  return { run, pending, error }
}
