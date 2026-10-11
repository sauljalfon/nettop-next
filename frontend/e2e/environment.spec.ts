import { expect, test } from '@playwright/test'

// PR-05: the header labels the environment the API reports; the test server
// reports dev, and the old fixed "LOCAL DEV" text is gone.
test('PR-05 the header shows DEV from the API, and no LOCAL DEV text', async ({
  page,
  request,
}) => {
  expect((await (await request.get('/api/health')).json()).environment).toBe(
    'dev',
  )
  await page.goto('/')
  const badge = page.getByTestId('environment-badge')
  await expect(badge).toHaveText('DEV')
  await expect(badge).toHaveAttribute('data-environment', 'dev')
  await expect(page.getByText('LOCAL DEV')).toHaveCount(0)
  await page.screenshot({
    path: 'test-results/pr-05-header.png',
    clip: { x: 900, y: 0, width: 540, height: 66 },
  })
})
