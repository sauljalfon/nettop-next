import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { fitZoom, stepZoom, wheelZoom } from './zoom'

type Size = { w: number; h: number }

/**
 * The drawing on a canvas you can zoom (− + Fit, ⌘/Ctrl + wheel or a pinch)
 * and drag. Fit shows the whole drawing (its width on the page, its width and
 * height in Picture only); a chosen zoom stays until Fit. The zoom is state
 * here: the page remounts the canvas (a `key`) to return to Fit when the route
 * or One / All changes. The drawing is scaled with a transform, so the element
 * the export captures keeps its own size.
 */
export default function TraceCanvas({
  picture,
  onPicture,
  title,
  drawingRef,
  children,
}: {
  picture: boolean
  onPicture: (on: boolean) => void
  /** The one title line over the picture in Picture only. */
  title?: ReactNode
  /** The element holding the drawing, for the export. */
  drawingRef?: Ref<HTMLDivElement>
  children: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const [box, setBox] = useState<Size>({ w: 0, h: 0 })
  const [natural, setNatural] = useState<Size>({ w: 0, h: 0 })

  const measure = useCallback(() => {
    const el = scroller.current
    const inner = content.current
    if (!el || !inner) return
    const cs = getComputedStyle(el)
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const next = {
      box: { w: el.clientWidth - padX, h: el.clientHeight - padY },
      natural: { w: inner.offsetWidth, h: inner.offsetHeight },
    }
    setBox((b) => (b.w === next.box.w && b.h === next.box.h ? b : next.box))
    setNatural((n) =>
      n.w === next.natural.w && n.h === next.natural.h ? n : next.natural,
    )
  }, [])
  useLayoutEffect(() => {
    measure()
    const watch = new ResizeObserver(measure)
    if (scroller.current) watch.observe(scroller.current)
    if (content.current) watch.observe(content.current)
    return () => watch.disconnect()
  }, [measure])

  const fit = fitZoom(natural, box, picture)
  const shown = zoom ?? fit
  const shownRef = useRef(shown)
  shownRef.current = shown

  // ⌘/Ctrl + wheel (a trackpad pinch arrives the same way) zooms; it needs a
  // listener that may cancel the page's own zoom, which React's cannot.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setZoom(wheelZoom(shownRef.current, e.deltaY))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Dragging the picture moves it (touch scrolls natively).
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current
    if (
      !el ||
      e.button !== 0 ||
      e.pointerType === 'touch' ||
      (e.target as Element).closest('button')
    )
      return
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      l: el.scrollLeft,
      t: el.scrollTop,
    }
    el.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current
    const d = drag.current
    if (!el || !d) return
    el.scrollLeft = d.l - (e.clientX - d.x)
    el.scrollTop = d.t - (e.clientY - d.y)
  }
  const up = () => {
    drag.current = null
    setDragging(false)
  }

  return (
    <div className="tp-canvas-wrap">
      {picture && title && (
        <div className="tp-pic-title" data-testid="trace-pic-title">
          {title}
        </div>
      )}
      <div className="tp-zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setZoom(stepZoom(shown, -1))}
        >
          −
        </button>
        <span data-testid="trace-zoom">{Math.round(shown * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setZoom(stepZoom(shown, 1))}
        >
          +
        </button>
        <button
          type="button"
          title="Fit the picture"
          onClick={() => setZoom(null)}
        >
          Fit
        </button>
        <button
          type="button"
          aria-pressed={picture}
          title={
            picture
              ? 'Back to the full page (Esc)'
              : 'Only the picture, on the whole page'
          }
          onClick={() => onPicture(!picture)}
        >
          {picture ? 'Exit picture' : '⛶ Picture only'}
        </button>
      </div>
      <div
        ref={scroller}
        className={`tp-canvas${dragging ? ' dragging' : ''}`}
        data-testid="trace-canvas"
        data-zoom={shown.toFixed(3)}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div
          className="tp-sizer"
          style={{ width: natural.w * shown, height: natural.h * shown }}
        >
          <div
            ref={content}
            className="tp-zoomed"
            style={{ transform: `scale(${shown})` }}
          >
            <div ref={drawingRef} data-testid="trace-drawing">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
