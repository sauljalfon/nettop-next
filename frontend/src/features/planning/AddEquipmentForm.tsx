import { useState, type FormEvent } from 'react'
import type { Network, Plan } from '../../shared/types'
import {
  MAX_PORT_GROUPS,
  MAX_SWITCH_PORTS,
  checkGroups,
  emptyRow,
  groupSummary,
  rowsFromCount,
  type GroupRow,
} from './portGroups'
import LocationPicker from '../patching/LocationPicker'
import type { Near, SiteBranch } from '../patching/patching'
import { EditError } from './ConfirmShell'
import PortDetailFields from './PortDetailFields'
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
  const most = kind === 'panel' ? 48 : MAX_SWITCH_PORTS
  if (!(ports >= 1 && ports <= most))
    return {
      error: `${kind === 'panel' ? 'Positions' : 'Ports'} must be between 1 and ${most}.`,
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
  tree,
  near,
  networks,
  initial,
  edit,
  openerKey,
  onClose,
  onAdded,
}: {
  title: string
  type: EquipmentKind
  tree: readonly SiteBranch[]
  near?: Near
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
  // Port groups (switches): null is the plain Ports count; rows name and
  // describe the ports in groups (Count, Names, Type, Connector, Speed).
  const [groups, setGroups] = useState<GroupRow[] | null>(null)
  const action = useAsyncAction()
  const dialog = useInlineDialog<HTMLFormElement>(onClose, openerKey)
  const set = (key: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    action.clear()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = checkEquipmentForm(
      groups ? { ...values, ports: '1' } : values,
      type.kind,
    )
    if ('error' in checked) return action.fail(checked.error)
    const given = groups ? checkGroups(groups) : undefined
    if (given && 'error' in given) return action.fail(given.error)
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
            ...(given
              ? { portGroups: given.groups }
              : { portCount: checked.ports }),
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
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        near={near}
        rackId={values.rackId}
        onChange={set('rackId')}
      />
      <label>
        Unit
        <input
          type="number"
          min={1}
          value={values.unit}
          onChange={(e) => set('unit')(e.target.value)}
        />
      </label>
      {!groups && (
        <label>
          {type.kind === 'panel' ? 'Positions' : 'Ports'}
          <input
            type="number"
            min={1}
            max={type.kind === 'panel' ? 48 : MAX_SWITCH_PORTS}
            value={values.ports}
            onChange={(e) => set('ports')(e.target.value)}
          />
        </label>
      )}
      {type.kind === 'switch' && (
        <PortGroupRows
          rows={groups}
          onChange={(rows) => {
            setGroups(rows)
            action.clear()
          }}
          ports={values.ports}
        />
      )}
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

/**
 * The port group rows of a switch's Add form (step 11b): "+ Add port group"
 * turns the plain Ports count into groups; each row is Count, Names (one {n}),
 * Type, Connector and Speed, with a ✕; one line says what the ports will be
 * called. Removing the last row goes back to the plain count.
 */
function PortGroupRows({
  rows,
  onChange,
  ports,
}: {
  rows: GroupRow[] | null
  onChange: (rows: GroupRow[] | null) => void
  ports: string
}) {
  const change = (i: number, patch: Partial<GroupRow>) =>
    onChange(rows!.map((r, n) => (n === i ? { ...r, ...patch } : r)))
  const summary = rows ? groupSummary(rows) : ''
  return (
    <div className="port-groups">
      {rows?.map((r, i) => (
        <div
          key={i}
          className="port-group"
          role="group"
          aria-label={`Port group ${i + 1}`}
          data-testid="port-group-row"
        >
          <div className="group-line">
            <label>
              Count
              <input
                aria-label="Count"
                inputMode="numeric"
                className="count-input"
                value={r.count}
                onChange={(e) => change(i, { count: e.target.value })}
              />
            </label>
            <label>
              Names
              <input
                aria-label="Names"
                placeholder="Gi1/0/{n}"
                autoComplete="off"
                value={r.names}
                onChange={(e) => change(i, { names: e.target.value })}
              />
            </label>
          </div>
          <div className="group-line">
            <PortDetailFields
              value={r}
              onChange={(patch) => change(i, patch)}
            />
            <button
              type="button"
              className="button ghost-danger"
              aria-label={`Remove port group ${i + 1}`}
              onClick={() =>
                onChange(
                  rows.length > 1 ? rows.filter((_, n) => n !== i) : null,
                )
              }
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      {summary && (
        <p className="hint port-summary" data-testid="port-summary">
          {summary}
        </p>
      )}
      {(rows?.length ?? 0) < MAX_PORT_GROUPS && (
        <button
          type="button"
          className="button"
          onClick={() =>
            onChange(rows ? [...rows, emptyRow()] : rowsFromCount(ports))
          }
        >
          + Add port group
        </button>
      )}
    </div>
  )
}
