import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { Plan } from '../src/shared/types'
import {
  captureLayout,
  exportHeader,
  pdfText,
} from '../src/features/map/exportRoute'
import {
  expectMarks,
  fitted,
  selectEquipment,
  settledViewport,
} from './helpers'

const toggle = (page: Page) => page.getByRole('button', { name: 'Route view' })
const exportButton = (page: Page, format: 'PNG' | 'PDF') =>
  page.getByRole('button', { name: `Export ${format}` })
const START = 'EDGE-17 · Port 1'
const END = 'AGG-03 · Port 1'

async function traceFromEdge17(page: Page) {
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(
    page.getByLabel('Map trace results').getByTestId('route-row'),
  ).toHaveCount(3)
}

async function routeViewOn(page: Page, url = '/') {
  await page.goto(url)
  await fitted(page)
  await traceFromEdge17(page)
  await toggle(page).click()
  await expectMarks(page, { routeView: true })
}

async function download(page: Page, format: 'PNG' | 'PDF') {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    exportButton(page, format).click(),
  ])
  return {
    name: file.suggestedFilename(),
    bytes: await readFile((await file.path())!),
  }
}

/** The capture layout the export should have: from the diagram's full size, not what shows. */
const expectedLayout = async (page: Page) =>
  captureLayout(
    await page
      .getByTestId('route-diagram')
      .evaluate((el) => ({ width: el.scrollWidth, height: el.scrollHeight })),
  )

test('POL-27 PNG export downloads a non-empty image of the route, named for it, at twice its size', async ({
  page,
}) => {
  await routeViewOn(page)
  const layout = await expectedLayout(page)
  const port = await settledViewport(page)
  const { name, bytes } = await download(page, 'PNG')
  expect(name).toBe('route-EDGE-17-Port-1-AGG-03-Port-1.png')
  expect(bytes.length).toBeGreaterThan(20_000)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  // IHDR: width and height, big-endian.
  expect(bytes.readUInt32BE(16)).toBe(layout.pixelWidth)
  expect(bytes.readUInt32BE(20)).toBe(layout.pixelHeight)
  expect(layout.ratio).toBe(2)
  // The whole diagram, not the part in view: wider than the box that scrolls it.
  const shown = await page
    .locator('.rd-scroll')
    .evaluate((el) => ({ view: el.clientWidth, full: el.scrollWidth }))
  expect(shown.full).toBeGreaterThan(shown.view)
  expect(layout.width).toBeGreaterThanOrEqual(shown.full)
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(shown.view * 2)
  // Exporting leaves the page as it was: the same view, no leftover header.
  expect(await settledViewport(page)).toBe(port)
  await expectMarks(page, { routeView: true })
  await expect(page.getByText('Installed ·')).toHaveCount(0)
})

test('POL-28 PDF export downloads a one-page PDF sized like the image', async ({
  page,
}) => {
  await routeViewOn(page)
  const layout = await expectedLayout(page)
  const { name, bytes } = await download(page, 'PDF')
  expect(name).toBe('route-EDGE-17-Port-1-AGG-03-Port-1.pdf')
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  // The image is compressed: a one-page route stays small (it was about 9 MB uncompressed).
  expect(bytes.length).toBeLessThan(2_000_000)
  const text = bytes.toString('latin1')
  expect(text.match(/\/Type\s*\/Page(?![s\w])/g)).toHaveLength(1)
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text)!
  expect(Number(box[1]) / Number(box[2])).toBeCloseTo(
    layout.width / layout.height,
    2,
  )
})

test('POL-29 the PDF header names start → end, the mode, the network and Installed', async ({
  page,
}) => {
  await routeViewOn(page)
  const text = (await download(page, 'PDF')).bytes.toString('latin1')
  const header = pdfText(
    exportHeader({
      start: START,
      end: END,
      mode: 'distribution',
      networkName: 'Network A',
      date: new Date().toLocaleDateString('en-CA'),
    }),
  )
  expect(header[0]).toBe('EDGE-17 - Port 1 -> AGG-03 - Port 1')
  for (const line of header) expect(text).toContain(line)
})

test('POL-29 in a plan the header says Proposed with the plan name', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/plans', {
    data: { name: 'Export plan', expectedBaseRevision: 'acceptance-1' },
  })
  const plan = (await created.json()) as Plan
  await routeViewOn(page, `/?plan=${plan.id}`)
  const text = (await download(page, 'PDF')).bytes.toString('latin1')
  expect(text).toContain('Proposed: Export plan - ')
  expect(text).not.toContain('Installed - ')
})

test('POL-30 export is unavailable without an active route, and until the route view is on', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  // No route: no overlay, so no export.
  await expect(exportButton(page, 'PNG')).toHaveCount(0)
  await expect(exportButton(page, 'PDF')).toHaveCount(0)

  await traceFromEdge17(page)
  // A route but the full map: shown, disabled, and saying why.
  for (const format of ['PNG', 'PDF'] as const) {
    await expect(exportButton(page, format)).toBeDisabled()
    await expect(exportButton(page, format)).toHaveAttribute(
      'title',
      'Turn on Route view to export',
    )
  }
  await toggle(page).click()
  await expect(exportButton(page, 'PNG')).toBeEnabled()
  await expect(exportButton(page, 'PDF')).toBeEnabled()
  await toggle(page).click()
  await expect(exportButton(page, 'PNG')).toBeDisabled()

  // Clearing the trace removes them again.
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(exportButton(page, 'PNG')).toHaveCount(0)
})
