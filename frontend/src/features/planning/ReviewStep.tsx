import { useEffect, useRef, useState, type FormEvent } from 'react'
import { APIError, checkPlan, recordPlan } from '../../shared/api'
import type { CheckResult, Plan } from '../../shared/types'
import ChangeList from './ChangeList'
import {
  MAX_NOTE,
  MAX_RECORDED_BY,
  conflictsTitle,
  isAlreadyRecorded,
  lastRecordedBy,
  rememberRecordedBy,
  reviewState,
} from './changes'
import { errorMessage } from './editing'
import { lineForKey, type ChangeLine, type GoTarget } from './summary'
import { plural } from '../physical/text'
import './changes.css'
import Name from '../../shared/ui/Name'
import Field from '../../shared/ui/Field'

/** What Record tells the workspace: the plan, how many changes, and whether it was already recorded. */
export interface RecordedInfo {
  plan: Plan
  changes: number
  already?: boolean
}

/**
 * The review step before recording (answers 6, 12, 13, 14): a read-only check
 * runs when it opens and lists any problem first; then the full grouped list,
 * "Only record what is physically done.", a required note, a required
 * "Recorded by", and Record. Record is off while a problem stands or a request
 * runs. If the server says the plan is already recorded, that is shown as done.
 */
export default function ReviewStep({
  plan,
  lines,
  onBack,
  onRecorded,
  onGo,
}: {
  plan: Plan
  lines: readonly ChangeLine[]
  onBack: () => void
  onRecorded: (info: RecordedInfo) => Promise<void>
  onGo: (target: GoTarget) => void
}) {
  const [note, setNote] = useState('')
  const [by, setBy] = useState(() => lastRecordedBy())
  const [check, setCheck] = useState<CheckResult>()
  const [checkError, setCheckError] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const sending = useRef(false) // a second click in the same moment never sends again
  useEffect(() => {
    let live = true
    checkPlan(plan.id)
      .then((r) => live && setCheck(r))
      .catch((e) => live && setCheckError(errorMessage(e)))
    return () => {
      live = false
    }
  }, [plan.id, plan.revision])

  const problems = check ? check.conflicts.length + (check.stale ? 1 : 0) : 0
  const state = reviewState({
    note,
    recordedBy: by,
    problems: problems + (checkError ? 1 : 0),
    checking: !check && !checkError,
    pending,
  })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!state.canRecord || sending.current) return
    sending.current = true
    setPending(true)
    setError('')
    try {
      const result = await recordPlan(
        plan.id,
        plan.revision,
        note.trim(),
        by.trim(),
      )
      rememberRecordedBy(by)
      await onRecorded({ plan: result.plan, changes: lines.length })
    } catch (e) {
      if (e instanceof APIError && isAlreadyRecorded(e.status, e.message)) {
        // A repeated request: the plan is recorded, so show it as recorded.
        await onRecorded({ plan, changes: lines.length, already: true })
        return
      }
      setError(errorMessage(e))
      sending.current = false
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="changes" data-testid="review-step">
      <div>
        <span className="eyebrow">Review</span>
        <div className="title">
          Record “<Name text={plan.name} />” as installed
        </div>
      </div>
      <div data-testid="review-check" aria-live="polite">
        {!check && !checkError && (
          <span className="hint">Checking the draft…</span>
        )}
        {checkError && (
          <div className="notice problem" role="alert">
            <strong>The check could not run.</strong>
            <span>{checkError}</span>
          </div>
        )}
        {check && problems === 0 && (
          <div className="notice info">
            <span>
              <strong>No problems found.</strong> Every change fits the current
              Installed.
            </span>
          </div>
        )}
        {check && problems > 0 && (
          <div
            className="notice problem"
            role="alert"
            data-testid="review-problems"
          >
            {check.stale ? (
              <strong>
                Installed changed since this draft; update the draft first.
              </strong>
            ) : (
              <strong>{conflictsTitle(check.conflicts.length)}</strong>
            )}
            {check.conflicts.map((c) => {
              const line = lineForKey(lines, c.change)
              return (
                <div
                  key={c.change}
                  className="chg-row"
                  data-testid="review-problem"
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
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="review-list" data-testid="review-list">
        <ChangeList lines={lines} onGo={onGo} />
      </div>
      <div className="notice">
        <strong>Only record what is physically done.</strong>
        <span>
          Recording updates Installed for everyone in one step and makes this
          plan read-only. Other drafts will show “Installed changed” and need
          Update draft.
        </span>
      </div>
      <form className="inline-form" onSubmit={submit} noValidate>
        <Field
          label="Note (required)"
          hint={
            <>
              {note.trim().length}/{MAX_NOTE}
            </>
          }
          error={
            (touched || note.trim().length > MAX_NOTE) && state.noteError
              ? state.noteError
              : undefined
          }
        >
          {(id) => (
            <textarea
              id={id}
              value={note}
              placeholder="e.g. Installed EDGE-18 in A03 U5, patched port 1 to PANEL-A 4"
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Recorded by (required)"
          error={
            (touched || by.trim().length > MAX_RECORDED_BY) && state.byError
              ? state.byError
              : undefined
          }
        >
          {(id) => (
            <input
              id={id}
              type="text"
              value={by}
              maxLength={MAX_RECORDED_BY + 20}
              onChange={(e) => setBy(e.target.value)}
            />
          )}
        </Field>
        {error && (
          <span className="error" role="alert" data-testid="record-error">
            {error}
          </span>
        )}
        <div className="form-actions">
          <button className="btn primary lg" disabled={!state.canRecord}>
            {pending
              ? 'Recording…'
              : `Record ${plural(lines.length, 'change')}`}
          </button>
          <button type="button" className="btn lg" onClick={onBack}>
            Back to changes
          </button>
        </div>
      </form>
    </div>
  )
}
