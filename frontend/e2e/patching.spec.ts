import { expect, test, type Page } from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'
import { getPlan, newPlan, unique } from './plan-api'
import {
  chooseFar,
  farJack,
  madeCount,
  patching,
  toHalf,
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
