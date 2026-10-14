import { GitFork, Network as NetworkIcon, PanelTop } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Network, Plan } from '../../shared/types'
import type { Near, SiteBranch } from '../patching/patching'
import AddEquipmentForm, { type EquipmentKind } from './AddEquipmentForm'
import { useLastEdit, type PlanEdit } from './editing'
import HdfForm from './HdfForm'
import './editing.css'

/** A drop (or an unplaced preview) waiting for its details. */
export interface PendingEquipment {
  token: number
  kind: 'switch' | 'panel'
  role?: 'aggregation'
  rackId: string
  unit: number
}

const ITEMS = [
  {
    id: 'access',
    name: 'Access switch',
    type: { kind: 'switch', role: 'access' },
    Icon: NetworkIcon,
    description: 'Connect endpoints at the edge',
  },
  {
    id: 'aggregation',
    name: 'Aggregation',
    type: { kind: 'switch', role: 'aggregation' },
    Icon: GitFork,
    description: 'An AGG destination for Find AGG / BB',
  },
  {
    id: 'panel',
    name: 'Patch panel',
    type: { kind: 'panel', role: 'passive' },
    Icon: PanelTop,
    description: 'Front / rear continuity per position',
  },
] as const satisfies readonly {
  id: string
  name: string
  type: EquipmentKind
  Icon: unknown
  description: string
}[]

const itemFor = (p: PendingEquipment) =>
  ITEMS.find((i) =>
    p.kind === 'panel'
      ? i.id === 'panel'
      : i.id === (p.role === 'aggregation' ? 'aggregation' : 'access'),
  )!.id

/**
 * The equipment library: the three items (drag onto a rack, or Add… for the
 * form), the HDF form, and in a plan the unplaced-preview notice. A drop opens
 * the matching item's form with the rack and unit it landed on.
 */
export default function LibraryItems({
  canEdit,
  edit,
  tree,
  near,
  networks,
  defaultRackId,
  pending,
  onCancelPending,
  onAdded,
  onHdfCreated,
  onManageNetworks,
}: {
  canEdit: boolean
  edit?: PlanEdit
  tree: readonly SiteBranch[]
  /** Where the user is in Physical, for a form with no rack to start at. */
  near?: Near
  networks: readonly Network[]
  defaultRackId?: string
  pending?: PendingEquipment
  onCancelPending: () => void
  /** Equipment was added through a form here. */
  onAdded: (plan: Plan) => void
  onHdfCreated: (plan: Plan, name: string) => void
  /** Opens the Manage networks drawer (from a switch form with no networks yet). */
  onManageNetworks: () => void
}) {
  const [open, setOpen] = useState<string>()
  const formEdit = useLastEdit(edit)
  // A drop opens that item's form, once per drop.
  useEffect(() => {
    if (pending) setOpen(itemFor(pending))
    // The token is the drop: a new one opens the form again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.token])
  const close = () => {
    setOpen(undefined)
    if (pending) onCancelPending()
  }
  return (
    <>
      <div className="notice">
        <strong>
          {canEdit ? 'Build your planned network' : 'Installed view'}
        </strong>
        <p>
          {canEdit
            ? 'Drop inside a rack to assign it. Drop on empty canvas to preview without saving.'
            : 'Switch to a plan in the top bar to add or move equipment.'}
        </p>
      </div>
      {pending && !pending.rackId && (
        <div className="notice">
          <strong>Unplaced equipment preview</strong>
          <p>
            Choose its rack before saving. This preview is not part of the
            network or trace graph.
          </p>
        </div>
      )}
      {ITEMS.map((item) => (
        <div key={item.id} className="library-entry">
          <div
            className="library-item"
            draggable={canEdit}
            aria-disabled={!canEdit}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                'application/x-nettop-item',
                `new:${item.type.kind}:::${item.type.role === 'aggregation' ? 'aggregation' : ''}`,
              )
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <span className="equipment-icon">
              <item.Icon size={22} />
            </span>
            <div>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </div>
            {open !== item.id && (
              <button
                type="button"
                className="button"
                data-opener={`library:add:${item.id}`}
                aria-label={`Add ${item.name}…`}
                disabled={!edit}
                onClick={() => setOpen(item.id)}
              >
                Add…
              </button>
            )}
          </div>
          {open === item.id && formEdit && (
            <AddEquipmentForm
              key={pending?.token ?? 'manual'}
              title={item.name}
              type={item.type}
              tree={tree}
              near={near}
              networks={networks}
              initial={
                pending && itemFor(pending) === item.id
                  ? { rackId: pending.rackId, unit: pending.unit }
                  : { rackId: defaultRackId }
              }
              edit={formEdit}
              openerKey={`library:add:${item.id}`}
              onClose={close}
              onManageNetworks={onManageNetworks}
              onAdded={(plan) => {
                setOpen(undefined)
                onAdded(plan)
              }}
            />
          )}
        </div>
      ))}
      <HdfForm
        tree={tree}
        near={near}
        defaultRackId={defaultRackId}
        edit={edit}
        onCreated={onHdfCreated}
      />
      <p className="muted">
        Add sites, nodes and racks in Physical, on the level where they belong.
      </p>
    </>
  )
}
