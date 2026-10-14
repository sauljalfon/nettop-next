import type { TraceRequest } from '../../shared/types'

export const EXPORT = {
  /** Space around the diagram. */
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
  /** The whole image in CSS px: the diagram area under the header band. */
  width: number
  height: number
  routeHeight: number
  headerHeight: number
  /** Device pixels per CSS px; lowered when the image would be too large. */
  ratio: number
  pixelWidth: number
  pixelHeight: number
  /** Where the diagram's top-left goes inside the diagram area, in CSS px. */
  offset: { x: number; y: number }
}

/**
 * How big the export is and where the diagram sits in it: the diagram's full size
 * (not the part in view), padded, centered if the header needs more width, under
 * the header band, at pixel ratio 2 unless that would pass the safe maximum.
 */
export function captureLayout(size: {
  width: number
  height: number
}): CaptureLayout {
  const { padding, headerHeight } = EXPORT
  const boundsWidth = size.width + 2 * padding
  const width = Math.max(EXPORT.minWidth, boundsWidth)
  const routeHeight = size.height + 2 * padding
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
    offset: { x: padding + (width - boundsWidth) / 2, y: padding },
  }
}

export function download(blob: Blob, fileName: string) {
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
 * Captures the route diagram once and downloads it as a PNG or a one-page PDF.
 * The libraries load on the first export. The capture is of a clone of the
 * diagram element at its full scroll size, so the whole route is in the image
 * whatever is scrolled or covered, and the page itself is never touched: no
 * session or snapshot change, and no backend call.
 */
export async function exportRouteView(options: {
  format: 'png' | 'pdf'
  /** The diagram's own element (the inner `.rd`), not its scroll box. */
  element: HTMLElement
  header: ExportHeader
  start: string
  end: string
}): Promise<void> {
  const { format, element, header } = options
  const size = { width: element.scrollWidth, height: element.scrollHeight }
  if (!size.width || !size.height) throw new Error('Nothing to export.')
  const layout = captureLayout(size)
  const { toCanvas } = await import('html-to-image')
  const picture = await toCanvas(element, {
    width: size.width,
    height: size.height,
    pixelRatio: layout.ratio,
    backgroundColor: '#ffffff',
    skipFonts: true, // the app uses system fonts only
  })
  const canvas = document.createElement('canvas')
  canvas.width = layout.pixelWidth
  canvas.height = layout.pixelHeight
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawHeader(ctx, header, layout)
  ctx.drawImage(
    picture,
    layout.offset.x * layout.ratio,
    (layout.headerHeight + layout.offset.y) * layout.ratio,
    size.width * layout.ratio,
    size.height * layout.ratio,
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
