import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EditError } from './ConfirmShell'
import { DEFAULT_RACK_UNITS, type ContainerKind } from './containers'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import { useInlineDialog } from './useInlineDialog'
import './editing.css'

const LABEL: Record<ContainerKind, string> = {
  site: 'Add site',
  node: 'Add node',
  rack: 'Add rack',
}
const PLACEHOLDER: Record<ContainerKind, string> = {
  site: 'e.g. North Campus',
  node: 'e.g. Building B',
  rack: 'e.g. Rack B01',
}

/**
 * "Add site / node / rack" in a plan: a quiet button that opens a small inline
 * form (a name; a rack also has units, 1–60). `parentId` is the site of a node
 * or the node of a rack. The server's refusals show in the form.
 */
export default function AddContainer({
  kind,
  parentId,
  edit,
  className = '',
}: {
  kind: ContainerKind
  parentId?: string
  edit: PlanEdit
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const key = `add:${kind}:${parentId ?? ''}`
  return (
    <div className={`add-card ${className}`}>
      {!open && (
        <button
          type="button"
          className="add-button"
          data-opener={key}
          data-testid={`add-${kind}`}
          onClick={() => setOpen(true)}
        >
          <Plus size={14} aria-hidden />
          {LABEL[kind]}
        </button>
      )}
      {open && (
        <ContainerForm
          kind={kind}
          parentId={parentId}
          edit={edit}
          openerKey={key}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function ContainerForm({
  kind,
  parentId,
  edit,
  openerKey,
  onClose,
}: {
  kind: ContainerKind
  parentId?: string
  edit: PlanEdit
  openerKey: string
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [units, setUnits] = useState(String(DEFAULT_RACK_UNITS))
  const action = useAsyncAction()
  const dialog = useInlineDialog<HTMLFormElement>(onClose, openerKey)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const command =
      kind === 'site'
        ? ({ type: 'add_site', site: { name } } as const)
        : kind === 'node'
          ? ({
              type: 'add_node',
              node: { siteId: parentId ?? '', name },
            } as const)
          : ({
              type: 'add_rack',
              rack: { nodeId: parentId ?? '', name, units: Number(units) },
            } as const)
    void action.run(() => edit(command)).then((saved) => saved && onClose())
  }
  return (
    <form
      {...dialog}
      className="inline-form"
      aria-label={LABEL[kind]}
      data-testid={`${kind}-form`}
      noValidate
      onSubmit={submit}
    >
      <span className="eyebrow">
        NEW {kind.toUpperCase()} <em className="proposed-tag">PROPOSED</em>
      </span>
      <label>
        Name
        <input
          value={name}
          placeholder={PLACEHOLDER[kind]}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value)
            action.clear()
          }}
        />
      </label>
      {kind === 'rack' && (
        <label>
          Height (units, 1–60)
          <input
            type="number"
            min={1}
            max={60}
            value={units}
            onChange={(e) => {
              setUnits(e.target.value)
              action.clear()
            }}
          />
        </label>
      )}
      <EditError message={action.error} />
      <div className="inline-row">
        <button className="button primary" disabled={action.pending}>
          {LABEL[kind]} to plan
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
