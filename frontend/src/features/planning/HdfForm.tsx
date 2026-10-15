import { LayoutGrid } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Plan } from '../../shared/types'
import LocationPicker from '../patching/LocationPicker'
import type { Near, SiteBranch } from '../patching/patching'
import { EditError } from './ConfirmShell'
import { HDF_MAX_ROWS, hdfPositions, parseHdfForm } from './containers'
import { useLastEdit, type PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import { useInlineDialog } from './useInlineDialog'
import Chip from '../../shared/ui/Chip'
import Field from '../../shared/ui/Field'
import './editing.css'

/**
 * The equipment library's HDF item. "Add HDF…" opens a form (name, rows 1–32,
 * height in rack units, Site › Node › Rack, lowest unit) that sends add_hdf; the new HDF is
 * then opened in Physical by `onCreated`. Disabled outside a current plan.
 */
export default function HdfForm({
  tree,
  near,
  defaultRackId,
  edit,
  onCreated,
}: {
  tree: readonly SiteBranch[]
  near?: Near
  defaultRackId?: string
  edit?: PlanEdit
  onCreated: (plan: Plan, name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const formEdit = useLastEdit(edit)
  return (
    <div className="library-hdf">
      <div className="library-item">
        <span className="equipment-icon">
          <LayoutGrid size={22} aria-hidden />
        </span>
        <div>
          <strong>HDF · high-density fiber frame</strong>
          <small>Rows of A–D blocks; set the rows, height and place.</small>
        </div>
        {!open && (
          <button
            type="button"
            className="btn"
            data-opener="library:hdf"
            disabled={!edit}
            onClick={() => setOpen(true)}
          >
            Add HDF…
          </button>
        )}
      </div>
      {!edit && (
        <small data-testid="hdf-disabled-hint">
          Open a plan to add an HDF.
        </small>
      )}
      {open && formEdit && (
        <Form
          tree={tree}
          near={near}
          defaultRackId={defaultRackId}
          edit={formEdit}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  )
}

function Form({
  tree,
  near,
  defaultRackId,
  edit,
  onClose,
  onCreated,
}: {
  tree: readonly SiteBranch[]
  near?: Near
  defaultRackId?: string
  edit: PlanEdit
  onClose: () => void
  onCreated: (plan: Plan, name: string) => void
}) {
  const [values, setValues] = useState({
    name: '',
    rows: '4',
    height: '3',
    rackId: defaultRackId ?? '',
    unit: '1',
  })
  const action = useAsyncAction()
  const dialog = useInlineDialog<HTMLFormElement>(onClose, 'library:hdf')
  const set = (key: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    action.clear()
  }
  const rows = Number(values.rows)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseHdfForm(values)
    if ('error' in parsed) return action.fail(parsed.error)
    void action
      .run(() => edit({ type: 'add_hdf', hdf: parsed.hdf }))
      .then((saved) => {
        if (!saved) return
        onClose()
        onCreated(saved, parsed.hdf.name)
      })
  }
  const unit = Number(values.unit)
  const height = Number(values.height)
  const spans =
    Number.isInteger(unit) &&
    Number.isInteger(height) &&
    unit >= 1 &&
    height >= 1
      ? `Takes U${unit}${height > 1 ? `–U${unit + height - 1}` : ''}.`
      : undefined
  return (
    <form
      {...dialog}
      className="inline-form proposes library-form"
      aria-label="Add HDF"
      data-testid="hdf-form"
      noValidate
      onSubmit={submit}
    >
      <div className="form-head">
        <strong className="form-title">New HDF</strong>
        <Chip kind="proposed" className="proposed-tag">
          Proposed
        </Chip>
      </div>
      <Field label="Name">
        {(id) => (
          <input
            id={id}
            type="text"
            value={values.name}
            placeholder="e.g. HDF-03"
            autoComplete="off"
            onChange={(e) => set('name')(e.target.value)}
          />
        )}
      </Field>
      <div className="field-grid">
        <Field label={`Rows (1–${HDF_MAX_ROWS})`}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              max={HDF_MAX_ROWS}
              value={values.rows}
              onChange={(e) => set('rows')(e.target.value)}
            />
          )}
        </Field>
        <Field label="Height (U)">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              value={values.height}
              onChange={(e) => set('height')(e.target.value)}
            />
          )}
        </Field>
      </div>
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        near={near}
        rackId={values.rackId}
        onChange={set('rackId')}
      />
      <div className="field-grid">
        <Field label="Lowest unit">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              value={values.unit}
              onChange={(e) => set('unit')(e.target.value)}
            />
          )}
        </Field>
        <div className="field">
          <span className="label" aria-hidden="true">
            &nbsp;
          </span>
          <span className="hint span-hint">{spans}</span>
        </div>
      </div>
      <p className="summary-line">
        Each row has blocks A–D with 6 positions, front and rear.
        {rows >= 1 && rows <= HDF_MAX_ROWS
          ? ` ${hdfPositions(rows)} positions per side.`
          : ''}
      </p>
      <EditError message={action.error} />
      <div className="form-actions">
        <button className="btn primary lg" disabled={action.pending}>
          Add HDF to plan
        </button>
        <button type="button" className="btn lg" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
