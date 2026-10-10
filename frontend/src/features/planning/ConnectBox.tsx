import { useMemo, useState } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import TracePicker from '../pathfinding/TracePicker'
import { ConfirmShell, EditError } from './ConfirmShell'
import { connectItems } from './containers'
import type { PlanEdit } from './editing'
import { useAsyncAction } from './useAsyncAction'

/**
 * Connect a free endpoint: the trace picker's combobox over the free endpoints
 * of other equipment (a sibling port is never offered), then add_cable.
 */
export default function ConnectBox({
  snapshot,
  index,
  endpointId,
  edit,
  openerKey,
  onClose,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  endpointId: string
  edit: PlanEdit
  openerKey: string
  onClose: () => void
}) {
  const items = useMemo(
    () => connectItems(snapshot, index, endpointId),
    [snapshot, index, endpointId],
  )
  const [far, setFar] = useState('')
  const action = useAsyncAction()
  const chosen = items.find((i) => i.value === far)
  return (
    <ConfirmShell
      label="Connect"
      openerKey={openerKey}
      onClose={onClose}
      className="connect-box"
    >
      <TracePicker
        label="Far end: a free port or position"
        items={items}
        value={far}
        onChange={(v) => {
          setFar(v)
          action.clear()
        }}
      />
      <span className="quiet">
        {items.length} free endpoint{items.length === 1 ? '' : 's'}. Sibling
        ports on the same equipment are not offered.
      </span>
      <EditError message={action.error} />
      <div className="inline-row">
        <button
          className="button primary"
          disabled={!chosen || action.pending}
          onClick={() =>
            void action
              .run(() =>
                edit({ type: 'add_cable', cable: { a: endpointId, b: far } }),
              )
              .then((saved) => saved && onClose())
          }
        >
          {chosen ? `Connect to ${chosen.label}` : 'Connect'}
        </button>
        <button className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ConfirmShell>
  )
}
