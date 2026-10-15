import { useState, type FormEvent } from 'react'
import { createPlan } from '../../shared/api'
import type { Plan, Snapshot } from '../../shared/types'
import { plural } from '../physical/text'
import { changeCount } from './changeCount'
import { draftsOf, isStale, recordedLine, recordedOf } from './changes'
import { errorMessage } from './editing'
import { planSummary, groupLines } from './summary'
import './changes.css'
import Name from '../../shared/ui/Name'
import Chip from '../../shared/ui/Chip'
import Field from '../../shared/ui/Field'

/**
 * The Changes drawer on Installed: the drafts (current, or "Installed
 * changed"), a New draft form, and the recorded plans, read-only, each with its
 * date, who, why and an expandable list of what it changed.
 */
export default function InstalledChanges({
  plans,
  installed,
  onOpenPlan,
  onCreated,
}: {
  plans: readonly Plan[]
  installed: Snapshot
  onOpenPlan: (id: string) => void
  onCreated: (plan: Plan) => Promise<void>
}) {
  const drafts = draftsOf(plans)
  const recorded = recordedOf([...plans])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string>()
  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Enter a name.')
    setBusy(true)
    setError('')
    try {
      const plan = await createPlan(name.trim(), installed.revision)
      setCreating(false)
      setName('')
      await onCreated(plan)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="changes" data-testid="installed-changes">
      <span className="section-label">Drafts</span>
      {drafts.length === 0 && <span className="hint">No drafts.</span>}
      {drafts.map((p) => {
        const stale = isStale(p, installed.revision)
        return (
          <div
            key={p.id}
            className="plan-row"
            data-testid="draft-row"
            data-plan-id={p.id}
            data-stale={stale}
          >
            <div className="top-line">
              <b>
                <Name text={p.name} />
              </b>
              {stale ? (
                <Chip kind="state" className="behind">
                  Installed changed
                </Chip>
              ) : (
                <Chip kind="state" className="current">
                  current
                </Chip>
              )}
            </div>
            <span className="hint">{plural(changeCount(p), 'change')}</span>
            <button
              className="btn"
              style={{ justifySelf: 'start' }}
              aria-label={`Open ${p.name} in Plan`}
              onClick={() => onOpenPlan(p.id)}
            >
              Open in Plan
            </button>
          </div>
        )
      })}
      {creating ? (
        <form className="inline-form" onSubmit={create} noValidate>
          <Field label="Draft name" error={error}>
            {(id) => (
              <input
                id={id}
                type="text"
                autoFocus
                value={name}
                placeholder="e.g. Building B fit-out"
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <div className="form-actions">
            <button className="btn primary" disabled={busy}>
              Create draft
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className="btn"
          style={{ justifySelf: 'start' }}
          onClick={() => setCreating(true)}
        >
          New draft
        </button>
      )}
      <span className="section-label">Recorded plans · read-only</span>
      {recorded.length === 0 && (
        <span className="hint">Nothing recorded yet.</span>
      )}
      {recorded.map((p) => {
        // From the plan and its labels: what it removed is no longer in Installed.
        const lines = groupLines(planSummary(p, installed)).flatMap((g) =>
          g.lines.map((l) => `${g.group} · ${l.text}`),
        )
        return (
          <div
            key={p.id}
            className="plan-row"
            data-testid="recorded-row"
            data-plan-id={p.id}
          >
            <div className="top-line">
              <b>
                <Name text={p.name} />
              </b>
              <Chip kind="state" className="recorded">
                Recorded
              </Chip>
            </div>
            <span className="hint" data-testid="recorded-line">
              {recordedLine(p)}
            </span>
            <button
              className="btn quiet"
              style={{ justifySelf: 'start' }}
              aria-expanded={open === p.id}
              onClick={() => setOpen(open === p.id ? undefined : p.id)}
            >
              {open === p.id ? 'Hide' : 'Show'} {plural(lines.length, 'change')}
            </button>
            {open === p.id && (
              <ul
                style={{ margin: 0, paddingLeft: 18 }}
                data-testid="recorded-changes"
              >
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
