import { useState, type FormEvent } from 'react'
import type { Network, Plan, Rack } from '../../shared/types'
import { EditError } from './ConfirmShell'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import { useInlineDialog } from './useInlineDialog'
import './editing.css'

export interface EquipmentKind {
  kind: 'switch' | 'panel'
  role: 'access' | 'aggregation' | 'passive'
}

/** What the form checks before sending; the server judges the rest in its own words. */
export function checkEquipmentForm(
  v: {
    name: string
    networkId: string
    rackId: string
    unit: string
    ports: string
  },
  kind: EquipmentKind['kind'],
): { name: string; unit: number; ports: number } | { error: string } {
  const whole = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN)
  const unit = whole(v.unit)
  const ports = whole(v.ports)
  if (!v.name.trim()) return { error: 'Give the equipment a name.' }
  if (kind === 'switch' && !v.networkId)
    return { error: 'Choose the device’s network.' }
  if (!v.rackId) return { error: 'Choose a rack.' }
  if (!(unit >= 1 && unit <= 100)) return { error: 'Unit must be 1 or more.' }
  if (!(ports >= 1 && ports <= 48))
    return {
      error: `${kind === 'panel' ? 'Positions' : 'Ports'} must be between 1 and 48.`,
    }
  return { name: v.name.trim(), unit, ports }
}

/**
 * The library's "Add…" form for an access switch, an aggregation switch or a
 * patch panel (the non-drag way): name, network (switches), rack and unit, then
 * add_equipment. A drop from the library opens it prefilled with the rack and
 * unit it landed on. The server's refusals show in the form.
 */
export default function AddEquipmentForm({
  title,
  type,
  racks,
  networks,
  initial,
  edit,
  openerKey,
  onClose,
  onAdded,
}: {
  title: string
  type: EquipmentKind
  racks: readonly Rack[]
  networks: readonly Network[]
  initial?: { rackId?: string; unit?: number }
  edit: PlanEdit
  openerKey: string
  onClose: () => void
  onAdded: (plan: Plan) => void
}) {
  const [values, setValues] = useState({
    name: '',
    networkId: '',
    rackId: initial?.rackId ?? '',
    unit: String(initial?.unit ?? 1),
    ports: '24',
  })
  const action = useAsyncAction()
  const dialog = useInlineDialog<HTMLFormElement>(onClose, openerKey)
  const set = (key: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    action.clear()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = checkEquipmentForm(values, type.kind)
    if ('error' in checked) return action.fail(checked.error)
    void action
      .run(() =>
        edit({
          type: 'add_equipment',
          equipment: {
            name: checked.name,
            kind: type.kind,
            role: type.role,
            networkId: type.kind === 'switch' ? values.networkId : undefined,
            rackId: values.rackId,
            unit: checked.unit,
            height: 1,
            portCount: checked.ports,
          },
        }),
      )
      .then((saved) => {
        if (!saved) return
        onClose()
        onAdded(saved)
      })
  }
  return (
    <form
      {...dialog}
      className="inline-form library-form"
      aria-label={`Add ${title}`}
      data-testid="equipment-form"
      noValidate
      onSubmit={submit}
    >
      <span className="eyebrow">
        NEW {title.toUpperCase()} <em className="proposed-tag">PROPOSED</em>
      </span>
      <label>
        Name
        <input
          value={values.name}
          autoComplete="off"
          placeholder="e.g. EDGE-31"
          onChange={(e) => set('name')(e.target.value)}
        />
      </label>
      {type.kind === 'switch' && (
        <label>
          Network
          <select
            aria-label="Network"
            value={values.networkId}
            onChange={(e) => set('networkId')(e.target.value)}
          >
            <option value="" disabled>
              Choose the device&apos;s network
            </option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="two">
        <label>
          Rack
          <select
            aria-label="Rack"
            value={values.rackId}
            onChange={(e) => set('rackId')(e.target.value)}
          >
            <option value="" disabled>
              Choose a rack
            </option>
            {racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unit
          <input
            type="number"
            min={1}
            value={values.unit}
            onChange={(e) => set('unit')(e.target.value)}
          />
        </label>
      </div>
      <label>
        {type.kind === 'panel' ? 'Positions' : 'Ports'}
        <input
          type="number"
          min={1}
          max={48}
          value={values.ports}
          onChange={(e) => set('ports')(e.target.value)}
        />
      </label>
      <EditError message={action.error} />
      <div className="inline-row">
        <button className="button primary" disabled={action.pending}>
          Add to plan
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
