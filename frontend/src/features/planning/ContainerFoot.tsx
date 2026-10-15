import { Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ConfirmShell, EditError } from './ConfirmShell'
import { NOT_EMPTY_HINT, type ContainerKind } from './containers'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'
import './editing.css'
import Name from '../../shared/ui/Name'

/**
 * The foot of a site, node or rack card in a plan: "Delete" when it is empty
 * (an inline confirm, then delete_site / delete_node / delete_rack), otherwise
 * the hint that it must be emptied first.
 */
export default function ContainerFoot({
  kind,
  id,
  name,
  empty,
  proposed,
  edit,
  children,
}: {
  /** Extra actions for an empty container, beside Delete (a rack's Copy rack layout…). */
  children?: ReactNode
  kind: ContainerKind
  id: string
  name: string
  empty: boolean
  proposed: boolean
  edit: PlanEdit
}) {
  const [asking, setAsking] = useState(false)
  const action = useAsyncAction()
  const key = `delete:${kind}:${id}`
  return (
    <div
      className="container-foot nodrag nopan"
      data-testid={`container-foot-${id}`}
    >
      {!empty ? (
        <span className="quiet" data-testid="not-empty-hint">
          {NOT_EMPTY_HINT}
        </span>
      ) : (
        <div className="inline-row">
          <button
            type="button"
            className="btn danger-outline"
            data-opener={key}
            aria-label={`Delete ${kind} ${name}`}
            onClick={() => setAsking(true)}
          >
            <Trash2 size={13} aria-hidden /> Delete
          </button>
          {children}
        </div>
      )}
      {asking && empty && (
        <ConfirmShell
          label={`Confirm delete ${kind}`}
          openerKey={key}
          onClose={() => setAsking(false)}
          className="destructive"
        >
          <span>
            {proposed ? (
              <>
                <strong>
                  <Name text={name} />
                </strong>{' '}
                is only in this plan, so its addition is dropped.
              </>
            ) : (
              <>
                Remove{' '}
                <strong>
                  <Name text={name} />
                </strong>{' '}
                in this plan? It is empty.
              </>
            )}
          </span>
          <EditError message={action.error} />
          <div className="form-actions">
            <button
              className="btn danger"
              disabled={action.pending}
              onClick={() =>
                void action
                  .run(() =>
                    edit({
                      type: `delete_${kind}` as const,
                      target: { id },
                    }),
                  )
                  .then((saved) => saved && setAsking(false))
              }
            >
              {proposed ? 'Drop from plan' : 'Remove in plan'}
            </button>
            <button className="btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </ConfirmShell>
      )}
    </div>
  )
}
