import type { TraceRequest } from '../../shared/types'
import type { Rect } from './routeView'

export const EXPORT = {
  /** Space around the route and its boxes. */
  padding: 32,
  /** The header band above the route, in CSS px. */
  headerHeight: 96,
  /** The header needs this much width for its longest line. */
  minWidth: 520,
  ratio: 2,
  /** No side of the image exceeds this many pixels. */
  maxSide: 8000,
}

const MODES: Record<TraceRequest['mode'], string> = {
  distribution: 'Find AGG / BB',
  point_to_point: 'Exact port → port',
}

export interface ExportHeader {
  title: string
  lines: string[]
}

/**
 * The header band of an export: start → end, then the mode and network, then
 * Installed (or Proposed with the plan's name) and the date. The date is a
 * parameter so the text is deterministic.
 */
export function exportHeader(input: {
  start: string
  end: string
  mode: TraceRequest['mode']
  networkName?: string
  /** The plan's name when the route is in a plan. */
  plan?: string
  /** "2026-10-06". */
  date: string
}): ExportHeader {
  return {
    title: `${input.start} → ${input.end}`,
    lines: [
      `${MODES[input.mode]} · ${input.networkName ?? 'Network unresolved'}`,
      `${input.plan ? `Proposed: ${input.plan}` : 'Installed'} · ${input.date}`,
    ],
  }
}

/** The header as plain ASCII, for the PDF's text layer (standard PDF fonts have no arrow). */
export const pdfText = (header: ExportHeader): string[] =>
  [header.title, ...header.lines].map((line) =>
    line
      .replaceAll('→', '->')
      .replaceAll('·', '-')
      .replace(/[^\x20-\x7e]/g, '?'),
  )

/** route-<start>-<end>.<ext> with safe characters only. */
export function exportFileName(
  start: string,
  end: string,
  extension: 'png' | 'pdf',
): string {
  const safe = (text: string) =>
    text.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `route-${safe(start)}-${safe(end)}.${extension}`
}

export interface CaptureLayout {
  /** The whole image in CSS px: the route area under the header band. */
  width: number
  height: number
  routeHeight: number
  headerHeight: number
  /** Device pixels per CSS px; lowered when the image would be too large. */
  ratio: number
  pixelWidth: number
  pixelHeight: number
  /** Where the canvas's flow origin goes inside the route area, in CSS px. */
  translate: { x: number; y: number }
}

/**
 * How big the export is and where the route sits in it: the bounds of the
 * route's cards and outline boxes (flow coordinates), padded, centered if the
 * header needs more width, under the header band, at pixel ratio 2 unless that
 * would pass the safe maximum.
 */
export function captureLayout(rects: readonly Rect[]): CaptureLayout {
  const left = Math.min(...rects.map((r) => r.x))
  const top = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  const { padding, headerHeight } = EXPORT
  const boundsWidth = right - left + 2 * padding
  const width = Math.max(EXPORT.minWidth, boundsWidth)
  const routeHeight = bottom - top + 2 * padding
  const height = routeHeight + headerHeight
  const ratio = Math.min(EXPORT.ratio, EXPORT.maxSide / Math.max(width, height))
  return {
    width,
    height,
    routeHeight,
    headerHeight,
    ratio,
    pixelWidth: Math.round(width * ratio),
    pixelHeight: Math.round(height * ratio),
    translate: {
      x: padding - left + (width - boundsWidth) / 2,
      y: padding - top,
    },
  }
}

/** Every node's rectangle in flow coordinates, read from the drawn viewport. */
export function readNodeRects(viewport: HTMLElement): Rect[] {
  return [
    ...viewport.querySelectorAll<HTMLElement>('.react-flow__node'),
  ].flatMap((el) => {
    const at = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
      el.style.transform,
    )
    return at
      ? [
          {
            x: Number(at[1]),
            y: Number(at[2]),
            width: el.offsetWidth,
            height: el.offsetHeight,
          },
        ]
      : []
  })
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  header: ExportHeader,
  layout: CaptureLayout,
) {
  const k = layout.ratio
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, layout.width * k, layout.headerHeight * k)
  ctx.fillStyle = '#e3e8f0'
  ctx.fillRect(0, layout.headerHeight * k - 1, layout.width * k, 1)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1f2a37'
  ctx.font = `600 ${22 * k}px system-ui, sans-serif`
  ctx.fillText(header.title, EXPORT.padding * k, 36 * k)
  ctx.fillStyle = '#5b6b82'
  ctx.font = `${14 * k}px system-ui, sans-serif`
  header.lines.forEach((line, i) =>
    ctx.fillText(line, EXPORT.padding * k, (58 + i * 20) * k),
  )
}

/**
 * Captures the route view once and downloads it as a PNG or a one-page PDF.
 * The libraries load on the first export. The capture is of a clone of the
 * React Flow viewport with its own transform, so the route is whole whatever
 * the zoom, pan or open drawers are, and the page itself is never touched:
 * no viewport, session or snapshot change, and no backend call.
 */
export async function exportRouteView(options: {
  format: 'png' | 'pdf'
  viewport: HTMLElement
  header: ExportHeader
  start: string
  end: string
}): Promise<void> {
  const { format, viewport, header } = options
  const rects = readNodeRects(viewport)
  if (!rects.length) throw new Error('Nothing to export.')
  const layout = captureLayout(rects)
  const { toCanvas } = await import('html-to-image')
  const route = await toCanvas(viewport, {
    width: layout.width,
    height: layout.routeHeight,
    pixelRatio: layout.ratio,
    backgroundColor: '#f6f8fb',
    skipFonts: true, // the app uses system fonts only
    style: {
      width: `${layout.width}px`,
      height: `${layout.routeHeight}px`,
      transform: `translate(${layout.translate.x}px, ${layout.translate.y}px) scale(1)`,
    },
  })
  const canvas = document.createElement('canvas')
  canvas.width = layout.pixelWidth
  canvas.height = layout.pixelHeight
  const ctx = canvas.getContext('2d')!
  drawHeader(ctx, header, layout)
  ctx.drawImage(
    route,
    0,
    layout.headerHeight * layout.ratio,
    layout.width * layout.ratio,
    layout.routeHeight * layout.ratio,
  )
  const fileName = exportFileName(options.start, options.end, format)
  if (format === 'png') {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) throw new Error('The image could not be created.')
    download(blob, fileName)
    return
  }
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    unit: 'px',
    format: [layout.width, layout.height],
    orientation: layout.width > layout.height ? 'landscape' : 'portrait',
    hotfixes: ['px_scaling'],
  })
  // 'FAST' deflates the pixels (lossless); stored raw, one page is about 9 MB.
  pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    0,
    0,
    layout.width,
    layout.height,
    undefined,
    'FAST',
  )
  // An invisible text layer: the header can be searched and copied.
  pdfText(header).forEach((line, i) =>
    pdf.text(line, EXPORT.padding, 36 + i * 20, { renderingMode: 'invisible' }),
  )
  download(pdf.output('blob'), fileName)
}
