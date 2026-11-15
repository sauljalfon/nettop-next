import { expect, test, type Page } from './fixtures'
import { fitted, openRackInPhysical } from './helpers'
import { getPlan, newPlan, planWith32RowHdf, unique } from './plan-api'
import {
  chooseFar,
  farJack,
  madeCount,
  openPatching,
  pairs,
  patching,
  toHalf,
  useRange,
} from './patching-helpers'

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/pt-${name}.png` })
const popover = (page: Page) => page.getByTestId('connect-popover')
const cablesOf = async (request: Parameters<typeof getPlan>[0], id: string) =>
  ((await getPlan(request, id)).links as { a: string; b: string }[])
    .map((l) => [l.a, l.b].sort().join(' ↔ '))
    .sort()

async function openInRackA03(page: Page, planId: string, equipment: string) {
  await page.goto(`/?plan=${planId}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator(`.rack-block[data-equipment-id="${equipment}"]`).click()
}

test('PT-06 one at a time: a click on a far jack makes the cable, then Enter makes the next ones; Undo last takes one back', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Patch'))
  await openInRackA03(page, id, 'edge-17')

  // A free jack opens the popover; Choose far end… opens the screen on PANEL-A, the panel in the same node.
  await page.locator('[data-endpoint-id="edge-17:p4"]').click()
  await expect(popover(page)).toBeVisible()
  await popover(page).getByRole('button', { name: 'Choose far end…' }).click()
  await expect(patching(page)).toBeVisible()
  await expect(toHalf(page).locator('.patching-col-head strong')).toHaveText(
    'PANEL-A',
  )
  await shot(page, 'open')

  await farJack(page, 'panel-a:4:f').click()
  await madeCount(page, 1)
  // Both sides moved on: the next far jack is ringed, and Enter makes it.
  await expect(farJack(page, 'panel-a:5:f')).toHaveAttribute(
    'data-tone',
    'next',
  )
  await expect(patching(page).getByTestId('patching-next')).toContainText(
    'EDGE-17',
  )
  await page.keyboard.press('Enter')
  await madeCount(page, 2)
  await page.keyboard.press('Enter')
  await madeCount(page, 3)
  expect(await cablesOf(request, id)).toEqual(
    [4, 5, 6].map((n) => `edge-17:p${n} ↔ panel-a:${n}:f`).sort(),
  )
  await shot(page, 'three-made')

  await patching(page).getByRole('button', { name: 'Undo last' }).click()
  await madeCount(page, 2)
  await expect
    .poll(() => cablesOf(request, id))
    .toEqual([4, 5].map((n) => `edge-17:p${n} ↔ panel-a:${n}:f`).sort())
  await expect(farJack(page, 'panel-a:6:f')).toHaveAttribute(
    'data-tone',
    'next',
  )

  await patching(page).getByRole('button', { name: 'Done' }).click()
  await expect(patching(page)).toHaveCount(0)
})

