import { download, type ExportHeader } from '../map/exportRoute'
import { asciiLine } from '../physical/sheets'

/**
 * Captures each label sheet once and downloads them as one PDF, a page per
 * sheet, deflated like the route and print-sheet PDFs, with an invisible ASCII
 * text layer (the header and one line per label) so it can be searched and
 * copied. The picture carries Hebrew names, which the standard PDF fonts cannot
 * draw. The libraries load on the first print. The sheets are separate offscreen
 * elements: the page, the session and the snapshot are never touched.
 */
export async function exportLabelSheets(options: {
  nodes: readonly HTMLElement[]
  header: ExportHeader
  /** The ASCII lines of each sheet, in the order of `nodes`. */
  lines: readonly (readonly string[])[]
  fileName: string
}): Promise<void> {
  const { nodes } = options
  if (nodes.length === 0) throw new Error('Nothing to print.')
  const width = Math.ceil(nodes[0].offsetWidth)
  const height = Math.ceil(nodes[0].offsetHeight)
  const ratio = Math.min(2, 8000 / Math.max(width, height))
  const { toCanvas } = await import('html-to-image')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    unit: 'px',
    format: [width, height],
    orientation: 'portrait',
    hotfixes: ['px_scaling'],
  })
  for (const [i, node] of nodes.entries()) {
    if (i > 0) pdf.addPage([width, height], 'portrait')
    const canvas = await toCanvas(node, {
      width,
      height,
      pixelRatio: ratio,
      backgroundColor: '#ffffff',
      skipFonts: true, // the app uses system fonts only
    })
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      0,
      0,
      width,
      height,
      undefined,
      'FAST',
    )
    ;[options.header.title, ...options.header.lines]
      .map(asciiLine)
      .concat(options.lines[i] ?? [])
      .forEach((line, j) =>
        pdf.text(line, 24, 24 + j * 14, { renderingMode: 'invisible' }),
      )
  }
  download(pdf.output('blob'), options.fileName)
}
