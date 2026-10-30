import { expect, test, type Page } from '@playwright/test'
import { fitted, settledViewport } from './helpers'

// HI-13. A direct fix while the hierarchy is open: the drawer stays on the same
// card, the new name is drawn isolated and cut with an ellipsis, nothing moves.
// A direct fix keeps the topology revision, so this spec does not make drafts
// stale, but it renames shared data and restores it: it runs with the recording
// specs, one worker.
test.describe.configure({ mode: 'serial' })

const root = (page: Page) => page.locator('[data-view="hierarchy"]')
const card = (page: Page, key: string) =>
  page.locator(`[data-card-key="${key}"]`)
const drawer = (page: Page) => page.getByTestId('hierarchy-drawer')
const BUILDING_A = 'agg-03+agg-08|node-building-a'
const HEBREW =
  'בניין הנהלה ראשי של הקמפוס הצפוני עם שם ארוך מאוד מאוד שלא נכנס בכרטיס'

const renameNode = async (page: Page, name: string) => {
  const response = await page.request.patch(
    '/api/installed/nodes/node-building-a',
    { data: { name } },
  )
  expect(response.status(), await response.text()).toBe(200)
}

test('HI-13 a long Hebrew name from a direct fix, while the drawer is open: isolated, cut, the same card, nothing moves', async ({
  page,
}) => {
  await page.goto('/')
  await fitted(page)
  await card(page, BUILDING_A).click()
  await expect(drawer(page)).toBeVisible()
  const positions = await root(page).getAttribute('data-card-positions')
  const view = await settledViewport(page)

  try {
    await renameNode(page, HEBREW)
    // A direct fix made in the app refetches the topology: edit a detail of the
    // switch in the inspector, which the drawer opens.
    await drawer(page).locator('[data-switch-id="edge-17"]').click()
    await drawer(page).getByRole('button', { name: 'Inspector' }).click()
    const details = page.getByTestId('equipment-details')
    await details.getByRole('button', { name: 'Edit details' }).click()
    const form = page.getByTestId('details-form')
    await form.getByLabel('Model').fill('HI-13')
    await form.getByRole('button', { name: 'Save fix' }).click()
    await expect(form).toHaveCount(0)

    // The card, the drawer and the key are the same; the name is new.
    await expect(card(page, BUILDING_A)).toContainText(HEBREW)
    await expect(drawer(page).getByRole('heading', { level: 2 })).toContainText(
      HEBREW,
    )
    await expect(card(page, BUILDING_A)).toHaveAttribute('data-hot', 'true')
    await expect(
      card(page, BUILDING_A).locator('bdi', { hasText: HEBREW }),
    ).toHaveCount(1)
    // Cut with an ellipsis, inside the card.
    const name = card(page, BUILDING_A).locator('bdi', { hasText: HEBREW })
    const cut = await name.evaluate((el) => {
      const box = el.parentElement!
      const style = getComputedStyle(box)
      return {
        ellipsis: style.textOverflow === 'ellipsis',
        overflow: style.overflow,
        wider: box.scrollWidth > box.clientWidth,
      }
    })
    expect(cut.ellipsis).toBe(true)
    expect(cut.overflow).toBe('hidden')
    expect(cut.wider).toBe(true)
    const c = (await card(page, BUILDING_A).boundingBox())!
    // The name's box is the clipped one (the text inside is cut at its edge).
    const n = (await name.locator('..').boundingBox())!
    expect(n.x + n.width).toBeLessThanOrEqual(c.x + c.width + 1)
    await expect(name).toHaveCSS('unicode-bidi', /isolate/)
    // Nothing moved and nothing refit.
    expect(await root(page).getAttribute('data-card-positions')).toBe(positions)
    expect(
      await page.locator('.react-flow__viewport').getAttribute('style'),
    ).toBe(view)
    await page.screenshot({ path: 'test-results/hi-13-hebrew.png' })
  } finally {
    await renameNode(page, 'Building A')
  }
})
