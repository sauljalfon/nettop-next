import { expect, test } from './fixtures'
import { fitted } from './helpers'
import { createModel, modelInput, openModelsFromPlan } from './models-api'
import { newPlan, unique } from './plan-api'

const editor = (page: import('@playwright/test').Page) =>
  page.getByRole('form', { name: 'Model editor' })

test('D51-01 the Switch models page: make a model with two groups, see its faceplate, refuse a name that differs only in case, delete it', async ({
  page,
  request,
}) => {
  const other = await createModel(request, modelInput(unique('Other model')))
  const plan = await newPlan(request, unique('Models'))
  await openModelsFromPlan(page, plan)
  const root = page.getByTestId('models-page')
  await expect(root).toContainText(
    'Models are shared; they are not part of the plan',
  )
  await expect(root).toContainText(
    "A switch copies its model's ports when it is added. Editing or deleting a model never changes switches already added.",
  )
  await expect(
    root.getByTestId('model-item').filter({ hasText: other.name }),
  ).toContainText('Cisco · 1U · 52 ports')

  // New model: two groups, 24 + 4, typed in.
  const name = unique('C9300-48P')
  await root.getByRole('button', { name: '+ New model' }).click()
  const form = editor(page)
  await form.getByLabel('Model name').fill(name)
  await form.getByLabel('Manufacturer').fill('Cisco')
  const rows = form.getByTestId('model-group-row')
  await expect(rows).toHaveCount(1)
  await rows.nth(0).getByLabel('Count').fill('48')
  await rows.nth(0).getByLabel('Names').fill('Gi1/0/{n}')
  await form.getByRole('button', { name: '+ Add a group of ports' }).click()
  await expect(rows).toHaveCount(2)
  await rows.nth(1).getByLabel('Count').fill('4')
  await rows.nth(1).getByLabel('Names').fill('Te1/1/{n}')
  await rows.nth(1).getByLabel('Type').selectOption('fiber')
  await rows.nth(1).getByLabel('Connector').fill('SFP+')
  await rows.nth(1).getByLabel('Speed').fill('10G')
  await expect(form.getByTestId('model-total')).toContainText(
    '52 ports in 2 groups',
  )
  // How it will look: the real faceplate, 52 jacks, a caption per group.
  const preview = form.getByTestId('model-preview')
  await expect(preview.getByTestId('face-endpoint')).toHaveCount(52)
  await expect(preview.getByTestId('bank-caption')).toHaveCount(2)
  await expect(preview.getByTestId('bank-caption').nth(1)).toHaveText(
    'Te1/1/1–Te1/1/4 · fiber · 10G',
  )
  await rows.nth(1).getByLabel('Count').fill('2')
  await expect(preview.getByTestId('face-endpoint')).toHaveCount(50)
  await rows.nth(1).getByLabel('Count').fill('4')

  // A problem is said under the form and nothing is saved.
  await rows.nth(0).getByLabel('Names').fill('Gi1/0/')
  await form.getByRole('button', { name: 'Save model' }).click()
  await expect(form.getByTestId('model-error')).toContainText('{n}')
  await rows.nth(0).getByLabel('Names').fill('Gi1/0/{n}')
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/switch-models') && r.method() !== 'GET')
      posts.push(r.method())
  })
  await form.getByRole('button', { name: 'Save model' }).click()
  const item = root.getByTestId('model-item').filter({ hasText: name })
  await expect(item).toContainText('Cisco · 1U · 52 ports')
  await expect(item).toHaveAttribute('aria-current', 'true')
  expect(posts).toEqual(['POST'])

  // Another model's name with other case: the server's 409, said in words.
  await root.getByTestId('model-item').filter({ hasText: other.name }).click()
  await editor(page).getByLabel('Model name').fill(name.toLowerCase())
  await editor(page).getByRole('button', { name: 'Save model' }).click()
  await expect(editor(page).getByTestId('model-error')).toHaveText(
    `${name.toLowerCase()} is already a model`,
  )
  await expect(
    root.getByTestId('model-item').filter({ hasText: other.name }),
  ).toHaveCount(1)

  // Delete… asks, and says the switches keep their ports.
  await root.getByTestId('model-item').filter({ hasText: name }).click()
  await editor(page).getByRole('button', { name: 'Delete…' }).click()
  const confirm = page.getByTestId('inline-confirm')
  await expect(confirm).toContainText(
    'Switches added from it keep their ports.',
  )
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(
    editor(page).getByRole('button', { name: 'Delete…' }),
  ).toBeFocused()
  await editor(page).getByRole('button', { name: 'Delete…' }).click()
  await page
    .getByTestId('inline-confirm')
    .getByRole('button', { name: 'Delete model' })
    .click()
  await expect(
    root.getByTestId('model-item').filter({ hasText: name }),
  ).toHaveCount(0)
  expect(
    (await (await request.get('/api/switch-models')).json()).map(
      (m: { name: string }) => m.name,
    ),
  ).not.toContain(name)

  // ← Back returns to the view it came from.
  await root.getByRole('button', { name: '← Back' }).click()
  await expect(page.getByTestId('models-page')).toHaveCount(0)
  await fitted(page)
})
