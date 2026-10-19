import { FIT, FIT_MANY } from './center'

/** Above this many nodes the overview and the Physical site screen fit at a readable zoom. */
export const MANY_NODES = 12

/** The overview's automatic fit (first fit, after Reset arrangement): the same rule as the site screen. */
export const overviewFit = (nodeCount: number) =>
  nodeCount > MANY_NODES ? FIT_MANY : FIT
