import { expect, test, type Page } from '@playwright/test'
import {
  BUILDING_A,
  fitted,
  openRackInPhysical,
  selectEdge17,
  selectEquipment,
  settledViewport,
  viewport,
} from './helpers'

// OV-07 to OV-09. The acceptance fixture; the selection is session-only, so no spec cleans up.
const root = (page: Page) => page.locator('[data-view="hierarchy"]')
const card = (page: Page, key: string) =>
  page.locator(`[data-card-key="${key}"]`)
const row = (page: Page, id: string) =>
  page.locator(`[data-card-switch="${id}"]`)
/** Every element is inside the canvas and under no drawer, rail or results panel. */
async function expectInFreeArea(page: Page, selectors: string[]) {
  await expect
    .poll(() =>
      page.evaluate((list) => {
        const surface = document
          .querySelector('.flow-surface')!
          .getBoundingClientRect()
        const covers = [
          ...document.querySelectorAll(
            '.studio-drawer, .hierarchy-drawer, .tool-rail, .map-results',
          ),
        ].map((el) => el.getBoundingClientRect())
        return list.map((sel) => {
          const r = document.querySelector(sel)!.getBoundingClientRect()
          const inside =
            r.left >= surface.left - 1 &&
            r.right <= surface.right + 1 &&
            r.top >= surface.top - 1 &&
            r.bottom <= surface.bottom + 1
          const hidden = covers.some(
            (c) =>
              r.left < c.right &&
              c.left < r.right &&
              r.top < c.bottom &&
              c.top < r.bottom,
          )
          return inside && !hidden
        })
      }, selectors),
    )
    .toEqual(selectors.map(() => true))
}

const drawer = (page: Page) => page.getByTestId('hierarchy-drawer')

const shift = (style: string) => {
  const [, x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(style)!
  return { x: Number(x), y: Number(y) }
}
const scale = (style: string) => /scale\(([\d.]+)\)/.exec(style)![1]

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

/** Building A open, EDGE-17 marked, its way up lit and the rest dimmed. */
async function expectEdge17Selected(page: Page) {
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-open', 'true')
  await expect(row(page, 'edge-17')).toHaveAttribute('data-selected', 'true')
  for (const key of [BUILDING_A, 'agg-03', 'agg-08', 'bb-01'])
    await expect(card(page, key)).toHaveAttribute('data-lit', 'true')
  await expect(card(page, 'agg-15')).toHaveAttribute('data-dim', 'true')
  await expect(card(page, 'agg-15')).not.toHaveAttribute('data-lit', /.*/)
}

test('OV-07 Show on map EDGE-17 from the Inspector selects it on the tree, and Esc clears it', async ({
  page,
}) => {
  await selectEdge17(page) // the inspector is open on EDGE-17
  const before = await settledViewport(page)
  await page.getByRole('button', { name: 'Show on map: EDGE-17' }).click()
  await expect(root(page)).toBeVisible()
  await expectEdge17Selected(page)
  // The selection pans to show the card with its frame in what the drawers leave
  // free, and never zooms or refits: the scale stays.
  const after = await settledViewport(page)
  expect(scale(after)).toBe(scale(before))
  await expectInFreeArea(page, [
    '[data-card-key="agg-03"]',
    `[data-card-key="${BUILDING_A}"]`,
  ])

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-lit]')).toHaveCount(0)
  await expect(page.locator('[data-dim]')).toHaveCount(0)
  await expect(page.locator('[data-selected]')).toHaveCount(0)
  expect(await viewport(page)).toBe(after)
  // Clearing keeps the open cards.
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-open', 'true')
})

test('OV-07 a click on a card selects it, and Esc clears it', async ({
  page,
}) => {
  await card(page, BUILDING_A).click()
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-selected', 'true')
  await expect(card(page, 'bb-01')).toHaveAttribute('data-lit', 'true')
  await expect(drawer(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-lit]')).toHaveCount(0)
  await expect(drawer(page)).toHaveCount(0)
})

test('OV-08 Explore selects EDGE-17 the same way', async ({ page }) => {
  await selectEquipment(page, 'EDGE-17')
  await expectEdge17Selected(page)
})

test('OV-08 Show on map from the Inventory selects the equipment', async ({
  page,
}) => {
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await page.getByRole('table').getByLabel('Select EDGE-17').check()
  await page
    .getByRole('toolbar', { name: 'Commands' })
    .getByRole('button', { name: 'Show on map' })
    .click()
  await fitted(page)
  await expectEdge17Selected(page)
})

test('OV-08 Show on map from a Physical endpoint selects the equipment, and HDF-01 lights EDGE-17’s card', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  await page
    .locator(
      '[data-testid="face-endpoint"][data-endpoint-id="hdf-01:sp-3C:5:f"]',
    )
    .click()
  await page.getByRole('button', { name: 'Show on map' }).click()
  await fitted(page)
  await expect(card(page, 'hdf-01')).toHaveCount(0)
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-lit', 'true')
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-open', 'true')
  await expect(card(page, 'agg-15')).toHaveAttribute('data-dim', 'true')
  await expect(drawer(page).getByTestId('hd-say')).toContainText(
    'circuits of Network A run through it',
  )
  const depends = drawer(page).getByTestId('hd-depends')
  await expect(depends).toContainText('EDGE-17')
})

