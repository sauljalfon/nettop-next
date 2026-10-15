import type { Plan } from '../../shared/types'
import { useUpdateDraft } from './useUpdateDraft'
import './changes.css'
import Name from '../../shared/ui/Name'

/**
 * Plan view of a stale draft (answer 11): its proposed topology cannot be built
 * on a changed Installed, so this card replaces the map and Physical.
 */
export default function StaleCard({
  plan,
  onSaved,
  notify,
  onOpenChanges,
  onViewInstalled,
}: {
  plan: Plan
  onSaved: (plan: Plan) => Promise<void>
  notify: (message: string) => void
  onOpenChanges: () => void
  onViewInstalled: () => void
}) {
  const update = useUpdateDraft({
    plan,
    onSaved,
    notify,
    onConflicts: onOpenChanges,
  })
  return (
    <div
      className="stale-card"
      data-testid="stale-card"
      role="region"
      aria-label="Stale draft"
    >
      <strong>Installed changed since this draft</strong>
      <span>
        “<Name text={plan.name} />” was drawn on an older Installed, so it can’t
        be shown here. <b>Update draft</b> re-checks every change on the current
        Installed and either moves the draft there or lists what no longer fits.
        Nothing is changed automatically.
      </span>
      {update.error && (
        <span className="error" role="alert">
          {update.error}
        </span>
      )}
      <div className="row">
        <button
          className="btn primary"
          disabled={update.pending}
          onClick={() => void update.run()}
        >
          {update.pending ? 'Updating…' : 'Update draft'}
        </button>
        <button className="btn" onClick={onOpenChanges}>
          Open Changes
        </button>
        <button className="btn" onClick={onViewInstalled}>
          View Installed
        </button>
      </div>
    </div>
  )
}
