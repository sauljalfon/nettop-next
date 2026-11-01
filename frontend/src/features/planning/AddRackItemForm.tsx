import { useState, type FormEvent } from 'react'
import { RACK_ITEM_TYPES, rackItemTypeLabel } from '../../shared/rackItems'
import type { Plan, RackItemType } from '../../shared/types'
import Chip from '../../shared/ui/Chip'
import Field from '../../shared/ui/Field'
import LocationPicker from '../patching/LocationPicker'
import type { Near, SiteBranch } from '../patching/patching'
import { EditError } from './ConfirmShell'
import type { PlanEdit } from './editing'
import {
  buildRackItemCommand,
  checkRackItemForm,
  initialRackItemValues,
  placeOf,
  takenNames,
  withEdit,
  type RackItemValues,
} from './rackItemForm'
import { useAsyncAction } from './useAsyncAction'
import { useInlineDialog } from './useInlineDialog'
import './editing.css'

/**
 * The library's form for a rack item: its type (and for an Other, what it is),
 * the rack and unit, the height and a name. The height follows the type and the
 * name follows type, text, rack and unit until the user edits them. A drop from
 * the library opens it with the rack and unit it landed on. One add_equipment;
 * the server's refusals (a taken unit or name) show in the form.
 */
export default function AddRackItemForm({
  tree,
  near,
  initial,
  edit,
  openerKey,
  onClose,
  onAdded,
}: {
  tree: readonly SiteBranch[]
  near?: Near
  initial?: { rackId?: string; unit?: number }
  edit: PlanEdit
  openerKey: string
  onClose: () => void
  onAdded: (plan: Plan) => void
}) {
  const taken = takenNames(tree)
  const isTaken = (name: string) => taken.has(name.toLowerCase())
  const [values, setValues] = useState<RackItemValues>(() =>
    withEdit(
      initialRackItemValues(initial),
      {},
      placeOf(tree, initial?.rackId ?? ''),
      isTaken,
    ),
  )
  const action = useAsyncAction()
  const dialog = useInlineDialog<HTMLFormElement>(onClose, openerKey)
  const change = (patch: Parameters<typeof withEdit>[1]) => {
    setValues((v) =>
      withEdit(v, patch, placeOf(tree, patch.rackId ?? v.rackId), isTaken),
    )
    action.clear()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = checkRackItemForm(values)
    if ('error' in checked) return action.fail(checked.error)
    void action
      .run(() => edit(buildRackItemCommand(values, checked)))
      .then((saved) => {
        if (!saved) return
        onClose()
        onAdded(saved)
      })
  }
  return (
    <form
      {...dialog}
      className="inline-form proposes library-form"
      aria-label="Add Rack item"
      data-testid="equipment-form"
      noValidate
      onSubmit={submit}
    >
      <div className="form-head">
        <strong className="form-title">New rack item</strong>
        <Chip kind="proposed" className="proposed-tag">
          Proposed
        </Chip>
      </div>
      <Field label="Type">
        {(id) => (
          <select
            id={id}
            value={values.type}
            onChange={(e) => change({ type: e.target.value as RackItemType })}
          >
            {RACK_ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {rackItemTypeLabel(t)}
              </option>
            ))}
          </select>
        )}
      </Field>
      {values.type === 'other' && (
        <Field label="What it is">
          {(id) => (
            <input
              id={id}
              type="text"
              value={values.itemText}
              autoComplete="off"
              maxLength={100}
              placeholder="e.g. KVM switch"
              onChange={(e) => change({ itemText: e.target.value })}
            />
          )}
        </Field>
      )}
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        near={near}
        rackId={values.rackId}
        onChange={(rackId) => change({ rackId })}
      />
      <div className="field-grid">
        <Field label="Unit">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              value={values.unit}
              onChange={(e) => change({ unit: e.target.value })}
            />
          )}
        </Field>
        <Field label="Height">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              value={values.height}
              onChange={(e) => change({ height: e.target.value })}
            />
          )}
        </Field>
      </div>
      <Field label="Name">
        {(id) => (
          <input
            id={id}
            type="text"
            value={values.name}
            autoComplete="off"
            onChange={(e) => change({ name: e.target.value })}
          />
        )}
      </Field>
      <EditError message={action.error} />
      <div className="form-actions">
        <button className="btn primary lg" disabled={action.pending}>
          Add to plan
        </button>
        <button type="button" className="btn lg" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
