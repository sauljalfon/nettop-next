/**
 * Stack level of a card among its neighbors: a card carrying facets sits above
 * ordinary cards and a selected one above that. The highest applicable level
 * wins. Raising never moves a card.
 */
export function stackIndex(card: {
  selected: boolean
  facets: number
}): number {
  if (card.selected) return 20
  if (card.facets > 0) return 10
  return 0
}
