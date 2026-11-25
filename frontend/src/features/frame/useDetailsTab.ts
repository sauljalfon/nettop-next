import { useEffect } from 'react'
import { dockSession } from './dock'

/** How many views hold a details tab right now (one at a time; a view change swaps owners in one commit). */
const owners: Record<'Node', number> = { Node: 0 }

/**
 * The details tab of a view (Node on the tree): while `active`
 * the tab exists and `onClose` is what the dock's × and Esc call. A click in the view opens
 * the tab itself (`dockSession.showDetails`); a selection made elsewhere leaves the dock on
 * its tab. When the view lets go the tab leaves, unless another view took over in the same
 * commit (also React's StrictMode rehearsal, which unmounts and mounts at once).
 */
export function useDetailsTab(
  label: 'Node',
  active: boolean,
  onClose: () => void,
  /** What is selected: a new one gives the tab again. */
  selection: string | undefined,
) {
  useEffect(() => {
    // One rule: a selection made on the page opens the tab itself (`dockSession.showDetails`
    // in the view's click handlers); one made from inside the dock only adds the tab here.
    if (active) dockSession.availableDetails(label)
  }, [active, label, selection])
  useEffect(() => {
    if (!active) return
    dockSession.setDetailsCloser(onClose)
    return () => dockSession.setDetailsCloser(undefined)
  }, [active, onClose])
  useEffect(() => {
    if (!active) return
    owners[label]++
    return () => {
      owners[label]--
      queueMicrotask(() => {
        // Still this view's tab (another view's arrival replaced it, or the same view is back).
        if (owners[label] === 0 && dockSession.get().details === label)
          dockSession.hideDetails()
      })
    }
  }, [active, label])
}
