import { useId, useState } from 'react'
import type { DirectFix } from '../../shared/types'
import { EditError } from '../planning/ConfirmShell'
import { useAsyncAction } from '../planning/useAsyncAction'
import { useInlineDialog } from '../planning/useInlineDialog'
import '../planning/editing.css'
import './details.css'
import {
  changedFix,
  hasChanges,
  optionsFor,
  type FieldSpec,
  type Values,
} from './model'

/** Read-only details: every field, "—" when not set. */
export function DetailList({
  fields,
  values,
}: {
  fields: readonly FieldSpec[]
  values: Values
}) {
  return (
    <dl className="detail-list details-values">
      {fields.map((f) => (
        <div key={f.key}>
          <dt>{f.label}</dt>
          <dd className={f.mono ? 'mono' : undefined}>
            {values[f.key] || '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The one inline form for details: a direct fix (with the optional note) or a
 * plan save. It sends only what changed; an unchanged form just closes. The
 * server's refusal stays in the form, in its words. Escape closes it and
 * focus returns to the button that opened it (answer 19).
 */
export default function DetailsEditor({
  title,
  fields,
  before,
  withNote,
  hint,
  saveLabel,
  openerKey,
  onSave,
  onClose,
}: {
  title: string
  fields: readonly FieldSpec[]
  before: Values
  withNote: boolean
  hint: string
  saveLabel: string
  openerKey: string
  onSave: (fix: DirectFix) => Promise<void>
  onClose: () => void
}) {
  const id = useId()
  const [values, setValues] = useState<Values>(before)
  const [note, setNote] = useState('')
  const action = useAsyncAction()
  const dialog = useInlineDialog<HTMLFormElement>(onClose, openerKey)
  const fix = changedFix(fields, before, values, withNote ? note : '')
  return (
    <form
      {...dialog}
      className="inline-form details-form"
      aria-label={title}
      data-testid="details-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!hasChanges(fix)) {
          onClose()
          return
        }
        void action
          .run(async () => {
            await onSave(fix)
            return true
          })
          .then((saved) => {
            if (saved) onClose()
            // Save was disabled while pending, which dropped the focus: take it
            // back so Escape still reaches the form.
            else dialog.ref.current?.focus()
          })
      }}
    >
      <span className="eyebrow">{title}</span>
      {fields.map((f) => {
        const fieldId = `${id}-${f.key}`
        const value = values[f.key] ?? ''
        const set = (v: string) => {
          setValues((old) => ({ ...old, [f.key]: v }))
          action.clear()
        }
        return (
          <label key={f.key} htmlFor={fieldId}>
            {f.label}
            {f.kind === 'select' ? (
              <select
                id={fieldId}
                value={value}
                onChange={(e) => set(e.target.value)}
              >
                {optionsFor(f, value).map((o) => (
                  <option key={o} value={o}>
                    {o || '—'}
                  </option>
                ))}
              </select>
            ) : f.kind === 'textarea' ? (
              <textarea
                id={fieldId}
                value={value}
                rows={2}
                onChange={(e) => set(e.target.value)}
              />
            ) : (
              <input
                id={fieldId}
                className={f.mono ? 'mono' : undefined}
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            )}
          </label>
        )
      })}
      {withNote && (
        <label htmlFor={`${id}-note`}>
          Why (optional, kept in history)
          <input
            id={`${id}-note`}
            value={note}
            maxLength={500}
            placeholder="e.g. Asset audit"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      )}
      <span className="quiet">{hint}</span>
      <EditError message={action.error} />
      <div className="inline-row">
        <button
          className="button primary"
          type="submit"
          disabled={action.pending}
        >
          {saveLabel}
        </button>
        <button className="button" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
