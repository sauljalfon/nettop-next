import { Trash2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { APIError } from '../../shared/api'
import type { TextPiece } from '../../shared/textPieces'
import type { SwitchModel, SwitchModelInput } from '../../shared/types'
import Field from '../../shared/ui/Field'
import Name from '../../shared/ui/Name'
import Pieces from '../../shared/ui/Pieces'
import { CONNECTORS, SPEEDS } from '../details/model'
import { ConfirmShell, EditError } from '../planning/ConfirmShell'
import { emptyRow, type GroupRow } from '../planning/portGroups'
import { useAsyncAction } from '../planning/useAsyncAction'
import { OPENER } from '../planning/useInlineDialog'
import { modelFromRows, modelRows } from './model'
import ModelPreview from './ModelPreview'

/** What a new model starts as (the demo's): 24 copper ports of one group. */
const NEW_ROWS: GroupRow[] = [
  {
    count: '24',
    names: 'Gi1/0/{n}',
    start: '1',
    portType: 'copper',
    connector: 'RJ45',
    speed: '1G',
  },
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const portsIn = (rows: readonly GroupRow[]) =>
  rows.reduce(
    (n, r) => n + (/^\d+$/.test(r.count.trim()) ? Number(r.count) : 0),
    0,
  )

interface Props {
  /** The model being edited; absent for a new one. */
  model?: SwitchModel
  onCreate: (input: SwitchModelInput) => Promise<SwitchModel>
  onUpdate: (id: string, input: SwitchModelInput) => Promise<SwitchModel>
  onDelete: (id: string) => Promise<void>
  /** After a save: the saved model and, for a rename, the name it had. */
  onSaved: (saved: SwitchModel, oldName?: string) => void
  onDeleted: () => void
}

/**
 * One model's form: name, manufacturer, height, the groups of ports in order,
 * and the faceplate it makes. Mount with a `key` of the model's ID, so another
 * model starts from its own values.
 */
export default function ModelEditor({
  model,
  onCreate,
  onUpdate,
  onDelete,
  onSaved,
  onDeleted,
}: Props) {
  const [name, setName] = useState(model?.name ?? '')
  const [maker, setMaker] = useState(model?.manufacturer ?? '')
  const [height, setHeight] = useState(String(model?.height ?? 1))
  const [rows, setRows] = useState<GroupRow[]>(
    model ? modelRows(model) : NEW_ROWS,
  )
  const [error, setError] = useState<TextPiece[]>([])
  const [asking, setAsking] = useState(false)
  const save = useAsyncAction()
  const del = useAsyncAction()
  const listId = useId()

  const setRow = (i: number, patch: Partial<GroupRow>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  const submit = async () => {
    const made = modelFromRows(name, maker, height, rows)
    if ('error' in made) return setError([{ text: made.error }])
    setError([])
    try {
      const saved = model
        ? await onUpdate(model.id, made.input)
        : await onCreate(made.input)
      onSaved(
        saved,
        model && model.name !== saved.name ? model.name : undefined,
      )
    } catch (e) {
      if (e instanceof APIError && e.status === 409)
        setError([{ name: made.input.name }, { text: ' is already a model' }])
      else
        setError([
          {
            text: e instanceof Error ? e.message : 'Could not save the model.',
          },
        ])
    }
  }

  return (
    <form
      className="model-editor card"
      aria-label="Model editor"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="model-basic">
        <Field label="Model name">
          {(id) => (
            <input
              id={id}
              type="text"
              value={name}
              placeholder="e.g. C9300-48P"
              autoFocus={!model}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Manufacturer">
          {(id) => (
            <input
              id={id}
              type="text"
              value={maker}
              placeholder="e.g. Cisco"
              onChange={(e) => setMaker(e.target.value)}
            />
          )}
        </Field>
        <Field label="Height (U)">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              max={10}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          )}
        </Field>
      </div>

      <h3 className="model-h">Ports, in order</h3>
      <div className="model-groups">
        <table>
          <thead>
            <tr>
              <th>Count</th>
              <th>Names</th>
              <th>From</th>
              <th>Type</th>
              <th>Connector</th>
              <th>Speed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} data-testid="model-group-row" data-group={i + 1}>
                <td className="narrow">
                  <input
                    type="number"
                    min={1}
                    aria-label="Count"
                    value={r.count}
                    onChange={(e) => setRow(i, { count: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="mono"
                    aria-label="Names"
                    value={r.names}
                    placeholder="Gi1/0/{n}"
                    onChange={(e) => setRow(i, { names: e.target.value })}
                  />
                </td>
                <td className="narrow">
                  <input
                    type="number"
                    min={0}
                    aria-label="From"
                    value={r.start ?? ''}
                    onChange={(e) => setRow(i, { start: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label="Type"
                    value={r.portType}
                    onChange={(e) =>
                      setRow(i, {
                        portType: e.target.value as GroupRow['portType'],
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="copper">Copper</option>
                    <option value="fiber">Fiber</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    aria-label="Connector"
                    list={`${listId}-connectors`}
                    value={r.connector}
                    placeholder="RJ45"
                    onChange={(e) => setRow(i, { connector: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    aria-label="Speed"
                    list={`${listId}-speeds`}
                    value={r.speed}
                    placeholder="1G"
                    onChange={(e) => setRow(i, { speed: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="model-x"
                    aria-label={`Remove group ${i + 1}`}
                    title="Remove this group"
                    disabled={rows.length === 1}
                    onClick={() =>
                      setRows((rs) => rs.filter((_, k) => k !== i))
                    }
                  >
                    <X size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id={`${listId}-connectors`}>
          {CONNECTORS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id={`${listId}-speeds`}>
          {SPEEDS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <button
        type="button"
        className="btn quiet model-add"
        onClick={() => setRows((rs) => [...rs, emptyRow()])}
      >
        + Add a group of ports
      </button>
      <p className="model-total" data-testid="model-total">
        {plural(portsIn(rows), 'port')} in {plural(rows.length, 'group')} ·
        names must contain {'{n}'} once
      </p>

      <section className="model-look">
        <h3 className="model-h">
          How it will look <span className="muted">updates as you type</span>
        </h3>
        <ModelPreview name={name} rows={rows} />
      </section>

      {error.length > 0 && (
        <p className="model-error" role="alert" data-testid="model-error">
          <Pieces pieces={error} />
        </p>
      )}
      <div className="model-actions">
        <button type="submit" className="btn primary" disabled={save.pending}>
          Save model
        </button>
        {model && !asking && (
          <button
            type="button"
            className="btn danger-outline"
            {...{ [OPENER]: `model:delete:${model.id}` }}
            onClick={() => setAsking(true)}
          >
            <Trash2 size={14} aria-hidden />
            Delete…
          </button>
        )}
      </div>
      {model && asking && (
        <ConfirmShell
          label={`Delete ${model.name}`}
          openerKey={`model:delete:${model.id}`}
          className="destructive"
          onClose={() => setAsking(false)}
        >
          <p>
            Delete <Name text={model.name} />? Switches added from it keep their
            ports.
          </p>
          <EditError message={del.error} />
          <div className="form-actions">
            <button
              type="button"
              className="btn danger"
              disabled={del.pending}
              onClick={() =>
                void del
                  .run(() => onDelete(model.id).then(() => true))
                  .then((done) => done && onDeleted())
              }
            >
              Delete model
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setAsking(false)}
            >
              Cancel
            </button>
          </div>
        </ConfirmShell>
      )}
    </form>
  )
}
