import { expect, test, type Page } from '@playwright/test'
import { fitted } from './helpers'

const start = (page: Page) =>
  page.getByRole('combobox', { name: 'Start', exact: true })
const options = (page: Page, name = 'Start') =>
  page.getByRole('listbox', { name: `${name} matches` }).getByRole('option')

async function openTrace(page: Page) {
  await page.goto('/')
  await fitted(page)
  await page
    .getByRole('button', { name: 'Open trace tools', exact: true })
    .click()
}

test('POL-12 the Start picker finds endpoints by words, in any order', async ({
  page,
}) => {
  await openTrace(page)
  // It keeps its accessible name, and shows what is chosen.
  await expect(start(page)).toHaveValue('EDGE-17 · all ports')

  await start(page).fill('edge-17 3')
  await expect(options(page).first()).toHaveText('EDGE-17 · Port 3')
  await start(page).fill('hdf-01 3c/5')
  await expect(options(page)).toHaveText([
    'HDF-01 · 3C/5 front',
    'HDF-01 · 3C/5 rear',
  ])
  await start(page).fill('PANEL-A 1 REAR')
  await expect(options(page).first()).toContainText('PANEL-A · 1')
  await expect(options(page).first()).toContainText('Rear')
  await start(page).fill('rear 3c/5 hdf-01') // any order
  await expect(options(page)).toHaveText(['HDF-01 · 3C/5 rear'])
  await start(page).fill('zzz')
  await expect(page.getByText('No match.')).toBeVisible()
  await expect(options(page)).toHaveCount(0)
})

test('POL-12 offers whole devices for switches only, and at most 50 matches', async ({
  page,
}) => {
  await openTrace(page)
  await start(page).fill('all ports')
  await expect(options(page)).toHaveText([
    'AGG-03 · all ports',
    'AGG-08 · all ports',
    'AGG-12 · all ports',
    'AGG-15 · all ports',
    'BB-01 · all ports',
    'EDGE-17 · all ports',
    'EDGE-22 · all ports',
  ]) // no PANEL-A or HDF
  await expect(page.getByText('refine the search')).toHaveCount(0)

  await start(page).fill('agg')
  await expect(options(page)).toHaveCount(50)
  await expect(
    page.getByText(/\d+ more matches: refine the search/),
  ).toBeVisible()
  await start(page).fill('agg-03')
  await expect(options(page).first()).toHaveText('AGG-03 · all ports')
  await expect(page.getByText('refine the search')).toHaveCount(0)
})

test('POL-12 arrow keys move, Enter chooses, Esc keeps the old choice', async ({
  page,
}) => {
  await openTrace(page)
  await start(page).fill('hdf-01 3c/5')
  const list = options(page)
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await start(page).press('ArrowDown')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'true')
  await start(page).press('ArrowDown') // wraps
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await start(page).press('ArrowUp') // wraps back
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'true')
  await start(page).press('Enter')
  await expect(start(page)).toHaveValue('HDF-01 · 3C/5 rear')
  await expect(page.getByRole('listbox')).toHaveCount(0)

  // Esc closes the list and puts the chosen item back.
  await start(page).fill('edge-22')
  await expect(options(page)).not.toHaveCount(0)
  await start(page).press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(start(page)).toHaveValue('HDF-01 · 3C/5 rear')

  // The chosen passive endpoint really is the start of the next search.
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  const rows = page.getByLabel('Map trace results').getByTestId('route-row')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('HDF-01 · 3C/5 rear → AGG-03')
})

test('POL-12 Destination is a picker too, and exact port-to-port still works', async ({
  page,
}) => {
  await openTrace(page)
  await page
    .getByRole('combobox', { name: 'Trace mode', exact: true })
    .selectOption('point_to_point')
  // Endpoints only, no whole devices, in point-to-point mode.
  await start(page).fill('edge-17 all ports')
  await expect(page.getByText('No match.')).toBeVisible()
  await start(page).fill('edge-17 port 1')
  await options(page).first().click()
  const destination = page.getByRole('combobox', {
    name: 'Destination',
    exact: true,
  })
  await destination.fill('agg-03 port 1')
  await destination.press('Enter')
  await expect(destination).toHaveValue('AGG-03 · Port 1')
  await page
    .getByRole('button', { name: 'Trace physical path', exact: true })
    .click()
  await expect(
    page.getByLabel('Map trace results').getByTestId('route-row'),
  ).toContainText('EDGE-17 · Port 1 → AGG-03 · Port 1')
})
