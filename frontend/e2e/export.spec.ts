import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from './fixtures'
import { exportHeader, pdfText } from '../src/features/map/exportRoute'
import { fitted, oneRoute, selectEquipment } from './helpers'
import { newPlan } from './plan-api'

// The export lives on the Trace page (D46); its files, sizes and the Picture-only and
// All routes variants are in trace-page.spec.ts (TP-11). This file keeps the header text.
test.use({ viewport: { width: 1536, height: 864 } })

const START = 'EDGE-17 · Port 1'
const END = 'AGG-03 · Port 1'

async function openPageFromEdge17(page: Page, url = '/') {
  await page.goto(url)
  await fitted(page)
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await expect(page.getByTestId('trace-drawing')).toBeVisible()
  await oneRoute(page)
}

async function pdfBytes(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByTestId('trace-bar')
      .getByRole('button', { name: 'PDF', exact: true })
      .click(),
  ])
  return readFile((await file.path())!)
}

test('POL-29 the PDF header names start → end, the mode, the network and Installed', async ({
  page,
}) => {
  await openPageFromEdge17(page)
  const text = (await pdfBytes(page)).toString('latin1')
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
  const id = await newPlan(request, 'Export plan')
  await openPageFromEdge17(page, `/?plan=${id}`)
  const text = (await pdfBytes(page)).toString('latin1')
  expect(text).toContain('Proposed: Export plan - ')
  expect(text).not.toContain('Installed - ')
})
