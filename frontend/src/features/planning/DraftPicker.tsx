import { useState, type FormEvent } from 'react'
import { createPlan } from '../../shared/api'
import type { Plan } from '../../shared/types'
import { draftsOf, planOption } from './changes'
import { errorMessage } from './editing'
import { useInlineDialog } from './useInlineDialog'
import Field from '../../shared/ui/Field'
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
        <Field label="Draft" className="grow">
          {(id) => (
            <select
              id={id}
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
          )}
        </Field>
        {!creating && (
          <button
            className="btn"
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
    <form
      {...dialog}
      className="inline-form"
      onSubmit={submit}
      noValidate
      aria-label="New draft"
    >
      <Field label="Draft name" error={error}>
        {(id) => (
          <input
            id={id}
            type="text"
            value={name}
            maxLength={100}
            placeholder="e.g. Building B fit-out"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <div className="form-actions">
        <button className="btn primary" disabled={busy}>
          Create draft
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
