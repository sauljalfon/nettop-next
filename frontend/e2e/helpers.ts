import { expect, type Page } from '@playwright/test'

/** Building A's node card under AGG-03 + AGG-08 in the acceptance fixture's Network A. */
export const BUILDING_A = 'agg-03+agg-08|node-building-a'

/**
 * Selects EDGE-17 from the hierarchy: Building A's drawer, the switch, Inspector.
 * This only selects (the inspector opens).
 */
export async function selectEdge17(page: Page) {
  await page.locator(`[data-card-key="${BUILDING_A}"]`).click()
  const drawer = page.getByTestId('hierarchy-drawer')
  await drawer.locator('[data-switch-id="edge-17"]').click()
  await drawer.getByRole('button', { name: 'Inspector' }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('EDGE-17')
}

export const viewport = (page: Page) =>
  page.locator('.react-flow__viewport').getAttribute('style')

/** Waits for the hierarchy to be drawn and fitted. */
export async function fitted(page: Page) {
  const hierarchy = page.locator('[data-view="hierarchy"]')
  await expect(hierarchy).toBeVisible()
  await expect(hierarchy).toHaveAttribute('data-fitted', 'true')
}

/** The hierarchy as the user sees it: where the cards are, and what the selected route lights. */
export const hierarchyState = (page: Page) =>
  page.locator('[data-view="hierarchy"]').evaluate((el) => ({
    positions: el.getAttribute('data-card-positions'),
    cards: [...el.querySelectorAll('[data-card-key][data-on-route="true"]')]
      .map((n) => n.getAttribute('data-card-key'))
      .sort(),
    lines: [...el.querySelectorAll('[data-line][data-on-route="true"]')]
      .map((n) => n.getAttribute('data-line'))
      .sort(),
  }))

/** Where each card is, by its key, from the hierarchy's `data-card-positions`. */
export async function cardPositions(page: Page) {
  const text =
    (await page
      .locator('[data-view="hierarchy"]')
      .getAttribute('data-card-positions')) ?? ''
  return Object.fromEntries(
    text
      .split(' ')
      .filter(Boolean)
      .map((p) => {
        const at = p.lastIndexOf(':')
        return [p.slice(0, at), p.slice(at + 1)]
      }),
  )
}

/**
 * Chooses equipment by its exact name through Explore: search, Enter. On the
 * hierarchy this selects it on the tree and opens the inspector.
 */
export async function selectEquipment(page: Page, name: string) {
  await openExplore(page)
  const search = page.getByLabel('Find equipment')
  await search.fill(name)
  await search.press('Enter')
  await expect(page.locator('.inspector-header h2')).toHaveText(name)
}

/**
 * The equipment's page in Physical: the Physical view, Explore's search, Enter (in Physical it
 * opens the page, with its ports and ⋯ menu; the inspector card does not hold them any more).
 */
export async function openEquipmentPage(page: Page, name: string) {
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  await openExplore(page)
  const search = page.getByLabel('Find equipment')
  await search.fill(name)
  await search.press('Enter')
  await expect(page.getByTestId('equipment-bar')).toContainText(name)
}

/** Chooses an item of the equipment page's ⋯ menu. */
export async function chooseMore(page: Page, item: string) {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Find AGG / BB from a switch: selects it through Explore, then uses the inspector's button. The Trace page opens, on All routes. */
export async function findAggBb(page: Page, name = 'EDGE-17') {
  await selectEquipment(page, name)
  await page
    .getByRole('button', { name: `Find AGG / BB from ${name}`, exact: true })
    .click()
  await expect(page.getByTestId('trace-page')).toBeVisible()
}

/** The Trace page's route results (not the mismatches). */
export const traceRoutes = (page: Page) =>
  page
    .getByTestId('trace-list')
    .locator('[data-testid="trace-item"][data-kind="route"]')

/** Opens the dock on the Inspector, unless it is already open (← Back brings the dock back as it was). */
export async function openInspector(page: Page) {
  if (!(await page.locator('.dock:not([hidden])').count()))
    await page.getByRole('button', { name: 'Open inspector' }).click()
  await expect(page.locator('.dock:not([hidden])')).toBeVisible()
}

/** The Trace page's One route view (the walk is shown there; All routes stacks the drawings). */
export async function oneRoute(page: Page) {
  await page
    .getByTestId('trace-page')
    .getByRole('button', { name: 'One route', exact: true })
    .click()
}

/** ← Back on the Trace page: the view it came from, with the route chip. */
export async function leaveTrace(page: Page) {
  await page
    .getByTestId('trace-page')
    .getByRole('button', { name: '← Back', exact: true })
    .click()
  await expect(page.getByTestId('trace-page')).toHaveCount(0)
}

/**
 * Every given card is inside the part of the canvas that is visible: not under
 * an open dock or the tool rail.
 */
export async function expectInsideVisibleArea(page: Page, ids: string[]) {
  await expect
    .poll(async () => {
      const boxes = await Promise.all(
        ids.map((id) => page.getByTestId(`rf__node-${id}`).boundingBox()),
      )
      return page.evaluate((cards) => {
        const surface = document
          .querySelector('.flow-surface')!
          .getBoundingClientRect()
        let left = 0
        let right = 0
        let bottom = 0
        for (const d of document.querySelectorAll('.dock:not([hidden])')) {
          const r = d.getBoundingClientRect()
          if (d.classList.contains('left')) left = Math.max(left, r.right)
          else right = Math.max(right, surface.right - r.left)
        }
        const rail = document
          .querySelector('.tool-rail')
          ?.getBoundingClientRect()
        if (rail) left = Math.max(left, rail.right)
        return cards.every(
          (c) =>
            c !== null &&
            c.x >= Math.max(surface.left, left) - 1 &&
            c.y >= surface.top - 1 &&
            c.x + c.width <= surface.right - right + 1 &&
            c.y + c.height <= surface.bottom - bottom + 1,
        )
      }, boxes)
    })
    .toBe(true)
}

/** The viewport once two reads in a row agree, so an animation has finished. */
export async function settledViewport(page: Page) {
  let previous = ''
  await expect
    .poll(async () => {
      const current = (await viewport(page)) ?? ''
      const same = current === previous
      previous = current
      return same
    })
    .toBe(true)
  return previous
}

/** Every drawn card's transform, keyed by node ID. */
export const layout = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node')].map((n) => [
        n.getAttribute('data-id'),
        (n as HTMLElement).style.transform,
      ]),
    ),
  )

