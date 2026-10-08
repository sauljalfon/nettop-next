import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import {
  expectCenteredInVisibleArea,
  fitted,
  openRackInPhysical,
} from './helpers'

const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)
const explore = (page: Page) =>
  page.locator('aside[aria-label="Explore infrastructure"]')
const search = (page: Page) => page.getByLabel('Find equipment')
const physical = (page: Page) =>
  page.getByRole('button', { name: 'Physical', exact: true })

async function openExplore(page: Page) {
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await expect(explore(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

test('SR-01 "a03" lists cable-a03 under Cables and opens HDF-01 3C/5 front in Physical', async ({
  page,
}) => {
  await physical(page).click()
  await openExplore(page)
  await search(page).fill('a03')
  const cables = explore(page).getByTestId('search-cable')
  await expect(
    explore(page).getByRole('heading', { name: 'Cables' }),
  ).toBeVisible()
  await expect(
    explore(page).getByRole('heading', { name: 'Ports' }),
  ).toHaveCount(0)
  await expect(cables).toHaveCount(1)
  await expect(cables.first()).toContainText('cable-a03')
  await expect(cables.first()).toContainText('HDF-01 · 3C/5 front')
  await expect(cables.first()).toContainText('HDF-02 · 2B/3 front')
  await cables.first().click()
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:f')
  await expectMark(page, 'data-side', 'front')
  await expect(page.getByLabel('Equipment inspector')).toHaveCount(0)
})

test('SR-02 "hdf-01 3c/5" lists both sides under Ports; a port opens in Physical, and in Conceptual selects, centers and filters the inspector', async ({
  page,
}) => {
  await physical(page).click()
  await openExplore(page)
  await search(page).fill('hdf-01 3c/5')
  const ports = explore(page).getByTestId('search-port')
  await expect(
    explore(page).getByRole('heading', { name: 'Ports' }),
  ).toBeVisible()
  await expect(ports).toHaveCount(2)
  const texts = (await ports.allTextContents()).map((x) => x.trim()).sort()
  expect(texts[0]).toContain('HDF-01 · 3C/5 front')
  expect(texts[1]).toContain('HDF-01 · 3C/5 rear')
  await expect(explore(page).getByTestId('search-cable')).toHaveCount(2) // cable-a02 and cable-a03
  await ports.filter({ hasText: '3C/5 rear' }).click()
  await expectMark(page, 'data-selected-endpoint', 'hdf-01:sp-3C:5:r')
  await expectMark(page, 'data-side', 'rear')

  // In Conceptual: the equipment is selected and centered, and the inspector's Positions tab is filtered.
  await page.getByRole('button', { name: 'Conceptual', exact: true }).click()
  await expect(search(page)).toHaveValue('hdf-01 3c/5') // the drawer keeps its text
  await explore(page)
    .getByTestId('search-port')
    .filter({ hasText: '3C/5 front' })
    .click()
  await expect(page.locator('.inspector-header h2')).toHaveText('HDF-01')
  await expect(page.getByRole('tab', { name: 'Positions' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByLabel('Search endpoints')).toHaveValue('3C / 5')
  await expect(page.getByTestId('inspector-unit')).toHaveCount(1)
  await expect(
    page.getByTestId('rf__node-hdf-01').locator('.equipment-card'),
  ).toHaveClass(/selected/)
  await expectCenteredInVisibleArea(page, 'hdf-01')
})

test('Explore search shows at most 50 of each, with a "refine the search" note', async ({
  page,
}) => {
  await openExplore(page)
  await search(page).fill('e')
  // The lists follow the typing by about 150 ms.
  await expect(explore(page).getByTestId('search-port')).toHaveCount(50)
  await expect(explore(page)).toContainText('refine the search')
  await search(page).fill('zzz')
  await expect(page.getByText('No equipment matches.')).toBeVisible()
  await expect(explore(page).getByTestId('search-port')).toHaveCount(0)
})

/** Downloads a sheet and returns its name and bytes. */
async function printSheet(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Print sheet' }).click(),
  ])
  const path = await download.path()
  return { name: download.suggestedFilename(), bytes: await readFile(path!) }
}
const today = () => new Date().toLocaleDateString('en-CA')

test('PR-01 the rack sheet is a one-page PDF with the header band and the equipment table, and changes nothing', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await expectMark(page, 'data-physical-level', 'rack')
  const before = await mark(page, 'data-location')
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`)
  })
  const { name, bytes } = await printSheet(page)
  expect(name).toBe('rack-Rack-SM01.pdf')
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  expect(bytes.length).toBeLessThan(2_000_000) // deflated, like the route PDF
  const text = bytes.toString('latin1')
  expect(text.match(/\/Type\s*\/Page(?![s\w])/g)).toHaveLength(1)
  for (const line of [
    'Rack SM01',
    'Main Campus / North Sub-main',
    `Installed - ${today()}`,
    'Unit | Name | Kind | Role | Network',
    'U4-U6 | HDF-01 | hdf | passive |',
  ])
    expect(text).toContain(line)
  // Printing never changes state.
  expect(await mark(page, 'data-location')).toBe(before)
  expect(writes).toEqual([])
  await expect(page.locator('.print-sheet')).toHaveCount(0)
})

test('PR-01 in a plan the header says Proposed with the plan name', async ({
  page,
}) => {
  await page.goto('/?plan=expansion')
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  const { bytes } = await printSheet(page)
  const text = bytes.toString('latin1')
  expect(text).toContain(`Proposed: Expansion - ${today()}`)
  expect(text).toContain('EDGE-18 | switch | access | Network A')
})

test('PR-02 the HDF-01 sheet lists its four cabled positions, both sides, with cables, far ends and locations', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  await expectMark(page, 'data-physical-level', 'equipment')
  const { name, bytes } = await printSheet(page)
  expect(name).toBe('equipment-HDF-01.pdf')
  const text = bytes.toString('latin1')
  expect(text.match(/\/Type\s*\/Page(?![s\w])/g)).toHaveLength(1)
  for (const line of [
    'HDF-01',
    'Main Campus / North Sub-main / Rack SM01',
    `Installed - ${today()}`,
  ])
    expect(text).toContain(line)
  expect(text).toContain('Position | Side | Cable | Far end | Far location')
  for (const row of [
    '1A / 2 | front | cable-a07 |',
    '1A / 2 | rear | cable-a06 |',
    '2D / 4 | front | cable-a11 |',
    '2D / 4 | rear | cable-a10 |',
    '3C / 2 | front | cable-b03 |',
    '3C / 2 | rear | cable-b02 |',
    '3C / 5 | front | cable-a03 |',
    '3C / 5 | rear | cable-a02 |',
  ])
    expect(text).toContain(row)
  expect(text).toContain('Main Campus / Building A / Rack A03')
  // Only cabled endpoints: free positions are not listed.
  expect(text).not.toContain('1A / 1 |')
})

test('PR-02 the sheet is the same from the selected side and for a switch', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-17"]').click()
  const { name, bytes } = await printSheet(page)
  expect(name).toBe('equipment-EDGE-17.pdf')
  const text = bytes.toString('latin1')
  for (const row of ['Port 1 | ', 'cable-a01', 'cable-a05', 'cable-a09'])
    expect(text).toContain(row)
})
