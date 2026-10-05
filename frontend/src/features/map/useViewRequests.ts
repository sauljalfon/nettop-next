import { useEffect, useSyncExternalStore, type RefObject } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  centerTarget,
  coversFromRects,
  fitViewport,
  viewportFor,
  visibleCenter,
} from './center'
import type { MapSession } from './mapSession'

const OVERLAYS = '.studio-drawer, .map-results'

/**
 * The one place that moves the view on request: center on a card (hop clicks,
 * Explore, the inspector) or fit to a set of cards (choosing a location). Both
 * work in the part of the map that is actually visible, not under an open drawer
 * or the results overlay, animate briefly, and record the new viewport in the
 * session. Centering keeps the current zoom; fitting is a single explicit
 * result of the user's click, never automatic. A request for cards that are not
 * measured yet (just revealed, or the map was not mounted) waits until they are.
 * Each request is handled once, by whichever map mount sees it first.
 */
export function useViewRequests(
  session: MapSession,
  surface: RefObject<HTMLElement | null>,
  nodesVersion: unknown,
) {
  const flow = useReactFlow()
  const center = useSyncExternalStore(session.subscribe, session.centerRequest)
  const fit = useSyncExternalStore(session.subscribe, session.fitRequest)

  const area = () => {
    const element = surface.current
    if (!element) return undefined
    const box = element.getBoundingClientRect()
    const covers = coversFromRects(
      box,
      [...document.querySelectorAll(OVERLAYS)].map((el) =>
        el.getBoundingClientRect(),
      ),
    )
    return { box, covers }
  }
  const measured = (id: string) => {
    const node = flow.getInternalNode(id)
    const width = node?.measured.width ?? 0
    return node && width
      ? {
          x: node.internals.positionAbsolute.x,
          y: node.internals.positionAbsolute.y,
          width,
          height: node.measured.height ?? 0,
        }
      : undefined
  }

  useEffect(() => {
    if (!center || center.serial <= session.centerHandled()) return
    // Selecting the card resizes it, and React Flow measures it a frame later:
    // wait two frames so the center is that of the card's final size.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const card = measured(center.id)
        const where = area()
        if (!card || !where) return // retried when the nodes change
        session.markCenterHandled(center.serial)
        const at = visibleCenter(where.box, where.covers)
        void flow
          .setViewport(viewportFor(centerTarget(card), at, flow.getZoom()), {
            duration: 300,
          })
          .then(() => session.setViewport(flow.getViewport()))
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [flow, center, nodesVersion, session, surface])

  useEffect(() => {
    if (!fit || fit.serial <= session.fitHandled()) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const cards = fit.ids.map(measured)
        const where = area()
        if (!where || cards.length === 0 || cards.some((c) => !c)) return
        session.markFitHandled(fit.serial)
        const xs = cards.flatMap((c) => [c!.x, c!.x + c!.width])
        const ys = cards.flatMap((c) => [c!.y, c!.y + c!.height])
        const bounds = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        }
        void flow
          .setViewport(fitViewport(bounds, where.box, where.covers), {
            duration: 300,
          })
          .then(() => session.setViewport(flow.getViewport()))
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [flow, fit, nodesVersion, session, surface])
}
