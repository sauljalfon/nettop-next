import { FIT } from './center'

/**
 * The hierarchy's automatic fit (first fit, and after choosing another network).
 * It reads left to right and grows downward, so it fits its width (at zoom 1 at
 * most, 0.6 at least) and starts at its top; the rest is scrolled to. A tree
 * that fits whole at a readable zoom is fitted whole, as the other maps are.
 */
export const HIERARCHY_FIT = { ...FIT, minZoom: 0.6, fit: 'width' as const }

export const hierarchyFit = () => HIERARCHY_FIT
