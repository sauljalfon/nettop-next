import { expect, test, type Page } from '@playwright/test'
import { fitted, viewport, expectMarks } from './helpers'

const facets = (page: Page, name: string) =>
  page.getByLabel(`${name} shown connections`).locator('li')
const rows = (page: Page) =>
  page.getByLabel('Map trace results').getByTestId('route-row')
const showConnections = (page: Page, name: string) =>
  page.getByRole('button', { name: `Show connections of ${name}` })

async function pin(page: Page, equipment: string, query: string) {
  await showConnections(page, equipment).click()
  await page.getByLabel(`Search ${equipment} connections`).fill(query)
  await page
    .getByLabel(`${equipment} connections`)
    .getByRole('checkbox')
    .first()
    .check()
}

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

  // The list offers only cabled positions, never all 96.
  await showConnections(page, 'HDF-01').click()
  const entries = page.getByLabel('HDF-01 connections').locator('li')
  await expect(entries).toHaveText(['1A / 2', '2D / 4', '3C / 2', '3C / 5'])
  const search = page.getByLabel('Search HDF-01 connections')
  await search.fill('3C/5')
  await expect(entries).toHaveText(['3C / 5'])
  await search.fill('3C / 5')
  await expect(entries).toHaveText(['3C / 5'])
  await search.fill('')

  // With Network A active, the other network's circuit is labeled.
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network A' })
  await expect(entries.filter({ hasText: '3C / 2' })).toContainText('Network B')
  await expect(entries.filter({ hasText: '3C / 5' })).not.toContainText(
    'Network',
  )
  await expect(page.locator('.map-facets')).toHaveCount(0) // listing is not expanding
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
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const port = await viewport(page)
  await page
    .getByRole('button', { name: 'Find AGG / BB from all ports of EDGE-17' })
    .click()
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
  await showConnections(page, 'HDF-01').click()
  await page
    .getByLabel('HDF-01 connections')
    .getByRole('checkbox')
    .first()
    .uncheck()
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
