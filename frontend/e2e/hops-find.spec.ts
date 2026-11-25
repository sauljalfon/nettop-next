import { expect, test, type Page } from './fixtures'
import {
  expandResults,
  fitted,
  leaveTrace,
  oneRoute,
  selectEquipment,
  traceRoutes,
} from './helpers'

async function traceFromEdge17(page: Page) {
  await selectEquipment(page, 'EDGE-17')
  await page
    .getByRole('button', { name: 'Find AGG / BB from EDGE-17', exact: true })
    .click()
  await expect(traceRoutes(page)).toHaveCount(3)
  await oneRoute(page)
}

/** Each walk row as its equipment name and what it arrives at and leaves from; each cable by its link ID. */
const walkRows = (page: Page) =>
  page
    .getByTestId('trace-walk')
    .getByTestId('walk-row')
    .evaluateAll((els) =>
      els.map((el) => ({
        name: el.querySelector('.walk-name bdi')!.textContent,
        arrives: el.querySelector('.walk-arrives')!.textContent,
        leaves: el.querySelector('.walk-leaves')!.textContent,
      })),
    )
const cableNames = (page: Page) =>
  page
    .getByTestId('trace-walk')
    .getByTestId('walk-cable')
    .evaluateAll((els) => els.map((el) => el.querySelector('bdi')!.textContent))

test('POL-04 the Trace page lists the same walk rows from the tree and from Physical, in order', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await traceFromEdge17(page)

  // One row per equipment, AGG-03's path, and the cables between them.
  const rows = await walkRows(page)
  expect(rows.map((r) => r.name)).toEqual([
    'EDGE-17',
    'PANEL-A',
    'HDF-01',
    'HDF-02',
    'AGG-03',
  ])
  expect(await cableNames(page)).toEqual([
    'cable-a01',
    'cable-a02',
    'cable-a03',
    'cable-a04',
  ])

  // Choosing another route moves the walk.
  await traceRoutes(page).nth(1).click()
  expect((await cableNames(page))[0]).toBe('cable-a05')
  await traceRoutes(page).nth(0).click()
  await leaveTrace(page)

  // From Physical the chip reopens the same page with the same rows.
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await expandResults(page)
  expect(await walkRows(page)).toEqual(rows)
})
