import { useState, type FormEvent } from 'react'
import { createPlan } from '../../shared/api'
import type { Plan } from '../../shared/types'
import { draftsOf, planOption } from './changes'
import { errorMessage } from './editing'
import { useInlineDialog } from './useInlineDialog'
import './changes.css'

/**
 * The top of the Changes drawer in Plan view: a compact picker over the drafts
 * (recorded plans are never offered; a stale draft says it is behind Installed)
 * and New draft.
 */
export default function DraftPicker({
  plans,
  installedRevision,
  selected,
  onSelect,
  onCreated,
}: {
  plans: readonly Plan[]
  installedRevision: string
  selected?: Plan
  onSelect: (id: string) => void
  onCreated: (plan: Plan) => Promise<void>
}) {
  const drafts = draftsOf(plans)
  const [creating, setCreating] = useState(false)
  return (
    <div className="changes draft-picker" data-testid="draft-picker">
      <div className="head">
        <label className="grow">
          Draft
          <select
            aria-label="Draft"
            value={selected?.id ?? ''}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="" disabled>
              {drafts.length ? 'Choose a draft' : 'No drafts yet'}
            </option>
            {drafts.map((p) => (
              <option key={p.id} value={p.id}>
                {planOption(p, installedRevision)}
              </option>
            ))}
          </select>
        </label>
        {!creating && (
          <button
            className="button"
            data-opener="draft:new"
            onClick={() => setCreating(true)}
          >
            New draft
          </button>
        )}
      </div>
      {creating && (
        <NewDraft
          installedRevision={installedRevision}
          onClose={() => setCreating(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  )
}

function NewDraft({
  installedRevision,
  onClose,
  onCreated,
}: {
  installedRevision: string
  onClose: () => void
  onCreated: (plan: Plan) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialog = useInlineDialog<HTMLFormElement>(onClose, 'draft:new')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Enter a name.')
    setBusy(true)
    setError('')
    try {
      const plan = await createPlan(name.trim(), installedRevision)
      onClose()
      await onCreated(plan)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form {...dialog} onSubmit={submit} noValidate aria-label="New draft">
      <label>
        Draft name
        <input
          type="text"
          value={name}
          maxLength={100}
          placeholder="e.g. Building B fit-out"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      <div className="row">
        <button className="button primary" disabled={busy}>
          Create draft
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
