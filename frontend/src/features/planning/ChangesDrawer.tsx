import { useEffect, useMemo, useState } from 'react'
import { removeChange } from '../../shared/api'
import type { Context, Plan, Snapshot } from '../../shared/types'
import ChangeList from './ChangeList'
import DraftPicker from './DraftPicker'
import { isStale } from './changes'
import InstalledChanges from './InstalledChanges'
import ReviewStep, { type RecordedInfo } from './ReviewStep'
import StaleChanges from './StaleChanges'
import { plural } from '../physical/text'
import { planSummary, undoMessage, type GoTarget } from './summary'
import './changes.css'

/**
 * The body of the Changes drawer. On Installed: drafts, New draft and the
 * recorded plans. In Plan view: the editor (plan selector and forms) with the
 * grouped summary and Record as installed… for a current draft, the banner and
 * conflicts for a stale one, and the review step while recording.
 */
export default function ChangesDrawer({
  context,
  plans,
  installed,
  selected,
  onSelectPlan,
  onOpenPlan,
  onCreated,
  onSaved,
  onRecorded,
  onGo,
  notify,
}: {
  context: Context
  plans: readonly Plan[]
  installed: Snapshot
  selected?: Plan
  onSelectPlan: (id: string) => void
  onOpenPlan: (id: string) => void
  onCreated: (plan: Plan) => Promise<void>
  onSaved: (plan: Plan) => Promise<void>
  onRecorded: (info: RecordedInfo) => Promise<void>
  onGo: (target: GoTarget, from: 'planned' | 'installed') => void
  notify: (message: string) => void
}) {
  const [reviewing, setReviewing] = useState(false)
  const lines = useMemo(
    () => (selected ? planSummary(selected, installed) : []),
    [selected, installed],
  )
  // Another draft, or no draft: the review step is over.
  const selectedId = selected?.id
  useEffect(() => setReviewing(false), [selectedId, context])

  const picker = (
    <DraftPicker
      plans={plans}
      installedRevision={installed.revision}
      selected={selected}
      onSelect={onSelectPlan}
      onCreated={onCreated}
    />
  )

  if (context === 'installed')
    return (
      <InstalledChanges
        plans={plans}
        installed={installed}
        onOpenPlan={onOpenPlan}
        onCreated={onCreated}
      />
    )
  if (!selected) return picker
  if (isStale(selected, installed.revision))
    return (
      <>
        {picker}
        <StaleChanges
          plan={selected}
          installed={installed}
          onSaved={onSaved}
          notify={notify}
          onGo={(t) => onGo(t, 'installed')}
        />
      </>
    )
  if (reviewing)
    return (
      <ReviewStep
        plan={selected}
        lines={lines}
        onBack={() => setReviewing(false)}
        onRecorded={onRecorded}
        onGo={(t) => onGo(t, 'planned')}
      />
    )
  return (
    <>
      {picker}
      <div className="changes" data-testid="draft-summary">
        <div className="head">
          <span className="section-label">Changes in this draft</span>
          <span className="hint">{plural(lines.length, 'change')}</span>
        </div>
        <ChangeList
          lines={lines}
          onGo={(t) => onGo(t, 'planned')}
          empty="No changes yet. Add equipment from the library, or use Add site, Add node and Add rack in Physical."
          onUndo={async (line) => {
            const result = await removeChange(
              selected.id,
              selected.revision,
              line.key,
            )
            await onSaved(result.plan)
            notify(undoMessage(lines, result.removed))
          }}
        />
        <button
          className="button primary block"
          disabled={lines.length === 0}
          onClick={() => setReviewing(true)}
        >
          Record as installed…
        </button>
        <span className="hint">
          Recording is a separate, explicit step with a note. Saving a change
          never records it.
        </span>
      </div>
    </>
  )
}