test('PT-07 rear to rear between two panels: the far side starts on Rear; the popover then offers it as a recent target', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, unique('Patch'))
  await openInRackA03(page, id, 'panel-a')
  await page
    .getByRole('group', { name: 'Side' })
    .getByRole('button', { name: 'Rear' })
    .click()
  await page.locator('[data-endpoint-id="panel-a:4:r"]').click()
  await popover(page).getByRole('button', { name: 'Choose far end…' }).click()
  await chooseFar(page, {
    site: 'Main Campus',
    node: 'North Sub-main',
    rack: 'Rack SM01',
    equipment: 'HDF-01',
  })
  // A rear jack starts the far panel on its rear.
  await expect(
    toHalf(page)
      .getByRole('group', { name: 'Side' })
      .getByRole('button', { name: 'Rear' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await farJack(page, 'hdf-01:sp-1A:1:r').click()
  await madeCount(page, 1)
  expect(await cablesOf(request, id)).toEqual([
    'hdf-01:sp-1A:1:r ↔ panel-a:4:r',
  ])
  await patching(page).getByRole('button', { name: 'Done' }).click()

  // The next free rear jack: the popover offers HDF-01 · Rear in one click.
  await page.locator('[data-endpoint-id="panel-a:5:r"]').click()
  await popover(page).getByRole('button', { name: 'HDF-01 · Rear' }).click()
  await expect(patching(page)).toBeVisible()
  // 1A/1 rear is now cabled and 1A/2 rear carries cable-a06: the next free one is 1A/3.
  await expect(farJack(page, 'hdf-01:sp-1A:3:r')).toHaveAttribute(
    'data-tone',
    'next',
  )
  await shot(page, 'recent')
  await page.keyboard.press('Escape')
  await expect(patching(page)).toHaveCount(0)
})

/** HDF-01 rear 2B/1 to HDF-02 rear 1C/1, a range of 6 previewed; the screen is open. */
async function hdfToHdf(page: Page, request: Parameters<typeof newPlan>[0]) {
  const { id } = await openPatching(page, request, {
    equipment: 'hdf-01',
    endpoint: 'hdf-01:sp-2B:1:r',
    mode: 'range',
    rear: true,
  })
  await useRange(page, 6)
  await chooseFar(
    page,
    {
      site: 'Main Campus',
      node: 'Main Distribution',
      rack: 'Rack Core 01',
      equipment: 'HDF-02',
    },
    'Rear',
  )
  await farJack(page, 'hdf-02:sp-1C:1:r').click()
  await expect(pairs(page)).toHaveCount(6)
  return id
}

test('PT-01 patching fills the window and names the plan', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 })
  const id = await hdfToHdf(page, request)
  const box = (await patching(page).boundingBox())!
  for (const [got, want] of [
    [box.x, 0],
    [box.y, 0],
    [box.width, 1536],
    [box.height, 864],
  ])
    expect(Math.abs(got - want)).toBeLessThanOrEqual(1)
  const text = await patching(page).innerText()
  expect(text).toContain('in plan')
  expect(text).toContain((await getPlan(request, id)).name)
  await expect(
    patching(page).getByRole('complementary', { name: 'Pairs and made here' }),
  ).toBeVisible()
})

for (const size of [
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
]) {
  test(`PT-02 Connect, Undo last and Done are on the bottom bar and reachable at ${size.width}×${size.height}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(size)
    await hdfToHdf(page, request)
    const ys: number[] = []
    for (const name of [/^Connect 6$/, /^Undo last$/, /^Done$/]) {
      const button = patching(page).getByRole('button', { name })
      await expect(button).toBeVisible()
      const on = await button.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        )
        return !!top && el.contains(top)
      })
      expect(on, `${name} is covered`).toBe(true)
      const r = (await button.boundingBox())!
      ys.push(r.y + r.height / 2)
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2)
  })
}

test('PT-03 each face scrolls in its own pane and the page does not', async ({
  page,
  request,
}) => {
  // HDF-01 is too short to overflow a pane: the From side is the 32-row HDF-BIG.
  await page.setViewportSize({ width: 1536, height: 864 })
  const id = await planWith32RowHdf(request)
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'North Sub-main', 'Rack SM01')
  await page
    .locator('.rack-block[data-kind="hdf"]', { hasText: 'HDF-BIG' })
    .click()
  await page.locator('.face-cell.hdf-jack:not(:disabled)').first().click()
  await page.getByRole('button', { name: 'Connect a range…' }).click()
  await expect(patching(page)).toBeVisible()
  const metrics = await patching(page)
    .getByRole('region', { name: 'From' })
    .evaluate((pane) => {
      const body = [...pane.querySelectorAll<HTMLElement>('*')].find(
        (e) =>
          getComputedStyle(e).overflowY === 'auto' &&
          e.querySelector('.hdf-scroll'),
      )
      const hdf = pane.querySelector<HTMLElement>('.hdf-scroll')!
      const root = pane.closest<HTMLElement>('[data-testid="patching"]')!
      return {
        hasBody: !!body,
        body: body ? body.scrollHeight > body.clientHeight + 1 : false,
        hdf: hdf.scrollHeight > hdf.clientHeight + 1,
        root: root.scrollHeight > root.clientHeight + 1,
        page: document.documentElement.scrollHeight > window.innerHeight + 1,
      }
    })
  expect(metrics).toEqual({
    hasBody: true,
    body: true,
    hdf: false,
    root: false,
    page: false,
  })
})
