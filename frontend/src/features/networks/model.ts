import type { Network, Snapshot } from '../../shared/types'

/** The selector entry that opens the drawer; it can never be a network ID. */
export const MANAGE_NETWORKS = '\u0000manage-networks'

export const MAX_NAME_LENGTH = 64

/** Active devices (any role but passive) per network; networks with none are absent. */
export function activeDeviceCounts(s: Snapshot): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of s.equipment)
    if (e.role !== 'passive' && e.networkId)
      counts.set(e.networkId, (counts.get(e.networkId) ?? 0) + 1)
  return counts
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The message for a name the server would reject (the server still decides):
 * 1–64 characters after trimming, and not used by another network ignoring
 * case. `selfId` lets a network keep its own name or change only its case.
 */
export function validateNetworkName(
  name: string,
  networks: readonly Pick<Network, 'id' | 'name'>[],
  selfId?: string,
): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a name.'
  if ([...trimmed].length > MAX_NAME_LENGTH)
    return `Use ${MAX_NAME_LENGTH} characters or fewer.`
  if (networks.some((n) => n.id !== selfId && same(n.name, trimmed)))
    return `“${trimmed}” is already used by another network.`
  return undefined
}
