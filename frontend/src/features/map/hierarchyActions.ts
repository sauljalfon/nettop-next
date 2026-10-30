import { createContext } from 'react'

/** What a card on the hierarchy can ask of the canvas that holds it. */
export const HierarchyActions = createContext<{
  /** A node card was clicked: select it (which opens it). */
  onCard: (key: string) => void
  /** A top, an AGG or a switch row was clicked: select that equipment. */
  onEquipment: (id: string) => void
  /** An open node card's head closes it; the selection goes with it if it was that card. */
  onClose: (key: string) => void
}>({
  onCard: () => undefined,
  onEquipment: () => undefined,
  onClose: () => undefined,
})
