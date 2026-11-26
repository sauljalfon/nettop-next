import { useState } from 'react'
import { fixInstalledMany } from '../../shared/api'
import type { Snapshot, SwitchModel } from '../../shared/types'
import Name from '../../shared/ui/Name'
import { EditError } from '../planning/ConfirmShell'
import { useAsyncAction } from '../planning/useAsyncAction'
import { modelPortCount, renameTargets } from './model'
import ModelEditor from './ModelEditor'
import { useSwitchModels } from './useSwitchModels'
import './models.css'

interface Props {
  /** Installed: the switches a rename offers to update are found here, whichever context is open. */
  installed: Snapshot
  /** A plan is open: models are shared, and a rename can only say where to update the switches. */
  inPlan: boolean
  /** Start on a new model (from the library's + New model…). */
  startNew?: boolean
  onBack: () => void
  /** After a direct fix: refetch and toast. */
  onFixed: (message: string) => Promise<void>
}

interface Offer {
  oldName: string
  newName: string
  ids: string[]
}

const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? '' : word.endsWith('ch') ? 'es' : 's'}`

/**
 * The Switch models page (D51): the library's models beside the editor of the
 * chosen one. A full page like the Trace page, with ← Back. Models are shared
 * library data: they are not part of any plan and never change a switch that
 * was added from them, except by the rename offer (Installed only).
 */
export default function ModelsPage({
  installed,
  inPlan,
  startNew,
  onBack,
  onFixed,
}: Props) {
  const api = useSwitchModels()
  const [choice, setChoice] = useState<string | undefined>(
    startNew ? 'new' : undefined,
  )
  const [offer, setOffer] = useState<Offer>()
  const update = useAsyncAction()
  const models = api.models ?? []
  const chosen: SwitchModel | 'new' | undefined =
    choice === 'new'
      ? 'new'
      : (models.find((m) => m.id === choice) ?? models[0])
  const used = offer?.ids.length ?? 0

  const choose = (id: string) => {
    setOffer(undefined)
    setChoice(id)
  }

  return (
    <div className="models-page" data-testid="models-page">
      <div className="mp-bar">
        <button type="button" className="mp-back" onClick={onBack}>
          ← Back
        </button>
        <span className="mp-sep">›</span>
        <h2 className="mp-title">Switch models</h2>
        {inPlan && (
          <span className="mp-note">
            Models are shared; they are not part of the plan
          </span>
        )}
      </div>
      <div className="mp-body">
        <div className="mp-side">
          <div className="model-list card">
            {api.loading ? (
              <p className="muted mp-empty">Loading the models…</p>
            ) : models.length === 0 ? (
              <p className="muted mp-empty">No models yet.</p>
            ) : (
              models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="model-item"
                  data-testid="model-item"
                  aria-current={chosen !== 'new' && chosen?.id === m.id}
                  onClick={() => choose(m.id)}
                >
                  <b>
                    <Name text={m.name} className="name-cut" />
                  </b>
                  <span>
                    {m.manufacturer ? <Name text={m.manufacturer} /> : '—'} ·{' '}
                    {m.height}U · {modelPortCount(m)} ports
                  </span>
                </button>
              ))
            )}
          </div>
          <button type="button" className="btn" onClick={() => choose('new')}>
            + New model
          </button>
          {api.error && (
            <p className="model-error" role="alert">
              {api.error}
            </p>
          )}
          <p className="muted mp-hint">
            A switch copies its model&apos;s ports when it is added. Editing or
            deleting a model never changes switches already added.
          </p>
        </div>
        <div className="mp-main">
          {offer && (
            <div className="rename-offer" data-testid="rename-offer">
              <p>
                {plural(used, 'switch')} {used === 1 ? 'says' : 'say'}{' '}
                <Name text={offer.oldName} />.{' '}
                {inPlan
                  ? 'Update them from Installed.'
                  : 'Update their Model detail too?'}
              </p>
              {!inPlan && (
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={update.pending}
                    onClick={() =>
                      void update
                        .run(async () => {
                          await fixInstalledMany(
                            offer.ids.map((id) => ({
                              kind: 'equipment' as const,
                              id,
                              details: { model: offer.newName },
                            })),
                            `Model renamed to ${offer.newName}`,
                          )
                          await onFixed(
                            `Updated the Model detail of ${plural(offer.ids.length, 'switch')}.`,
                          )
                          return true
                        })
                        .then((done) => done && setOffer(undefined))
                    }
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setOffer(undefined)}
                  >
                    Not now
                  </button>
                </div>
              )}
              <EditError message={update.error} />
            </div>
          )}
          {chosen ? (
            <ModelEditor
              key={chosen === 'new' ? 'new' : chosen.id}
              model={chosen === 'new' ? undefined : chosen}
              onCreate={api.create}
              onUpdate={api.update}
              onDelete={api.remove}
              onSaved={(saved, oldName) => {
                setChoice(saved.id)
                const ids = oldName
                  ? renameTargets(installed.equipment, oldName).map((e) => e.id)
                  : []
                setOffer(
                  oldName && ids.length > 0
                    ? { oldName, newName: saved.name, ids }
                    : undefined,
                )
              }}
              onDeleted={() => {
                setOffer(undefined)
                setChoice(undefined)
              }}
            />
          ) : (
            !api.loading && (
              <div className="model-editor card muted">
                Choose a model or make a new one.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
