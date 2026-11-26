import { useMemo, useSyncExternalStore } from 'react'
import type { Snapshot } from '../../shared/types'
import SetModelDialog from './SetModelDialog'
import { setModelSession } from './setModelSession'

/**
 * Mounted once in the Workspace: shows the Set model dialog the equipment
 * page's ⋯ menu or the Inventory asked for. Installed only (D51); in a plan
 * nothing opens it.
 */
export default function SetModelHost({
  snapshot,
  onFixed,
  onManageModels,
}: {
  snapshot: Snapshot
  onFixed: (message: string) => Promise<void>
  onManageModels: () => void
}) {
  const request = useSyncExternalStore(
    setModelSession.subscribe,
    setModelSession.get,
  )
  const equipment = useMemo(() => {
    if (!request) return []
    const wanted = new Set(request.equipmentIds)
    return snapshot.equipment.filter((e) => wanted.has(e.id))
  }, [request, snapshot.equipment])
  if (!request || snapshot.context !== 'installed' || equipment.length === 0)
    return null
  return (
    <SetModelDialog
      key={request.equipmentIds.join(',')}
      equipment={equipment}
      endpoints={snapshot.endpoints}
      opener={request.opener}
      onClose={setModelSession.close}
      onFixed={onFixed}
      onManageModels={() => {
        setModelSession.close()
        onManageModels()
      }}
    />
  )
}
