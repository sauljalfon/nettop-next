import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { trace } from '../../shared/api'
import type { Equipment, Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { uplinkLines, type Uplinks } from './uplinks'

export interface UplinksState {
  /** False for anything but an access switch: no request is made. */
  enabled: boolean
  loading: boolean
  error?: Error
  data?: Uplinks
  retry: () => void
}

/**
 * Find AGG / BB from every port of one access switch, for the uplinks summary.
 * Its own query: it never touches the map's selected trace. The revision is in
 * the key, so a cached answer is never stale.
 */
export function useUplinks(
  snapshot: Snapshot,
  index: SnapshotIndex,
  equipment: Equipment | undefined,
  planId?: string,
): UplinksState {
  const enabled = equipment?.kind === 'switch' && equipment.role === 'access'
  const equipmentId = equipment?.id ?? ''
  const query = useQuery({
    queryKey: [
      'uplinks',
      snapshot.context,
      planId,
      snapshot.revision,
      equipmentId,
    ],
    queryFn: () =>
      trace(
        snapshot.context,
        { mode: 'distribution', device: equipmentId },
        planId,
        snapshot.revision,
      ),
    enabled,
    staleTime: Infinity,
  })
  const data = useMemo(
    () => query.data && uplinkLines(index, query.data, equipmentId),
    [index, query.data, equipmentId],
  )
  return {
    enabled,
    loading: enabled && query.isPending,
    error: query.error ?? undefined,
    data,
    retry: () => void query.refetch(),
  }
}
