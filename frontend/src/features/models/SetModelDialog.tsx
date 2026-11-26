import { useMemo, useState } from 'react'
import { fixInstalledMany } from '../../shared/api'
import { optionText } from '../../shared/textPieces'
import type { Endpoint, Equipment } from '../../shared/types'
import Name from '../../shared/ui/Name'
import Pieces from '../../shared/ui/Pieces'
import { EditError } from '../planning/ConfirmShell'
import { useAsyncAction } from '../planning/useAsyncAction'
import { useInlineDialog } from '../planning/useInlineDialog'
import { modelPortCount, NO_POSITIONS_NOTE, type Line } from './model'
import {
  MAX_FIXES,
  modelNote,
  overview,
  type Section,
  type SwitchPorts,
} from './setModelMany'
import { useSwitchModels } from './useSwitchModels'

const TITLES: Record<Section['section'], string> = {
  details: 'Details',
  names: 'Port names',
  fields: 'Type, connector and speed',
  groups: 'Groups',
}
/** Port names shown in the dialog; the rest is counted. */
const SAMPLE = 3
const KEPT_SHOWN = 6

const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? '' : word.endsWith('ch') ? 'es' : 's'}`

interface Props {
  /** The equipment chosen (a switch; anything else is listed as skipped). */
  equipment: readonly Equipment[]
  /** Every endpoint of the snapshot. */
  endpoints: readonly Endpoint[]
  /** The `data-opener` mark focus returns to. */
  opener: string
  onClose: () => void
  /** After the fixes: refetch and toast. */
  onFixed: (message: string) => Promise<void>
  /** The Switch models page, when no model fits or the one wanted is missing. */
  onManageModels: () => void
}

const Lines = ({ lines, limit }: { lines: Line[]; limit?: number }) => (
  <>
    {lines.slice(0, limit).map((l, i) => (
      <div className="ln" key={i}>
        <Pieces pieces={l.pieces} />
      </div>
    ))}
    {limit !== undefined && lines.length > limit && (
      <div className="ln faint">… and {lines.length - limit} more</div>
    )}
  </>
)

/**
 * Set model… (D51), Installed only: choose a model, read What changes and Left
 * as typed, Apply. One request of direct fixes, each in the History of the
 * switch (and its port) with the note "Set model <name>". For one switch or many:
 * a switch the model does not fit is listed as skipped and left alone.
 */
export default function SetModelDialog({
  equipment,
  endpoints,
  opener,
  onClose,
  onFixed,
  onManageModels,
}: Props) {
  const { models, loading } = useSwitchModels()
  const [modelId, setModelId] = useState('')
  const dialog = useInlineDialog<HTMLDivElement>(onClose, opener)
  const action = useAsyncAction()
  const items = useMemo<SwitchPorts[]>(() => {
    const byEquipment = new Map<string, Endpoint[]>()
    const ids = new Set(equipment.map((e) => e.id))
    for (const p of endpoints)
      if (ids.has(p.equipmentId))
        (
          byEquipment.get(p.equipmentId) ??
          byEquipment.set(p.equipmentId, []).get(p.equipmentId)!
        ).push(p)
    return equipment.map((e) => ({
      equipment: e,
      ports: byEquipment.get(e.id) ?? [],
    }))
  }, [equipment, endpoints])
  const model = models?.find((m) => m.id === modelId)
  const result = useMemo(
    () => (model ? overview(items, model) : undefined),
    [items, model],
  )
  const one = items.length === 1
  const switches = items.filter((i) => i.equipment.kind === 'switch')
  const nothing =
    !!result && result.applicable.length > 0 && result.fixes.length === 0
  const refusal = !result
    ? undefined
    : result.applicable.length === 0
      ? 'No selected switch fits this model.'
      : result.tooMany
        ? `That is ${result.fixes.length} changes and one request holds ${MAX_FIXES}. Select fewer switches.`
        : nothing
          ? 'Nothing to change: these switches already match the model.'
          : undefined

  const apply = () =>
    result &&
    model &&
    void action
      .run(async () => {
        await fixInstalledMany(result.fixes, `Set model ${model.name}`)
        await onFixed(
          `Set model ${model.name} on ${plural(result.applicable.length, 'switch')}.`,
        )
        return true
      })
      .then((done) => done && onClose())

  return (
    <div className="set-model-scrim" onClick={onClose}>
      <div
        {...dialog}
        className="set-model drawer"
        role="dialog"
        aria-label="Set model"
        data-testid="set-model"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>
          {one ? (
            <>
              Set model of <Name text={equipment[0].name} />
            </>
          ) : (
            `Set model of ${items.length} switches`
          )}
        </h2>
        <p className="muted">
          Fills what is empty from the model.{' '}
          {one
            ? `Only models with the same number of ports (${items[0].ports.length}) can be chosen.`
            : 'A model is applied to the switches it fits; the others are listed and left as they are.'}
        </p>
        <div className="set-model-pick">
          <label className="field">
            <span className="label">Model</span>
            <select
              value={modelId}
              disabled={!!models && models.length === 0}
              onChange={(e) => setModelId(e.target.value)}
            >
              <option value="" disabled>
                {loading
                  ? 'Loading the models…'
                  : models && models.length > 0
                    ? 'Choose a model…'
                    : 'No models yet'}
              </option>
              {models?.map((m) => {
                const why = modelNote(switches, m)
                return (
                  <option key={m.id} value={m.id} disabled={!!why}>
                    {optionText([
                      { name: m.name },
                      {
                        text: ` · ${modelPortCount(m)} ports${why ? ` ${why}` : ''}`,
                      },
                    ])}
                  </option>
                )
              })}
            </select>
          </label>
          <button type="button" className="btn quiet" onClick={onManageModels}>
            Manage models…
          </button>
        </div>

        {result && (
          <>
            {result.skipped.length > 0 && (
              <div
                className="set-model-skipped"
                data-testid="set-model-skipped"
              >
                <h4>
                  Skipped{' '}
                  <span className="tag warn">{result.skipped.length}</span>
                </h4>
                {result.skipped.map((s) => (
                  <div className="ln" key={s.equipment.id}>
                    <Pieces pieces={s.pieces} />
                  </div>
                ))}
              </div>
            )}
            {result.applicable.length > 0 && (
              <div className="changes" data-testid="set-model-changes">
                {!one && result.applicable.length > 1 && (
                  <p className="sec faint">
                    {plural(result.applicable.length, 'switch')} will be set.
                    Lines are shown for <Name text={result.firstName} />; the
                    others are set the same way.
                  </p>
                )}
                {result.sections.map((s) => (
                  <div
                    className="sec"
                    key={s.section}
                    data-testid="set-model-section"
                    data-section={s.section}
                  >
                    <h4>
                      {TITLES[s.section]}{' '}
                      <span className="tag ok">fills {s.count}</span>
                    </h4>
                    <Lines
                      lines={s.lines}
                      limit={s.section === 'names' ? SAMPLE : undefined}
                    />
                  </div>
                ))}
                {result.keptCount > 0 && (
                  <div
                    className="sec kept"
                    data-testid="set-model-section"
                    data-section="kept"
                  >
                    <h4>
                      Left as typed{' '}
                      <span className="tag warn">
                        {result.keptCount} differs
                      </span>
                    </h4>
                    <Lines lines={result.kept} limit={KEPT_SHOWN} />
                    <div className="ln faint">
                      Fix it by hand if the model is right.
                    </div>
                  </div>
                )}
              </div>
            )}
            {result.applicable.length > 0 && (
              <p className="hint muted">
                {result.noPositions && `${NO_POSITIONS_NOTE}. `}
                Ports, their positions and cables, the network, role, height and
                place never change. Each change is written to the History of the
                switch it changes.
              </p>
            )}
          </>
        )}
        {refusal && (
          <p className="model-error" role="alert">
            {refusal}
          </p>
        )}
        <EditError message={action.error} />
        <div className="form-actions">
          <button
            type="button"
            className="btn primary"
            disabled={!result || !!refusal || action.pending}
            onClick={apply}
          >
            Apply
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <span className="muted">
            In Installed it applies at once, like Edit details.
          </span>
        </div>
      </div>
    </div>
  )
}
