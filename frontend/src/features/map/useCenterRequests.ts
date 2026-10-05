import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useReactFlow } from '@xyflow/react'
import { centerTarget } from './center'
import type { MapSession } from './mapSession'

/**
 * The one place that centers the view on a card (used by hop clicks, find on
 * map and, later, the inspector's Show on map). It pans to the card at the
 * current zoom with a short animation. It is not a refit. The new viewport is
 * recorded in the session. A request for a card that is not on screen yet (just
 * revealed) waits until the card is measured.
 */
export function useCenterRequests(session: MapSession, nodesVersion: unknown) {
  const flow = useReactFlow()
  const request = useSyncExternalStore(session.subscribe, session.centerRequest)
  // A request made before this map mounted (for example in the other context) is old news.
  const handled = useRef(session.centerRequest()?.serial ?? 0)
  useEffect(() => {
    if (!request || request.serial === handled.current) return
    // Selecting the card resizes it, and React Flow measures it a frame later:
    // wait two frames so the center is that of the card's final size.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const node = flow.getInternalNode(request.id)
        const width = node?.measured.width ?? 0
        if (!node || !width) return // retried when the nodes change
        handled.current = request.serial
        const target = centerTarget({
          x: node.internals.positionAbsolute.x,
          y: node.internals.positionAbsolute.y,
          width,
          height: node.measured.height ?? 0,
        })
        void flow
          .setCenter(target.x, target.y, {
            zoom: flow.getZoom(),
            duration: 300,
          })
          .then(() => session.setViewport(flow.getViewport()))
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [flow, request, nodesVersion, session])
}
