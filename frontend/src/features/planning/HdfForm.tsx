import { useState, type FormEvent } from 'react'
import type { Plan } from '../../shared/types'
import LocationPicker from '../patching/LocationPicker'
import type { Near, SiteBranch } from '../patching/patching'
import { EditError } from './ConfirmShell'
import { HDF_MAX_ROWS, hdfPositions, parseHdfForm } from './containers'
import { useLastEdit, type PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import { useInlineDialog } from './useInlineDialog'
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
      <div className="plan-row">
        <strong>HDF · high-density fiber frame</strong>
        <small>Rows of A–D blocks; set the rows, height and place.</small>
        {!open && (
          <button
            type="button"
            className="button primary"
            data-opener="library:hdf"
            disabled={!edit}
            onClick={() => setOpen(true)}
          >
            Add HDF…
          </button>
        )}
        {!edit && (
          <small data-testid="hdf-disabled-hint">
            Open a plan to add an HDF.
          </small>
        )}
      </div>
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
  return (
    <form
      {...dialog}
      className="inline-form library-form"
      aria-label="Add HDF"
      data-testid="hdf-form"
      noValidate
      onSubmit={submit}
    >
      <span className="eyebrow">
        NEW HDF <em className="proposed-tag">PROPOSED</em>
      </span>
      <label>
        Name
        <input
          value={values.name}
          placeholder="e.g. HDF-03"
          autoComplete="off"
          onChange={(e) => set('name')(e.target.value)}
        />
      </label>
      <div className="two">
        <label>
          Rows (1–{HDF_MAX_ROWS})
          <input
            type="number"
            min={1}
            max={HDF_MAX_ROWS}
            value={values.rows}
            onChange={(e) => set('rows')(e.target.value)}
          />
        </label>
        <label>
          Height (U)
          <input
            type="number"
            min={1}
            value={values.height}
            onChange={(e) => set('height')(e.target.value)}
          />
        </label>
      </div>
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        near={near}
        rackId={values.rackId}
        onChange={set('rackId')}
      />
      <label>
        Lowest unit
        <input
          type="number"
          min={1}
          value={values.unit}
          onChange={(e) => set('unit')(e.target.value)}
        />
      </label>
      <span className="hint">
        Each row has blocks A–D with 6 positions, front and rear.
        {rows >= 1 && rows <= HDF_MAX_ROWS
          ? ` ${hdfPositions(rows)} positions per side.`
          : ''}
      </span>
      <EditError message={action.error} />
      <div className="inline-row">
        <button className="button primary" disabled={action.pending}>
          Add HDF to plan
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
