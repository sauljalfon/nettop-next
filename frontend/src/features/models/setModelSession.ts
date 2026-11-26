// The open Set model dialog (D51), session-only: the equipment it is for and the
// element focus returns to. Physical's ⋯ menu and the Inventory open it; the
// Workspace's SetModelHost shows it.
export interface SetModelRequest {
  equipmentIds: string[]
  /** The `data-opener` mark of the control that opened it. */
  opener: string
}

let current: SetModelRequest | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const setModelSession = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
  get: () => current,
  open(equipmentIds: string[], opener: string) {
    current = { equipmentIds, opener }
    emit()
  },
  close() {
    if (!current) return
    current = undefined
    emit()
  },
}
