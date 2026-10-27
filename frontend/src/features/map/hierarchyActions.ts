import { createContext } from 'react'

/** What a card on the hierarchy can ask of the canvas that holds it. */
export const HierarchyActions = createContext<{
  /** A tier card or node card was clicked: open its drawer. */
  onCard: (key: string) => void
}>({ onCard: () => undefined })
