import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, Cable, RefreshCw } from 'lucide-react'
import { APIError, createPlan, sendPlanCommand } from '../../shared/api'
import type {
  EquipmentInput,
  Plan,
  PlanCommand,
  Snapshot,
} from '../../shared/types'
import { endpointLabel } from '../pathfinding/projection'
import './planning.css'

interface Props {
  plans: Plan[]
  selected?: Plan
  installed: Snapshot
  snapshot?: Snapshot
  onSelect: (id: string) => void
  onSaved: (plan: Plan) => Promise<void>
  onRefresh: () => Promise<void>
  createRequest?: {
    token: number
    kind: 'switch' | 'panel'
    role?: 'aggregation'
    rackId: string
    unit: number
    position?: { x: number; y: number }
  }
  onEquipmentAdded?: (id: string, position?: { x: number; y: number }) => void
  onCancelPreview?: () => void
}

export default function PlanEditor({
  plans,
  selected,
  installed,
  snapshot,
  onSelect,
  onSaved,
  onRefresh,
  createRequest,
  onEquipmentAdded,
  onCancelPreview,
}: Props) {
  const [name, setName] = useState('')
  const creation = useMutation({
    mutationFn: () => createPlan(name, installed.revision),
    onSuccess: async (plan) => {
      await onSaved(plan)
      onSelect(plan.id)
      setName('')
    },
  })
  return (
    <section className="planning-workbench" aria-label="Plan editor">
      <div className="plan-controls">
        <label>
          Saved plan
          <select
            aria-label="Saved plan"
            value={selected?.id ?? ''}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="" disabled>
              Choose a draft
            </option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · revision {plan.revision}
              </option>
            ))}
          </select>
        </label>
        <form
          className="new-plan"
          onSubmit={(e) => {
            e.preventDefault()
            creation.mutate()
          }}
        >
          <label>
            New plan name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Floor 2 expansion"
            />
          </label>
          <button
            className="button"
            disabled={creation.isPending || !name.trim()}
          >
            Create plan
          </button>
        </form>
        <button className="button" onClick={() => void onRefresh()}>
          <RefreshCw size={13} />
          Refresh draft
        </button>
      </div>
      {creation.error && (
        <p role="alert" className="inline-error">
          {creation.error.message}
        </p>
      )}
      {selected && snapshot && (
        <DraftCommands
          key={selected.id}
          plan={selected}
          snapshot={snapshot}
          createRequest={createRequest}
          onEquipmentAdded={onEquipmentAdded}
          onCancelPreview={onCancelPreview}
          onSaved={onSaved}
          onRefresh={onRefresh}
        />
      )}
      <p className="library-note">
        Saved in PostgreSQL. Changes belong only to this draft; nothing is
        marked physically installed.
      </p>
    </section>
  )
}

