import { expect, test, type Page } from '@playwright/test'
import {
  fitted,
  openPorts,
  pinFromInspector,
  viewport,
  expectMarks,
} from './helpers'

const facets = (page: Page, name: string) =>
  page.getByLabel(`${name} shown connections`).locator('li')
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const pin = pinFromInspector

test('C03 HDF overview shows one card with parent, location, capacity and network badges', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  const hdf = page.getByTestId('rf__node-hdf-01')
  await expect(hdf.getByRole('heading', { name: 'HDF-01' })).toBeVisible()
  await expect(hdf).toContainText('Main Campus / North Sub-main / Rack SM01')
  await expect(hdf).toContainText('4 of 96 cabled') // capacity: 96 positions
  await expect(hdf).toContainText('Network A')
  await expect(hdf).toContainText('Network B')
  // No hundreds of detached blocks: still one card per equipment, no facets.
  await expect(page.locator('.react-flow__node')).toHaveCount(11)
  await expect(page.locator('.map-facets')).toHaveCount(0)

  // Pins are made in the inspector only: the card has no connections list.
  await expect(
    page.getByRole('button', { name: /Show connections/ }),
  ).toHaveCount(0)
  await expect(page.locator('.map-facets')).toHaveCount(0)
})

test('C05 a manual position stays while automatic facets follow the route', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await expect(page.locator('.react-flow__node-equipment')).toHaveCount(11)
  await pin(page, 'HDF-01', '1A/2')
  await expect(facets(page, 'HDF-01')).toHaveText([/1A \/ 2.*pinned/])

  await page.getByTestId('rf__node-edge-17').click()
  const port = await viewport(page)
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect(rows(page)).toHaveCount(3)

  // AGG-03: automatic 3C/5 next to the manual 1A/2.
  await expect(facets(page, 'HDF-01')).toHaveText([
    /1A \/ 2.*pinned/,
    /3C \/ 5.*route/,
  ])
  // BB-01: the automatic facet follows the route, the manual one stays.
  await rows(page).nth(2).click()
  await expect(facets(page, 'HDF-01')).toHaveText([
    /1A \/ 2.*pinned/,
    /2D \/ 4.*route/,
  ])
  // AGG-08 uses 1A/2 itself: shown once, marked both ways.
  await rows(page).nth(1).click()
  await expect(facets(page, 'HDF-01')).toHaveCount(1)
  await expect(
    page.getByLabel('HDF-01 shown connections').getByRole('button'),
  ).toHaveAttribute('data-source', 'auto manual')
  await expect(facets(page, 'HDF-01')).toHaveText([/1A \/ 2.*route.*pinned/])
  await rows(page).nth(2).click()

  // Clear trace removes only the automatic facets.
  await page.getByRole('button', { name: 'Clear trace' }).click()
  await expect(facets(page, 'HDF-01')).toHaveText([/1A \/ 2.*pinned/])
  await expect(facets(page, 'HDF-02')).toHaveCount(0)
  await expectMarks(page, { routeLinks: [] })
  expect(await viewport(page)).toBe(port)

  // The choice is session state shared by Installed and Plan.
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Close Changes & plans' }).click()
  await expect(page.getByTestId('rf__node-edge-18')).toBeVisible()
  await expect(facets(page, 'HDF-01')).toHaveText([/1A \/ 2.*pinned/])

  // Unchecking removes it.
  await openPorts(page, 'hdf-01')
  await page.getByRole('button', { name: /^Unpin on map: HDF-01/ }).click()
  await expect(page.getByLabel('HDF-01 shown connections')).toHaveCount(0)
})

test('a pinned position can start Find AGG / BB without any route', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await pin(page, 'PANEL-A', '2')
  await page
    .getByRole('button', { name: 'PANEL-A 2, find AGG / BB from here' })
    .click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('AGG-08')
  await expect(facets(page, 'HDF-01')).toHaveText([/1A \/ 2/])
})
