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
