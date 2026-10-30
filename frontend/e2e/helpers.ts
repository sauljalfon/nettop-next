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

export interface Marks {
  /** The route view is what the map draws. */
  routeView: boolean
}

/** What the map says about itself, written on .flow-surface (every view has it). */
export const marks = (page: Page): Promise<Marks> =>
  page.locator('.flow-surface').evaluate((el) => ({
    routeView: el.getAttribute('data-route-view') === 'true',
  }))

/** Waits until the given marks hold; the others are not looked at. */
export async function expectMarks(page: Page, expected: Partial<Marks>) {
  await expect
    .poll(async () => {
      const all = await marks(page)
      return Object.fromEntries(
        Object.keys(expected).map((k) => [k, all[k as keyof Marks]]),
      )
    })
    .toEqual(expected)
}

/** Chooses an item in a trace picker (Start or Destination) by searching and clicking a match. */
export async function pick(
  page: Page,
  name: 'Start' | 'Destination',
  query: string,
  option?: string | RegExp,
) {
  await page.getByRole('combobox', { name, exact: true }).fill(query)
  const options = page
    .getByRole('listbox', { name: `${name} matches` })
    .getByRole('option')
  await (option ? options.filter({ hasText: option }) : options).first().click()
}

/**
 * Every given card is inside the part of the canvas that is visible: not under
 * an open drawer or the results overlay.
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
        for (const d of document.querySelectorAll('.studio-drawer')) {
          const r = d.getBoundingClientRect()
          if (d.classList.contains('left')) left = Math.max(left, r.right)
          else right = Math.max(right, surface.right - r.left)
        }
        for (const o of document.querySelectorAll('.map-results'))
          bottom = Math.max(
            bottom,
            surface.bottom - o.getBoundingClientRect().top,
          )
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
  if ((await page.locator('.studio-drawer.left').count()) === 0)
    await page
      .getByRole('button', { name: 'Open explorer', exact: true })
      .click()
}

/** Click a site or node name in the Explore drawer. */
export async function highlightLocation(page: Page, name: string) {
  await openExplore(page)
  await page
    .getByRole('button', { name: `Highlight ${name} on the map` })
    .click()
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

/** In Physical the results panel opens as one line; open it. Does nothing when it is already open. */
export async function expandResults(page: Page) {
  const panel = page.getByLabel('Map trace results')
  await expect(panel).toBeVisible()
  // A save toast sits over the bottom of the page for a few seconds; let it go.
  await expect(page.locator('.save-toast')).toHaveCount(0, { timeout: 10_000 })
  const expand = panel.getByRole('button', { name: 'Expand results' })
  if (await expand.count()) await expand.click()
}
