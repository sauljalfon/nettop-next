import { FIT, FIT_MANY } from './center'

/** Above this many node cards the hierarchy fits at a readable zoom, like the Physical site screen. */
export const MANY_CARDS = 12

/** The hierarchy's automatic fit (first fit, and after choosing another network). */
export const hierarchyFit = (cardCount: number) =>
  cardCount > MANY_CARDS ? FIT_MANY : FIT
