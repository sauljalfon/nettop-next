import type { Network } from '../../shared/types'

/** Distinct from each other, from the teal route and from the amber highlight. */
export const PALETTE = [
  '#2f6fdb',
  '#9a4fc7',
  '#c2542d',
  '#3a8f3a',
  '#c0306b',
  '#6b7a1f',
] as const

/** A cable whose circuit network could not be resolved. */
export const UNRESOLVED_COLOR = '#9bacc0'

/** One stable color per network, from the palette in network order. */
export function networkColors(
  networks: readonly Pick<Network, 'id'>[],
): Map<string, string> {
  return new Map(networks.map((n, i) => [n.id, PALETTE[i % PALETTE.length]]))
}

export const colorOf = (
  colors: ReadonlyMap<string, string>,
  networkId: string,
): string => colors.get(networkId) ?? UNRESOLVED_COLOR
