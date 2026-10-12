import { expect, type Locator, type Page } from '@playwright/test'

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

/** The far end by Site › Node › Rack › Equipment, as a user picks it. */
export async function chooseFar(
  page: Page,
  where: { site: string; node: string; rack: string; equipment: string },
  side?: 'Front' | 'Rear',
) {
  const picker = toHalf(page).getByRole('group', { name: 'Far end' })
  await choose(picker.getByLabel('Site'), where.site)
  await choose(picker.getByLabel('Node'), where.node)
  await choose(picker.getByLabel('Rack'), where.rack)
  await choose(picker.getByLabel('Equipment'), `${where.equipment} ·`)
  await expect(toHalf(page).locator('.patching-col-head strong')).toHaveText(
    where.equipment,
  )
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
    `MADE HERE (${n})`,
  )
