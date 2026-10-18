import { expect, test, type Page } from '@playwright/test'
import { fitted } from './helpers'

// CM-09. The saved arrangement is shared server state: clear it after each test
// so no position leaks into other specs.
test.describe.configure({ mode: 'serial' })
test.afterEach(async ({ request }) => {
  await request.delete('/api/map-layout')
})

const root = (page: Page) => page.locator('[data-view="overview"]')
const card = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`)
const frame = (page: Page, siteId: string) =>
  page.getByTestId(`rf__node-site:${siteId}`)
const positions = async (page: Page) =>
  Object.fromEntries(
    ((await root(page).getAttribute('data-node-positions')) ?? '')
      .split(' ')
      .filter(Boolean)
      .map((p) => {
        const [id, xy] = p.split(':')
        return [id, xy.split(',').map(Number)]
      }),
  )

async function toOverview(page: Page) {
  await page.goto('/')
  await fitted(page)
  await page
    .getByRole('group', { name: 'Map view' })
    .getByRole('button', { name: 'Overview' })
    .click()
  await expect(root(page)).toBeVisible()
  await expect(root(page)).toHaveAttribute('data-fitted', 'true')
}

// The test server's installed topology is the acceptance example plus an empty
// Annex (one node, one rack, no equipment).
const NODES = [
  'node-building-a',
  'node-north-sub-main',
  'node-main-distribution',
  'node-dr-access',
  'node-dr-distribution',
]

test('CM-09 the overview shows one card per node inside its site frame, and the cable counts', async ({
  page,
}) => {
  await toOverview(page)
  for (const id of NODES) await expect(card(page, id)).toBeVisible()
  // An empty node is still a card, with its count and no role tags.
  const annex = page.locator('[data-node-id]', { hasText: 'Annex Hall' })
  await expect(annex).toContainText('0 equipment')
  await expect(annex.locator('.chip')).toHaveCount(0)
  await expect(page.locator('[data-node-id]')).toHaveCount(6)
  const inside = async (nodeId: string, siteId: string) => {
    const c = (await card(page, nodeId).boundingBox())!
    const f = (await frame(page, siteId).boundingBox())!
    expect(c.x).toBeGreaterThanOrEqual(f.x)
    expect(c.y).toBeGreaterThanOrEqual(f.y)
    expect(c.x + c.width).toBeLessThanOrEqual(f.x + f.width + 1)
    expect(c.y + c.height).toBeLessThanOrEqual(f.y + f.height + 1)
  }
  for (const id of NODES.slice(0, 3)) await inside(id, 'site-main-campus')
  for (const id of NODES.slice(3)) await inside(id, 'site-dr')
  await expect(frame(page, 'site-main-campus')).toContainText('Main Campus')
  await expect(frame(page, 'site-dr')).toContainText('DR Site')

  // Counted from docs/acceptance-example.md: A02, A06, A10 between Building A and North Sub-main.
  const line = (a: string, b: string) =>
    page.locator(`[data-pair="${[a, b].sort().join('|')}"]`)
  await expect(line('node-building-a', 'node-north-sub-main')).toHaveText('3')
  // A03, A07, A11 and B03.
  await expect(
    line('node-north-sub-main', 'node-main-distribution'),
  ).toHaveText('4')
  // B02 crosses to the DR site; B04 comes back to Main Distribution.
  await expect(line('node-north-sub-main', 'node-dr-access')).toHaveText('1')
  await expect(
    line('node-main-distribution', 'node-dr-distribution'),
  ).toHaveText('1')
  await expect(page.locator('[data-pair]')).toHaveCount(4)
  await expect(card(page, 'node-main-distribution')).toContainText(
    '5 equipment',
  )
  await expect(card(page, 'node-main-distribution')).toContainText('AGG')
  await expect(card(page, 'node-main-distribution')).toContainText('BB')
})

test('CM-09 a card opens its equipment by rack, and a row opens the inspector', async ({
  page,
}) => {
  await toOverview(page)
  const core = card(page, 'node-main-distribution')
  const head = core.locator('.overview-card-head')
  await core.click()
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  await expect(core).toContainText('Rack Core 01')
  await expect(core).toContainText('Rack Core 03')
  await core.getByRole('button', { name: /AGG-08/ }).click()
  await expect(page.locator('.inspector-header h2')).toHaveText('AGG-08')
  await expect(core.getByRole('button', { name: /AGG-08/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
  // The card stays open; clicking it again closes it.
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await head.focus()
  await page.keyboard.press('Enter')
  await expect(head).toHaveAttribute('aria-expanded', 'false')
})

test('CM-09 choosing Network B dims a Network-A-only node and keeps it visible', async ({
  page,
}) => {
  await toOverview(page)
  await page
    .getByRole('combobox', { name: 'Show network' })
    .selectOption({ label: 'Network B' })
  await expect(card(page, 'node-building-a')).toHaveClass(/dimmed/)
  await expect(card(page, 'node-building-a')).toBeVisible()
  await expect(card(page, 'node-north-sub-main')).not.toHaveClass(/dimmed/)
  await expect(card(page, 'node-dr-access')).not.toHaveClass(/dimmed/)
  await expect(page.locator('[data-node-id]')).toHaveCount(6)
})

test('CM-09 a dragged card stays where it was dropped after a reload, and Reset arrangement puts it back', async ({
  page,
}) => {
  const puts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/api/map-layout/nodes/'))
      puts.push(r.url())
  })
  await toOverview(page)
  const before = await positions(page)
  const c = card(page, 'node-north-sub-main')
  const box = (await c.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 14)
  await page.mouse.down()
  await page.mouse.move(box.x + 30 + 160, box.y + 14 + 110, { steps: 15 })
  expect(puts).toHaveLength(0) // nothing is sent while dragging
  await page.mouse.up()
  await expect.poll(() => puts.length).toBe(1)
  expect(puts[0]).toContain('/api/map-layout/nodes/node-north-sub-main')
  const moved = await positions(page)
  expect(moved['node-north-sub-main']).not.toEqual(
    before['node-north-sub-main'],
  )
  for (const id of Object.keys(before).filter(
    (n) => n !== 'node-north-sub-main',
  ))
    expect(moved[id]).toEqual(before[id])

  await page.reload()
  await fitted(page)
  await page
    .getByRole('group', { name: 'Map view' })
    .getByRole('button', { name: 'Overview' })
    .click()
  await expect(root(page)).toHaveAttribute('data-fitted', 'true')
  expect(await positions(page)).toEqual(moved)

  await page.getByRole('button', { name: 'Reset arrangement' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect.poll(() => positions(page)).toEqual(before)
  const saved = await (await page.request.get('/api/map-layout')).json()
  expect(saved.positions).toEqual([])
})

const scale = async (page: Page) =>
  Number(
    (await page.locator('.react-flow__viewport').getAttribute('style'))!.match(
      /scale\(([\d.]+)\)/,
    )![1],
  )

/** Every count pill is visible and nothing covers its centre. */
async function expectPillsUncovered(page: Page) {
  const covered = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-pair]')]
        .filter((pill) => {
          const r = pill.getBoundingClientRect()
          const top = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          )
          return !(top && (top === pill || pill.contains(top)))
        })
        .map((pill) => pill.dataset.pair),
    )
  await expect.poll(covered).toEqual([])
}

const FULLY_COVERED = 'node-building-a|node-north-sub-main'

/**
 * Which cards each pill's box meets, as "pair on node". A pill may touch only
 * its own two end cards, and only when the whole line is under cards (the plain
 * midpoint fallback); nothing else.
 */
async function pillHits(page: Page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-node-id]')]
    return [...document.querySelectorAll<HTMLElement>('[data-pair]')].flatMap(
      (pill) => {
        const p = pill.getBoundingClientRect()
        return cards
          .filter((c) => {
            const r = c.getBoundingClientRect()
            return (
              p.left < r.right &&
              r.left < p.right &&
              p.top < r.bottom &&
              r.top < p.bottom
            )
          })
          .map((c) => ({
            pair: pill.dataset.pair!,
            node: c.dataset.nodeId!,
            own: pill.dataset.pair!.split('|').includes(c.dataset.nodeId!),
          }))
      },
    )
  })
}

/** No pill touches a card that is not one of its ends; `fallbacks` are the pairs allowed to touch their own ends. */
async function expectPillsClearOfCards(page: Page, fallbacks: string[]) {
  const hits = await pillHits(page)
  expect(hits.filter((h) => !h.own)).toEqual([])
  expect([...new Set(hits.map((h) => h.pair))].sort()).toEqual(
    [...fallbacks].sort().filter((f) => hits.some((h) => h.pair === f)),
  )
  expect(hits.every((h) => fallbacks.includes(h.pair))).toBe(true)
}

test('CM-09 fix: every cable count is above the cards, also under a card that is dropped on it', async ({
  page,
}) => {
  await toOverview(page)
  await expectPillsUncovered(page)
  // The cards of Building A and North Sub-main are about 20 px apart: nothing on
  // their line is clear of both, so that one pill takes the plain midpoint.
  await expectPillsClearOfCards(page, [FULLY_COVERED])
  // Drop North Sub-main on the DR Distribution - Main Distribution line, 40% of
  // the way from DR Distribution (the line runs between the two card centres).
  const centre = async (id: string) => {
    const b = (await card(page, id).boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const [far, near] = [
    await centre('node-dr-distribution'),
    await centre('node-main-distribution'),
  ]
  // 40 px off the line's axis: still on the line (a card is 96 px tall), but
  // not collinear with it, so the card's own line to Main Distribution differs.
  const pill = {
    x: far.x + (near.x - far.x) * 0.4,
    y: far.y + (near.y - far.y) * 0.4 + 40,
    width: 0,
    height: 0,
  }
  const dragged = card(page, 'node-north-sub-main')
  const box = (await dragged.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 14)
  await page.mouse.down()
  await page.mouse.move(
    pill.x - box.width / 2 + 20,
    pill.y - box.height / 2 + 14,
    { steps: 15 },
  )
  await page.mouse.up()
  await expect
    .poll(async () => {
      const c = (await dragged.boundingBox())!
      return (
        c.x < pill.x + pill.width / 2 &&
        c.x + c.width > pill.x + pill.width / 2 &&
        c.y < pill.y + pill.height / 2 &&
        c.y + c.height > pill.y + pill.height / 2
      )
    })
    .toBe(true)
  await expectPillsUncovered(page)
  // The pill of the line the card was dropped on is clear of every card.
  await expect
    .poll(async () => {
      const hits = await pillHits(page)
      return [
        hits.filter(
          (h) => h.pair === 'node-dr-distribution|node-main-distribution',
        ).length,
        hits.filter((h) => !h.own).length,
      ]
    })
    .toEqual([0, 0])
})

test('CM-09 fix: a closed card is 96 px tall and its chips sit right under the count', async ({
  page,
}) => {
  await toOverview(page)
  const z = await scale(page)
  for (const id of NODES) {
    const box = (await card(page, id).boundingBox())!
    expect(box.height / z).toBeCloseTo(96, 0)
  }
  const core = card(page, 'node-main-distribution')
  const count = (await core.locator('.overview-card-count').boundingBox())!
  const chip = (await core.locator('.chip').first().boundingBox())!
  expect((chip.y - (count.y + count.height)) / z).toBeLessThan(12)
})

test('CM-09 fix: an opened card is panned fully into view, the zoom unchanged', async ({
  page,
}) => {
  await toOverview(page)
  const z = await scale(page)
  const surface = (await root(page).boundingBox())!
  await card(page, 'node-main-distribution')
    .locator('.overview-card-head')
    .click()
  const core = card(page, 'node-main-distribution')
  await expect(core.locator('.overview-card-list')).toBeVisible()
  await expect
    .poll(async () => {
      const c = (await core.boundingBox())!
      return (
        c.x >= surface.x - 1 &&
        c.x + c.width <= surface.x + surface.width + 1 &&
        c.y + c.height <= surface.y + surface.height + 1
      )
    })
    .toBe(true)
  expect(await scale(page)).toBe(z)
})

test('CM-09 fix: the open list is at most 320 px tall and scrolls inside, without moving the card', async ({
  page,
}) => {
  await toOverview(page)
  await card(page, 'node-main-distribution')
    .locator('.overview-card-head')
    .click()
  const list = card(page, 'node-main-distribution').locator(
    '.overview-card-list',
  )
  await expect(list).toBeVisible()
  await expect(list).toHaveClass(/nowheel/)
  await expect(list).toHaveClass(/nodrag/)
  expect(await list.evaluate((el) => getComputedStyle(el).maxHeight)).toBe(
    '320px',
  )
  expect(await list.evaluate((el) => getComputedStyle(el).overflowY)).toBe(
    'auto',
  )
  // With the cap forced small the list scrolls instead of growing.
  await list.evaluate((el) => (el.style.maxHeight = '60px'))
  const { client, scroll } = await list.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }))
  expect(client).toBeLessThanOrEqual(60)
  expect(scroll).toBeGreaterThan(client)
})

test('CM-09 fix: the note is clear of the tool rail, and of the left drawer when it is open', async ({
  page,
}) => {
  await toOverview(page)
  const note = page.locator('.overview-note')
  const rail = (await page.locator('.tool-rail').boundingBox())!
  expect((await note.boundingBox())!.x).toBeGreaterThanOrEqual(
    rail.x + rail.width,
  )
  await page.getByRole('button', { name: 'Open explorer' }).click()
  const drawer = page.locator('.studio-drawer.left')
  await expect(drawer).toBeVisible()
  const d = (await drawer.boundingBox())!
  await expect
    .poll(async () => (await note.boundingBox())!.x)
    .toBeGreaterThanOrEqual(d.x + d.width)
})
