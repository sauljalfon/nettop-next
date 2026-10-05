/** Where to center the view for a card: its middle, or its corner before it is measured. */
export function centerTarget(card: {
  x: number
  y: number
  width: number
  height: number
}) {
  return { x: card.x + card.width / 2, y: card.y + card.height / 2 }
}