test('OV-09 a passive chip opens the route view on that jack, a device chip selects that device', async ({
  page,
}) => {
  await selectEquipment(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const way = drawer(page).getByTestId('hd-way')
  await expect(way.locator('[data-way-row]')).toHaveCount(3)
  await way
    .getByRole('button', { name: /^HDF-01/ })
    .first()
    .click()
  await expect(page.getByTestId('route-layer')).toBeVisible()
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-route-view',
    'true',
  )
  await page.getByRole('button', { name: 'Route view' }).click() // back to the map
  await expect(page.locator('.flow-surface')).toHaveAttribute(
    'data-route-view',
    'false',
  )
  await way.getByRole('button', { name: 'AGG-03', exact: true }).first().click()
  await expect(card(page, 'agg-03')).toHaveAttribute('data-selected', 'true')
  await expect(drawer(page).locator('h2')).toHaveText('AGG-03')
})

test('Show on map for equipment of another network shows that network, lit', async ({
  page,
}) => {
  await expect(root(page)).toHaveAttribute('data-network', 'net-a')
  await selectEquipment(page, 'EDGE-22')
  await expect(root(page)).toHaveAttribute('data-network', 'net-b')
  await fitted(page)
  await expect(row(page, 'edge-22')).toHaveAttribute('data-selected', 'true')
  await expect(card(page, 'agg-12')).toHaveAttribute('data-lit', 'true')
})

test('OV-10 no Focus anywhere: no Focus button in the Inspector, and no Focus view after Show on map, Explore, Inventory or Physical', async ({
  page,
}) => {
  const focus = page.locator('[data-view="focus"]')
  const inspector = page.locator('[aria-label="Equipment inspector"]').first()
  await selectEquipment(page, 'EDGE-17') // Explore
  await expect(inspector).toBeVisible()
  await expect(inspector.getByRole('button', { name: /^Focus/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+1 hop' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '‹ Hierarchy' })).toHaveCount(0)
  await expect(focus).toHaveCount(0)

  await page.getByRole('button', { name: 'Show on map: EDGE-17' }).click() // Inspector
  await expect(focus).toHaveCount(0)

  await page // Inventory
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Inventory', exact: true })
    .click()
  await page.getByRole('table').getByLabel('Select AGG-03').check()
  await page
    .getByRole('toolbar', { name: 'Commands' })
    .getByRole('button', { name: 'Show on map' })
    .click()
  await fitted(page)
  await expect(focus).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Focus/ })).toHaveCount(0)

  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01') // Physical
  await page.locator('.rack-block[data-equipment-id="hdf-01"]').click()
  await page
    .locator(
      '[data-testid="face-endpoint"][data-endpoint-id="hdf-01:sp-3C:5:f"]',
    )
    .click()
  await page.getByRole('button', { name: 'Show on map' }).click()
  await fitted(page)
  await expect(focus).toHaveCount(0)
})

test('OV-05 EDGE-17’s way up through PANEL-A 1, HDF-01 3C/5 and HDF-02 2B/3 to AGG-03, and its two other ways', async ({
  page,
}) => {
  await selectEquipment(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  const rows = drawer(page).getByTestId('hd-way').locator('[data-way-row]')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText(
    /PANEL-A 1.*HDF-01 3C\/5.*HDF-02 2B\/3.*AGG-03/,
  )
  await expect(rows.nth(1)).toContainText(
    /PANEL-A 2.*HDF-01 1A\/2.*HDF-02 1D\/2.*AGG-08/,
  )
  await expect(rows.nth(2)).toContainText(
    /PANEL-A 3.*HDF-01 2D\/4.*HDF-02 3A\/1.*BB-01/,
  )
})

test('OV-07 a card the plan adds is Proposed on the tree; back in Installed the selection is gone', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await selectEquipment(page, 'EDGE-18')
  await expect(drawer(page).locator('h2')).toHaveText('EDGE-18')
  await expect(
    drawer(page).locator('.chip', { hasText: 'Proposed' }),
  ).toBeVisible()
  await expect(drawer(page).getByTestId('hd-way')).toContainText('AGG-15')
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  await expect(drawer(page)).toHaveCount(0)
  await expect(page.locator('[data-lit]')).toHaveCount(0)
})

test('OV-07 readability: with a switch selected, no text on the tree renders below 11px', async ({
  page,
}) => {
  await selectEquipment(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await settledViewport(page)
  const small = await page.evaluate(() => {
    const surface = document.querySelector(
      '[data-view="hierarchy"] .react-flow__viewport',
    )!
    const zoom = new DOMMatrix(getComputedStyle(surface).transform).a
    const found: string[] = []
    for (const el of surface.querySelectorAll<HTMLElement>('*')) {
      const own = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '',
      )
      if (!own) continue
      const px = parseFloat(getComputedStyle(el).fontSize) * zoom
      if (px < 11)
        found.push(
          `${el.className}: ${px.toFixed(1)}px "${el.textContent!.trim().slice(0, 24)}"`,
        )
    }
    return found
  })
  expect(small).toEqual([])
})

test('OV-07 a passive selected from Explore lights EDGE-17’s card', async ({
  page,
}) => {
  await selectEquipment(page, 'PANEL-A')
  await expect(page.locator('[data-view="focus"]')).toHaveCount(0)
  await expect(card(page, BUILDING_A)).toHaveAttribute('data-lit', 'true')
})
