import { download, type ExportHeader } from '../map/exportRoute'
import { sheetTextLines } from './sheets'

/**
 * Captures a sheet's DOM once and downloads it as a one-page PDF, deflated like
 * the route PDF, with an invisible ASCII text layer (the header, the column
 * names and each table row) so it can be searched and copied. The libraries load
 * on the first print. The sheet is a separate offscreen element: the page, the
 * session and the snapshot are never touched, and no backend call is made.
 */
export async function exportSheet(options: {
  node: HTMLElement
  header: ExportHeader
  columns: readonly string[]
  rows: readonly (readonly string[])[]
  fileName: string
}): Promise<void> {
  const { node } = options
  const width = Math.ceil(node.offsetWidth)
  const height = Math.ceil(node.offsetHeight)
  const ratio = Math.min(2, 8000 / Math.max(width, height))
  const { toCanvas } = await import('html-to-image')
  const canvas = await toCanvas(node, {
    width,
    height,
    pixelRatio: ratio,
    backgroundColor: '#ffffff',
    skipFonts: true, // the app uses system fonts only
  })
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    unit: 'px',
    format: [width, height],
    orientation: width > height ? 'landscape' : 'portrait',
    hotfixes: ['px_scaling'],
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
  sheetTextLines(options.header, options.columns, options.rows).forEach(
    (line, i) =>
      pdf.text(line, 24, 24 + i * 14, { renderingMode: 'invisible' }),
  )
  download(pdf.output('blob'), options.fileName)
}
