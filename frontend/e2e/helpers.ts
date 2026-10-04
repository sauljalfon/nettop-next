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
