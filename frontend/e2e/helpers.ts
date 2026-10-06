import { expect, type Page } from '@playwright/test'

export const viewport = (page: Page) =>
  page.locator('.react-flow__viewport').getAttribute('style')

/** Waits for the one-time fit so later comparisons start from the settled view. */
export async function fitted(page: Page) {
  await expect(
    page.locator('.react-flow__node-equipment').first(),
  ).toBeVisible()
  await expect
    .poll(() => viewport(page))
    .not.toBe('transform: translate(0px, 0px) scale(1);')
}

/**
 * The card's center is the center of the part of the canvas that is visible:
 * not under an open drawer or the results overlay.
 */
export async function expectCenteredInVisibleArea(page: Page, id: string) {
  await expect
    .poll(async () => {
      const card = await page.getByTestId(`rf__node-${id}`).boundingBox()
      return page.evaluate((c) => {
        const surface = document
          .querySelector('.flow-surface')!
          .getBoundingClientRect()
        let left = 0
        let right = 0
        let bottom = 0
        for (const d of document.querySelectorAll('.studio-drawer')) {
          const r = d.getBoundingClientRect()
          if (d.classList.contains('left'))
            left = Math.max(left, r.right - surface.left)
          else right = Math.max(right, surface.right - r.left)
        }
        for (const o of document.querySelectorAll('.map-results')) {
          const r = o.getBoundingClientRect()
          bottom = Math.max(bottom, surface.bottom - r.top)
        }
        const x = surface.left + (left + (surface.width - right)) / 2
        const y = surface.top + (surface.height - bottom) / 2
        return Math.hypot(c!.x + c!.width / 2 - x, c!.y + c!.height / 2 - y)
      }, card)
    })
    .toBeLessThan(4)
}

export interface Marks {
  /** Every card the map shows, drawn or not. */
  cards: string[]
  routeLinks: string[]
  routeCards: string[]
  highlightLinks: string[]
  highlightCards: string[]
  highlightNeighbors: string[]
  dimmedCards: string[]
  splitPairs: string[]
  nodeBoxes: string[]
  rackBoxes: string[]
  /** The route view is what the map draws. */
  routeView: boolean
}

/**
 * The projection's own route/highlight IDs, written on .flow-surface. Unlike
 * counting `.react-flow__edge.animated`, this does not depend on which cards
 * React Flow has drawn inside the current viewport (a pan hides offscreen ones).
 */
export const marks = (page: Page): Promise<Marks> =>
  page.locator('.flow-surface').evaluate((el) => {
    const list = (name: string) =>
      (el.getAttribute(name) ?? '').split(' ').filter(Boolean)
    return {
      cards: list('data-cards'),
      routeLinks: list('data-route-links'),
      routeCards: list('data-route-cards'),
      highlightLinks: list('data-highlight-links'),
      highlightCards: list('data-highlight-cards'),
      highlightNeighbors: list('data-highlight-neighbors'),
      dimmedCards: list('data-dimmed-cards'),
      splitPairs: list('data-split-pairs'),
      nodeBoxes: list('data-node-boxes'),
      rackBoxes: list('data-rack-boxes'),
      routeView: el.getAttribute('data-route-view') === 'true',
    }
  })

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

export const ROUTE_AGG_03 = ['cable-a01', 'cable-a02', 'cable-a03', 'cable-a04']

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

/** Select a card (which opens the inspector) and show its Ports or Positions tab. */
export async function openPorts(page: Page, card: string) {
  await page.getByTestId(`rf__node-${card.toLowerCase()}`).click()
  await page.getByRole('tab', { name: /^(Ports|Positions)$/ }).click()
}

/** Pin the first position matching the query from the inspector, then close it. */
export async function pinFromInspector(
  page: Page,
  card: string,
  query: string,
) {
  await openPorts(page, card)
  await page.getByLabel('Search endpoints').fill(query)
  await page
    .getByRole('button', { name: /^Pin on map: / })
    .first()
    .click()
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
}
