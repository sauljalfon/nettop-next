import { useState } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import ConnectBox from './ConnectBox'
import ConnectRange from './ConnectRange'
import { DisconnectConfirm } from './EditConfirms'
import type { PlanEdit } from './editing'

/**
 * Connect or disconnect the selected endpoint, in a plan. On Installed it only
 * says where editing happens. Keyed by the endpoint, so a new selection starts
 * with no confirm open.
 */
export default function EndpointEdit({
  snapshot,
  index,
  endpointId,
  installedLinkIds,
  edit,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  endpointId: string
  installedLinkIds: ReadonlySet<string>
  edit?: PlanEdit
}) {
  const [open, setOpen] = useState<'disconnect' | 'connect' | 'range'>()
  const cable = index.cableByEndpoint.get(endpointId)
  if (snapshot.context === 'installed')
    return (
      <div className="endpoint-edit" data-testid="endpoint-edit">
        <span className="installed-hint-inline quiet">
          Open a plan to connect or disconnect.
        </span>
      </div>
    )
  if (!edit) return null
  const key = `endpoint:${open ?? ''}:${endpointId}`
  return (
    <div className="endpoint-edit" data-testid="endpoint-edit">
      <span className="section-label">EDIT IN THIS PLAN</span>
      {cable ? (
        <button
          className="button ghost-danger"
          data-opener={`endpoint:disconnect:${endpointId}`}
          onClick={() => setOpen('disconnect')}
        >
          Disconnect…
        </button>
      ) : (
        <>
          {open !== 'connect' && (
            <button
              className="button primary"
              data-opener={`endpoint:connect:${endpointId}`}
              onClick={() => setOpen('connect')}
            >
              Connect…
            </button>
          )}
          {open !== 'range' && (
            <button
              className="button"
              data-opener={`endpoint:range:${endpointId}`}
              onClick={() => setOpen('range')}
            >
              Connect a range…
            </button>
          )}
        </>
      )}
      {open === 'disconnect' && cable && (
        <DisconnectConfirm
          key={key}
          snapshot={snapshot}
          index={index}
          linkId={cable.linkId}
          proposed={!installedLinkIds.has(cable.linkId)}
          edit={edit}
          openerKey={`endpoint:disconnect:${endpointId}`}
          onClose={() => setOpen(undefined)}
        />
      )}
      {open === 'range' && !cable && (
        <ConnectRange
          key={key}
          snapshot={snapshot}
          index={index}
          endpointId={endpointId}
          edit={edit}
          openerKey={`endpoint:range:${endpointId}`}
          onClose={() => setOpen(undefined)}
        />
      )}
      {open === 'connect' && !cable && (
        <ConnectBox
          key={key}
          snapshot={snapshot}
          index={index}
          endpointId={endpointId}
          edit={edit}
          openerKey={`endpoint:connect:${endpointId}`}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  )
}
