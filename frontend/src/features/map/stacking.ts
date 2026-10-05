/**
 * Stack level of a card among its neighbors: a card carrying facets sits above
 * ordinary cards, a selected one above that, and one with its popover open on
 * top. The highest applicable level wins. Raising never moves a card.
 */
export function stackIndex(card: {
  selected: boolean
  popoverOpen: boolean
  facets: number
}): number {
  if (card.popoverOpen) return 30
  if (card.selected) return 20
  if (card.facets > 0) return 10
  return 0
}
