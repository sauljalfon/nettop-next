import { useState, useSyncExternalStore } from 'react'
import { checkPlan, removeChange } from '../../shared/api'
import type { Plan, Snapshot } from '../../shared/types'
import { plural } from '../physical/text'
import ChangeList from './ChangeList'
import { conflictsTitle } from './changes'
import { errorMessage } from './editing'
import { rebaseSession } from './rebaseSession'
import { lineForKey, planSummary, undoMessage, type GoTarget } from './summary'
import { useUpdateDraft } from './useUpdateDraft'
import './changes.css'

/**
 * A stale draft in the drawer (answer 5, 9): the banner, Update draft, and the
 * conflicts it found, each with a link to the object, the reason, and Drop. The
 * draft cannot be edited until Update draft succeeds, so Drop (remove_change,
 * the one command a stale draft accepts) is how a conflicting change goes.
 */
export default function StaleChanges({
  plan,
  installed,
  onSaved,
  notify,
  onGo,
}: {
  plan: Plan
  installed: Snapshot
  onSaved: (plan: Plan) => Promise<void>
  notify: (message: string) => void
  onGo: (target: GoTarget) => void
}) {
  const conflicts = useSyncExternalStore(rebaseSession.subscribe, () =>
    rebaseSession.conflicts(plan.id),
  )
  const update = useUpdateDraft({ plan, onSaved, notify })
  const lines = planSummary(plan, installed)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string>()
  const drop = async (key: string) => {
    setBusy(key)
    setError('')
    try {
      const result = await removeChange(plan.id, plan.revision, key)
      await onSaved(result.plan)
      notify(undoMessage(lines, result.removed))
      // The conflicts that remain, as the server sees them now.
      rebaseSession.set(plan.id, (await checkPlan(plan.id)).conflicts)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <div className="changes" data-testid="stale-changes">
      <div className="head">
        <div>
          <span className="eyebrow">Draft</span>
          <div className="title">{plan.name}</div>
        </div>
        <span className="hint">{plural(lines.length, 'change')}</span>
      </div>
      <div className="notice" data-testid="stale-banner">
        <strong>Installed changed since this draft.</strong>
        <span>
          Update draft re-checks every change on the current Installed. If they
          all still fit, the draft moves there; otherwise each change that no
          longer fits is listed and nothing is changed.
        </span>
        <div className="row">
          <button
            className="button primary"
            disabled={update.pending}
            onClick={() => void update.run()}
          >
            {update.pending ? 'Updating…' : 'Update draft'}
          </button>
        </div>
        {update.error && (
          <span className="error" role="alert">
            {update.error}
          </span>
        )}
      </div>
      {conflicts && conflicts.length > 0 && (
        <div className="notice problem" data-testid="conflicts">
          <strong>{conflictsTitle(conflicts.length)}</strong>
          {conflicts.map((c) => {
            const line = lineForKey(lines, c.change)
            return (
              <div
                key={c.change}
                className="chg-row"
                data-testid="conflict"
                data-key={c.change}
              >
                <span className="what">
                  {line?.go ? (
                    <button className="link" onClick={() => onGo(line.go!)}>
                      {line.text}
                    </button>
                  ) : (
                    (line?.text ?? 'A change in this draft')
                  )}
                  <span className="why">{c.reason}</span>
                </span>
                <button
                  className="button"
                  aria-label={`Drop: ${line?.text ?? c.change}`}
                  disabled={busy !== undefined}
                  onClick={() => void drop(c.change)}
                >
                  Drop
                </button>
              </div>
            )
          })}
        </div>
      )}
      {conflicts && conflicts.length === 0 && (
        <div className="notice info" data-testid="conflicts-none">
          <span>
            All changes fit the current Installed now. Press{' '}
            <strong>Update draft</strong> to move the draft there.
          </span>
        </div>
      )}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      <span className="section-label">Changes in this draft</span>
      <ChangeList lines={lines} onGo={onGo} empty="No changes." />
    </div>
  )
}