export async function openExplore(page: Page) {
  if (
    (await page
      .getByRole('complementary', { name: 'Explore infrastructure' })
      .count()) === 0
  )
    await page
      .getByRole('button', { name: 'Open explorer', exact: true })
      .click()
}

/** Click a site or node name in the Explore drawer: it opens that place in Physical. */
export async function openPlaceFromExplore(page: Page, name: string) {
  await openExplore(page)
  await page.getByRole('button', { name: `Open ${name} in Physical` }).click()
}

/**
 * Opens a rack in Physical from wherever the explorer is: the Physical switch,
 * the Sites breadcrumb, then site, node and rack. Names are the displayed ones.
 */
export async function openRackInPhysical(
  page: Page,
  site: string,
  node: string,
  rack: string,
) {
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const sites = page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Sites', exact: true })
  if (await sites.count()) await sites.click()
  await page.getByRole('button', { name: `Open ${site}`, exact: true }).click()
  await page
    .getByRole('button', { name: `Open racks of ${node}`, exact: true })
    .click()
  // The corner of the mini rack: its centre can lie on an equipment block, which opens that equipment instead.
  await page
    .getByRole('button', { name: `Open ${rack}`, exact: true })
    .click({ position: { x: 2, y: 2 } })
}

/** Shows the Trace page: opens it from the route chip when it is closed. */
export async function expandResults(page: Page) {
  const tp = page.getByTestId('trace-page')
  if (!(await tp.count()))
    await page.getByTestId('route-chip').getByRole('button').first().click()
  await expect(tp).toBeVisible()
}

/**
 * What the Path bar draws next to the selected plate. `left` is the cable and
 * the equipment on the selected jack's side (its far end); `right` is the
 * selected plate itself (both jacks of a panel or HDF position), then the
 * cable and equipment on the other side. `places` are the plates' places
 * (their tooltip, site first).
 */
export const pathNear = (page: Page, side: 'left' | 'right') =>
  page.getByTestId('path-line').evaluate((line, which) => {
    const cells = [...line.children]
    const at = cells.findIndex((c) => c.querySelector('[data-here="true"]'))
    const picked =
      which === 'left'
        ? cells.slice(Math.max(0, at - 2), at)
        : cells.slice(at, at + 3)
    return {
      text: picked.map((c) => c.textContent ?? '').join(' | '),
      places: picked
        .map(
          (c) =>
            c
              .querySelector('[data-testid="path-plate"]')
              ?.getAttribute('title') ?? '',
        )
        .filter(Boolean),
    }
  }, side)

/** The Path bar shows all of these next to the selected plate, on that side. */
export async function expectNear(
  page: Page,
  side: 'left' | 'right',
  ...parts: string[]
) {
  for (const part of parts)
    await expect
      .poll(async () => (await pathNear(page, side)).text, {
        message: `${side} of the selected plate`,
      })
      .toContain(part)
}

/** The Path bar's plate next to the selected one has this place (site › node › rack). */
export async function expectNearPlace(
  page: Page,
  side: 'left' | 'right',
  place: string,
) {
  await expect
    .poll(async () => (await pathNear(page, side)).places)
    .toContain(place)
}

/** The details tab (Node) in the dock: a selection made from Explore or Show on map leaves the dock on its tab. */
export async function showNodeDetails(page: Page) {
  await page.getByRole('tab', { name: 'Node' }).click()
}