function DraftCommands({
  plan,
  snapshot,
  createRequest,
  onEquipmentAdded,
  onCancelPreview,
  onSaved,
  onRefresh,
}: {
  plan: Plan
  snapshot: Snapshot
  createRequest?: Props['createRequest']
  onEquipmentAdded?: Props['onEquipmentAdded']
  onCancelPreview?: Props['onCancelPreview']
  onSaved: Props['onSaved']
  onRefresh: Props['onRefresh']
}) {
  const [form, setForm] = useState<'equipment' | 'cable' | null>(null)
  const [equipment, setEquipment] = useState<EquipmentInput>({
    name: '',
    kind: 'switch',
    role: 'access',
    rackId: snapshot.racks[0]?.id ?? '',
    unit: 1,
    height: 1,
    portCount: 2,
  })
  const [cable, setCable] = useState({ a: '', b: '' })
  const [layoutPosition, setLayoutPosition] = useState<
    { x: number; y: number } | undefined
  >()
  const addedEquipmentIDs = useRef(new Set(snapshot.equipment.map((e) => e.id)))
  const save = useMutation({
    mutationFn: (command: PlanCommand) => sendPlanCommand(plan.id, command),
    onSuccess: async (updated) => {
      const added = updated.equipment.find(
        (e) => !addedEquipmentIDs.current.has(e.id),
      )
      if (added) {
        addedEquipmentIDs.current.add(added.id)
        onEquipmentAdded?.(added.id, layoutPosition)
      }
      await onSaved(updated)
      setForm(null)
      setEquipment((e) => ({ ...e, name: '' }))
      setCable({ a: '', b: '' })
    },
  })
  useEffect(() => {
    if (!createRequest) return
    setEquipment({
      name: '',
      kind: createRequest.kind,
      role:
        createRequest.kind === 'panel'
          ? 'passive'
          : (createRequest.role ?? 'access'),
      rackId: createRequest.rackId,
      unit: createRequest.unit,
      height: 1,
      portCount: 12,
    })
    setLayoutPosition(createRequest.position)
    setForm('equipment')
    save.reset()
    // A unique token intentionally opens the form once per drag/drop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest?.token])
  const ready =
    snapshot.revision === `${plan.baseRevision}/${plan.id}@${plan.revision}`
  const occupied = new Set(
    snapshot.links.filter((l) => l.kind === 'cable').flatMap((l) => [l.a, l.b]),
  )
  const free = snapshot.endpoints.filter((p) => !occupied.has(p.id))
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    save.mutate(
      form === 'equipment'
        ? { type: 'add_equipment', expectedRevision: plan.revision, equipment }
        : { type: 'add_cable', expectedRevision: plan.revision, cable },
    )
  }
  function open(next: 'equipment' | 'cable') {
    setForm(next)
    setLayoutPosition(undefined)
    save.reset()
  }
  return (
    <>
      <div className="draft-actions">
        <button
          className="button"
          disabled={save.isPending || !ready}
          onClick={() => open('equipment')}
        >
          <Plus size={14} />
          Add equipment
        </button>
        <button
          className="button"
          disabled={save.isPending || !ready}
          onClick={() => open('cable')}
        >
          <Cable size={14} />
          Add cable
        </button>
        <span>
          {plan.equipment.length} proposed equipment ·{' '}
          {plan.links.filter((l) => l.kind === 'cable').length} proposed cables
        </span>
        {save.isSuccess && <span>Saved · revision {plan.revision}</span>}
      </div>
      {!ready && (
        <p className="inline-error">
          The draft and topology revisions differ. Refresh the draft before
          editing.
        </p>
      )}
      {save.error && (
        <div className="inline-error" role="alert">
          {save.error.message}
          {save.error instanceof APIError && save.error.status === 409 && (
            <p>
              Refresh the draft, review the changes, and resubmit your edit. It
              has not been retried.
            </p>
          )}
        </div>
      )}
      {form && (
        <form className="command-form" onSubmit={submit}>
          <fieldset disabled={save.isPending}>
            {form === 'equipment' ? (
              <div className="equipment-fields">
                <label>
                  Equipment name
                  <input
                    required
                    maxLength={100}
                    value={equipment.name}
                    onChange={(e) =>
                      setEquipment({ ...equipment, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Equipment type
                  <select
                    value={equipment.kind}
                    onChange={(e) => {
                      const kind = e.target.value as EquipmentInput['kind']
                      setEquipment({
                        ...equipment,
                        kind,
                        role: kind === 'panel' ? 'passive' : 'access',
                      })
                    }}
                  >
                    <option value="switch">Switch</option>
                    <option value="panel">Patch panel</option>
                  </select>
                </label>
                <label>
                  Equipment role
                  <select
                    value={equipment.role}
                    onChange={(e) =>
                      setEquipment({
                        ...equipment,
                        role: e.target.value as EquipmentInput['role'],
                      })
                    }
                  >
                    {equipment.kind === 'panel' ? (
                      <option value="passive">Passive</option>
                    ) : (
                      <>
                        <option value="access">Access</option>
                        <option value="aggregation">Aggregation</option>
                      </>
                    )}
                  </select>
                </label>
                <label>
                  Target rack
                  <select
                    required
                    value={equipment.rackId}
                    onChange={(e) =>
                      setEquipment({ ...equipment, rackId: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      Choose a rack to place this equipment
                    </option>
                    {snapshot.racks.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Starting unit
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={equipment.unit}
                    onChange={(e) =>
                      setEquipment({
                        ...equipment,
                        unit: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Height in U
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={equipment.height}
                    onChange={(e) =>
                      setEquipment({
                        ...equipment,
                        height: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  {equipment.kind === 'panel'
                    ? 'Panel positions'
                    : 'Port count'}
                  <input
                    type="number"
                    min={1}
                    max={48}
                    required
                    value={equipment.portCount}
                    onChange={(e) =>
                      setEquipment({
                        ...equipment,
                        portCount: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="cable-fields">
                {(['a', 'b'] as const).map((side) => (
                  <label key={side}>
                    Cable endpoint {side.toUpperCase()}
                    <select
                      required
                      value={cable[side]}
                      onChange={(e) =>
                        setCable({ ...cable, [side]: e.target.value })
                      }
                    >
                      <option value="">Choose an available endpoint</option>
                      {free.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={p.id === cable[side === 'a' ? 'b' : 'a']}
                        >
                          {endpointLabel(snapshot, p.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button className="button primary" disabled={!ready}>
                {save.isPending
                  ? 'Saving…'
                  : form === 'equipment'
                    ? 'Save equipment to plan'
                    : 'Save cable to plan'}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setForm(null)
                  onCancelPreview?.()
                  save.reset()
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {save.error instanceof APIError && save.error.status === 409 && (
        <button
          className="text-button"
          onClick={() => {
            void onRefresh().then(() => save.reset())
          }}
        >
          Reload latest revision
        </button>
      )}
    </>
  )
}
