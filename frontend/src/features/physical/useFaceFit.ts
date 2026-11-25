import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
} from 'react'
import { chooseFit, trialBands, type FitTrial } from './faceFit'

/** What a page asks of a face: the biggest jack, and the pixels it keeps free below the face. */
export interface FaceFit {
  maxJack: number
  /** Kept free under the face (a path card's height); 0 by default. */
  keepBelow?: number
}

interface Room {
  w: number
  h: number
}

const px = (value: string) => Number.parseFloat(value) || 0

/** A theme size in px (`--jack-max`, `--jack-readable`), or the fallback when it is not there. */
export function themePx(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

/** The biggest jack of a fitted face: the HDF's, or every other kind's (read from the theme). */
export function jackMax(hdf: boolean): number {
  return hdf ? themePx('--jack-max-hdf', 60) : themePx('--jack-max', 56)
}

/** The nearest ancestor that scrolls the page (the equipment page), else the root. */
export function scrollerOf(card: HTMLElement): HTMLElement {
  for (let e = card.parentElement; e; e = e.parentElement) {
    const y = getComputedStyle(e).overflowY
    if (y === 'auto' || y === 'scroll') return e
  }
  return document.documentElement
}

/**
 * The room a card gives its plate: its inner width, and the height from its top
 * (where it sits in the page, not where the page is scrolled to) to the bottom
 * of the scroll area, less the legend, the area's bottom padding and what the
 * page keeps free.
 */
function measureRoom(
  card: HTMLElement,
  scroller: HTMLElement,
  keepBelow: number,
): Room {
  const style = getComputedStyle(card)
  const w = card.clientWidth - px(style.paddingLeft) - px(style.paddingRight)
  const top =
    card.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop
  const legend = card.querySelector<HTMLElement>('.face-legend')
  const legendH = legend
    ? legend.offsetHeight + px(getComputedStyle(legend).marginTop)
    : 0
  const h =
    scroller.clientHeight -
    top -
    px(getComputedStyle(scroller).paddingBottom) -
    px(style.paddingTop) -
    px(style.paddingBottom) -
    px(style.borderTopWidth) -
    px(style.borderBottomWidth) -
    legendH -
    keepBelow
  return { w: Math.floor(w), h: Math.floor(h) }
}

/** The plate at a jack size: its width and height. */
function plateAt(plate: HTMLElement, jack: number): [number, number] {
  plate.style.setProperty('--j', `${jack}px`)
  return [plate.offsetWidth, plate.offsetHeight]
}

/**
 * Sizes a face to its card. With `fit`, it watches the card and the page's
 * scroll area (a ResizeObserver), and whenever the room, `resetKey` (the face,
 * the side, the numbering) or the page's wishes change it draws the plate in
 * each band count an HDF may take, measures it at 20px and 40px jacks, and
 * applies `chooseFit`. All of it runs in layout effects, so the first paint is
 * already the fitted one. Without `fit` it does nothing: bands 1, no jack.
 */
export function useFaceFit({
  fit,
  card,
  host,
  rows,
  resetKey,
}: {
  fit?: FaceFit
  card: RefObject<HTMLElement | null>
  /** The element that holds the `.faceplate`. */
  host: RefObject<HTMLElement | null>
  /** An HDF's rows (its band counts); 0 for any other face. */
  rows: number
  resetKey: string
}): { bands: number; style?: CSSProperties } {
  const enabled = !!fit
  const maxJack = fit?.maxJack ?? 0
  const keepBelow = fit?.keepBelow ?? 0
  const counts = useMemo(() => (rows > 0 ? trialBands(rows) : [1]), [rows])
  const [room, setRoom] = useState<Room>()
  const [applied, setApplied] = useState({ bands: 1, jack: maxJack })
  const [run, setRun] = useState<{ i: number; trials: FitTrial[] }>()
  // Trials redraw the jacks, so a focused jack is found again by its ID when the run ends.
  const focused = useRef<string | null>(null)
  const finished = useRef(false)

  // The room: now, and whenever the card or the scroll area changes size.
  useLayoutEffect(() => {
    const el = card.current
    if (!enabled || !el) return
    const scroller = scrollerOf(el)
    const read = () => {
      const next = measureRoom(el, scroller, keepBelow)
      setRoom((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next,
      )
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [enabled, keepBelow, card])

  // A new room or a new face starts a run: one trial per band count.
  useLayoutEffect(() => {
    if (!enabled || !room) return
    const active = document.activeElement
    focused.current =
      active && host.current?.contains(active)
        ? active.getAttribute('data-endpoint-id')
        : null
    setRun({ i: 0, trials: [] })
  }, [enabled, room, counts, resetKey, maxJack, host])

  // The run is over: give the focus back to the jack that had it.
  useLayoutEffect(() => {
    if (run || !finished.current) return
    finished.current = false
    if (!focused.current) return
    const id = focused.current
    focused.current = null
    host.current
      ?.querySelector<HTMLElement>(`[data-endpoint-id="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true })
  }, [run, host])

  // One trial per render: the plate is drawn with this band count, measured, then the next.
  useLayoutEffect(() => {
    if (!run || !room) return
    const plate = host.current?.querySelector<HTMLElement>('.faceplate')
    if (!plate) {
      finished.current = true
      setRun(undefined)
      return
    }
    const before = plate.style.getPropertyValue('--j')
    const [w20, h20] = plateAt(plate, 20)
    const [w40, h40] = plateAt(plate, 40)
    plate.style.setProperty('--j', before)
    const trials = [...run.trials, { bands: counts[run.i], w20, h20, w40, h40 }]
    if (run.i + 1 < counts.length) {
      setRun({ i: run.i + 1, trials })
      return
    }
    const readable = themePx('--jack-readable', 18)
    const best = chooseFit(trials, room, maxJack, readable)
    setApplied((prev) =>
      prev.bands === best.bands && prev.jack === best.jack ? prev : best,
    )
    finished.current = true
    setRun(undefined)
  }, [run, room, counts, maxJack, host])

  if (!enabled) return { bands: 1 }
  return {
    bands: run ? counts[run.i] : applied.bands,
    style: { '--j': `${applied.jack}px` } as CSSProperties,
  }
}

/**
 * The side column's height limit, in px (D50): the larger of the face's height
 * and the room from the work row's top, in page coordinates like the face's
 * room, down to where the path card must start (`keepBelow`). Returns
 * `undefined` until measured. The column is as tall as its content up to it.
 */
export function useSideLimit({
  row,
  face,
  keepBelow,
}: {
  row: RefObject<HTMLElement | null>
  face: RefObject<HTMLElement | null>
  keepBelow: number
}): number | undefined {
  const [limit, setLimit] = useState<number>()
  useLayoutEffect(() => {
    const rowEl = row.current
    const faceEl = face.current
    if (!rowEl || !faceEl) return
    const scroller = scrollerOf(rowEl)
    const read = () => {
      const top =
        rowEl.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      const room =
        scroller.clientHeight -
        top -
        px(getComputedStyle(scroller).paddingBottom) -
        keepBelow
      const next = Math.floor(Math.max(faceEl.offsetHeight, room))
      setLimit((prev) => (prev === next ? prev : next))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(faceEl)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [row, face, keepBelow])
  return limit
}
