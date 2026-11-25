import { expect, test, type Page } from './fixtures'
import { fitted, openEquipmentPage } from './helpers'
import { command, newPlan, unique } from './plan-api'
import { openPatching, patching, useRange } from './patching-helpers'

const SIZES = [
  { width: 1230, height: 760 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]

/** The first jack's side, and whether every jack is in its plate and the plate in its card. */
async function faceMetrics(page: Page) {
  return page.getByRole('region', { name: /face$/ }).evaluate((card) => {
    const plate = card.querySelector<HTMLElement>('.faceplate')!
    const c = card.getBoundingClientRect()
    const p = plate.getBoundingClientRect()
    const inside = (inner: DOMRect, outer: DOMRect) =>
      inner.left >= outer.left - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.bottom <= outer.bottom + 0.5
    const jacks = [
      ...card.querySelectorAll<HTMLElement>('[data-testid="face-endpoint"]'),
    ]
    return {
      jacks: jacks.length,
      jackOutside: jacks.filter((j) => !inside(j.getBoundingClientRect(), p))
        .length,
      plateOutside: !inside(p, c),
      jack: jacks[0].getBoundingClientRect().width,
      fit: plate.getAttribute('data-fit'),
    }
  })
}

test('D50-01 a jack is inside its plate and the plate inside its card at four sizes, and an HDF jack grows with the screen', async ({
  page,
}) => {
  const hdfJack: Record<number, number> = {}
  for (const name of ['HDF-01', 'EDGE-17']) {
    for (const size of SIZES) {
      await page.setViewportSize(size)
      await page.goto('/')
      await fitted(page)
      await openEquipmentPage(page, name)
      await expect(
        page.locator('.faceplate[data-fit]'),
        `${name} is fitted`,
      ).toHaveCount(1)
      const m = await faceMetrics(page)
      expect(m.jacks, `${name} ${size.width}`).toBeGreaterThan(0)
      expect(m.jackOutside, `${name} jacks ${size.width}`).toBe(0)
      expect(m.plateOutside, `${name} plate ${size.width}`).toBe(false)
      if (name === 'HDF-01') hdfJack[size.width] = m.jack
    }
  }
  expect(hdfJack[1920]).toBeGreaterThan(hdfJack[1230])
})

test('D50-02 a 12-row HDF is two bands at 1920×1080, row 12 first, and the arrows keep the logical order across the bands', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const plan = await newPlan(request, unique('Bands'))
  await command(request, plan, {
    type: 'add_hdf',
    hdf: {
      name: 'HDF-TWELVE',
      rackId: 'rack-a03',
      unit: 3,
      height: 3,
      rows: 12,
    },
  })
  await page.goto(`/?plan=${plan}`)
  await fitted(page)
  await openEquipmentPage(page, 'HDF-TWELVE')
  const plate = page.locator('.faceplate[data-fit]')
  await expect(plate.locator('.hdf-grid')).toHaveCount(2)
  const first = plate.locator('.hdf-grid').nth(0)
  const second = plate.locator('.hdf-grid').nth(1)
  await expect(first.locator('.hdf-row').first()).toHaveText('12')
  await expect(second.locator('.hdf-row').first()).toHaveText('6')
  await expect(plate.locator('.plate-meta')).toHaveAttribute(
    'data-meta',
    'front · rows 12–1, left to right',
  )
  const a = (await first.boundingBox())!
  const b = (await second.boundingBox())!
  expect(b.x).toBeGreaterThan(a.x + a.width - 1)
  const jack = (label: string) =>
    plate.locator(`[data-block="${label}"][data-position="1"]`)
  const id = async (label: string) =>
    jack(label).getAttribute('data-endpoint-id')
  await jack('7A').focus()
  // Down goes to the module's second line, then on to row 6 in the other band.
  await page.keyboard.press('ArrowDown')
  await expect(
    plate.locator('[data-block="7A"][data-position="4"]'),
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  expect(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('data-endpoint-id'),
    ),
  ).toBe(await id('6A'))
})

test('D50-03 the patching screen keeps its 32px HDF jacks', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 })
  await openPatching(page, request, {
    equipment: 'hdf-01',
    endpoint: 'hdf-01:sp-2B:1:r',
    mode: 'range',
    rear: true,
  })
  await useRange(page, 6)
  const sizes = await patching(page)
    .locator('.face-cell.hdf-jack')
    .evaluateAll((els) => [
      ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().width))),
    ])
  expect(sizes).toEqual([32])
  await expect(patching(page).locator('.faceplate[data-fit]')).toHaveCount(0)
})
