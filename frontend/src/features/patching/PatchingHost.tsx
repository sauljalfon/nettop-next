import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Snapshot } from '../../shared/types'
import { networkColors } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import type { PlanEdit } from '../planning/editing'
import PatchingScreen from './PatchingScreen'
import { patchingSession } from './patchingSession'

/**
 * Shows the patching screen while the session has a request, in a plan only.
 * Mounted once by the Workspace, so it outlives the button that opened it (the
 * endpoint detail turns into Disconnect as soon as its jack is cabled).
 */
export default function PatchingHost({
  snapshot,
  index,
  edit,
}: {
  snapshot: Snapshot
  index: SnapshotIndex
  edit: PlanEdit | undefined
}) {
  const request = useSyncExternalStore(
    patchingSession.subscribe,
    patchingSession.request,
  )
  const colors = useMemo(
    () => networkColors(snapshot.networks),
    [snapshot.networks],
  )
  const planned = snapshot.context === 'planned'
  // Leaving the plan closes the screen; it never shows on Installed.
  useEffect(() => {
    if (!planned) patchingSession.close()
  }, [planned])
  if (
    !request ||
    !planned ||
    !index.lookup.endpoints.has(request.nearEndpointId)
  )
    return null
  return (
    <PatchingScreen
      key={JSON.stringify(request)}
      snapshot={snapshot}
      index={index}
      colors={colors}
      edit={edit}
      request={request}
      onClose={patchingSession.close}
    />
  )
}
