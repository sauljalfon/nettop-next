import { useEffect, useSyncExternalStore, type RefObject } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  centerTarget,
  coversFromRects,
  viewportFor,
  visibleCenter,
} from './center'
import type { MapSession } from './mapSession'

const OVERLAYS = '.studio-drawer, .map-results'

/**
 * The one place that centers the view on a card (used by hop clicks, Explore,
 * and the inspector's Show on map). It pans to the card at the current zoom with
 * a short animation, putting it in the middle of the part of the map that is
 * actually visible: not under an open drawer or the results overlay. It is not
 * a refit. The new viewport is recorded in the session. A request for a card
 * that is not on screen yet (just revealed, or the map was not mounted) waits
 * until the card is measured. Each request is handled once, whichever map
 * mount sees it first.
 */
export function useCenterRequests(
  session: MapSession,
  surface: RefObject<HTMLElement | null>,
  nodesVersion: unknown,
) {
  const flow = useReactFlow()
  const request = useSyncExternalStore(session.subscribe, session.centerRequest)
  useEffect(() => {
    if (!request || request.serial <= session.centerHandled()) return
    // Selecting the card resizes it, and React Flow measures it a frame later:
    // wait two frames so the center is that of the card's final size.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const node = flow.getInternalNode(request.id)
        const element = surface.current
        const width = node?.measured.width ?? 0
        if (!node || !element || !width) return // retried when the nodes change
        session.markCenterHandled(request.serial)
        const box = element.getBoundingClientRect()
        const covers = coversFromRects(
          box,
          [...document.querySelectorAll(OVERLAYS)].map((el) =>
            el.getBoundingClientRect(),
          ),
        )
        const target = centerTarget({
          x: node.internals.positionAbsolute.x,
          y: node.internals.positionAbsolute.y,
          width,
          height: node.measured.height ?? 0,
        })
        const at = visibleCenter(box, covers)
        void flow
          .setViewport(viewportFor(target, at, flow.getZoom()), {
            duration: 300,
          })
          .then(() => session.setViewport(flow.getViewport()))
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [flow, request, nodesVersion, session, surface])
}
