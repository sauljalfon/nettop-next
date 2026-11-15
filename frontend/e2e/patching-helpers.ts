import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test'
import { fitted, openRackInPhysical } from './helpers'
import { addSwitch, newPlan, unique } from './plan-api'

/** The patching screen and its two halves. */
export const patching = (page: Page) => page.getByTestId('patching')
export const fromHalf = (page: Page) =>
  patching(page).getByRole('region', { name: 'From' })
export const toHalf = (page: Page) =>
  patching(page).getByRole('region', { name: 'To' })
export const pairs = (page: Page) =>
  patching(page).getByTestId('range-pairs').locator('li')
export const farJack = (page: Page, endpointId: string) =>
  toHalf(page).locator(`[data-endpoint-id="${endpointId}"]`)
export const nearJack = (page: Page, endpointId: string) =>
  fromHalf(page).locator(`[data-endpoint-id="${endpointId}"]`)

/** Chooses the option whose text starts with `text` (equipment options end with "· N free"). */
async function choose(select: Locator, text: string) {
  const value = await select
    .locator('option')
    .filter({ hasText: text })
    .first()
    .getAttribute('value')
  expect(value, `no option "${text}"`).toBeTruthy()
  await select.selectOption(value!)
}

/** A rack by Site › Node › Rack in the picker group named `group`, as a user picks it. */
export async function chooseRack(
  scope: Locator | Page,
  group: string,
  where: { site: string; node: string; rack: string },
) {
  const picker = scope.getByRole('group', { name: group, exact: true })
  await choose(picker.getByLabel('Site', { exact: true }), where.site)
  await choose(picker.getByLabel('Node', { exact: true }), where.node)
  await choose(picker.getByLabel('Rack', { exact: true }), `${where.rack} ·`)
}

/** The far end by Site › Node › Rack › Equipment, as a user picks it. */
export async function chooseFar(
  page: Page,
  where: { site: string; node: string; rack: string; equipment: string },
  side?: 'Front' | 'Rear',
) {
  const picker = toHalf(page).getByRole('group', { name: 'Far end' })
  if (!(await picker.isVisible()))
    await toHalf(page).getByRole('button', { name: 'Change far end' }).click()
  await choose(picker.getByLabel('Site'), where.site)
  await choose(picker.getByLabel('Node'), where.node)
  await choose(picker.getByLabel('Rack'), where.rack)
  await choose(picker.getByLabel('Equipment'), `${where.equipment} ·`)
  await expect(
    toHalf(page).getByRole('button', { name: 'Change far end' }),
  ).toContainText(where.equipment)
  if (side)
    await toHalf(page)
      .getByRole('group', { name: 'Side' })
      .getByRole('button', { name: side })
      .click()
}

export async function useRange(page: Page, count: number) {
  await patching(page)
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: 'Range' })
    .click()
  await patching(page).getByLabel('Count').fill(String(count))
}

export const madeCount = (page: Page, n: number) =>
  expect(patching(page).getByTestId('patching-made')).toContainText(
    `Made here (${n})`,
  )

/** Where each piece of equipment the specs open the screen from lives. */
const PLACES = {
  'EDGE-19': ['Main Campus', 'Building A', 'Rack A03'],
  'edge-17': ['Main Campus', 'Building A', 'Rack A03'],
  'panel-a': ['Main Campus', 'Building A', 'Rack A03'],
  'hdf-01': ['Main Campus', 'North Sub-main', 'Rack SM01'],
  'hdf-02': ['Main Campus', 'Main Distribution', 'Rack Core 01'],
} as const

/**
 * A fresh draft with the equipment opened in Physical, a jack chosen and the
 * patching screen opened from it: "Connect a range…" in range mode; in one at
 * a time "Connect…" (and "Choose far end…" in the popover a switch jack opens).
 * `equipment` is an installed id, or "EDGE-19" (added to the draft with 24
 * ports; an `endpoint` of "1" then means its port 1). `rear` opens the rear of
 * a panel or HDF first.
 */
export async function openPatching(
  page: Page,
  request: APIRequestContext,
  where: {
    equipment: keyof typeof PLACES
    endpoint: string
    mode: 'one' | 'range'
    rear?: boolean
  },
) {
  const id = await newPlan(request, unique('Range'))
  let equipmentId: string = where.equipment
  let endpoint = where.endpoint
  if (where.equipment === 'EDGE-19') {
    equipmentId = await addSwitch(request, id, 'rack-a03', 'EDGE-19', 3, 24)
    endpoint = `${equipmentId}:p${endpoint}`
  }
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  const [site, node, rack] = PLACES[where.equipment]
  await openRackInPhysical(page, site, node, rack)
  await page.locator(`.rack-block[data-equipment-id="${equipmentId}"]`).click()
  if (where.rear)
    await page.getByRole('button', { name: 'Rear', exact: true }).click()
  await page.locator(`[data-endpoint-id="${endpoint}"]`).click()
  await expect(page.locator('.physical-explorer')).toHaveAttribute(
    'data-selected-endpoint',
    endpoint,
  )
  if (where.mode === 'range') {
    await page.getByRole('button', { name: 'Connect a range…' }).click()
  } else {
    const popover = page.getByTestId('connect-popover')
    await page.getByRole('button', { name: 'Connect…' }).click()
    if (await popover.isVisible())
      await popover.getByRole('button', { name: 'Choose far end…' }).click()
  }
  await expect(patching(page)).toBeVisible()
  return { id, equipmentId }
}
