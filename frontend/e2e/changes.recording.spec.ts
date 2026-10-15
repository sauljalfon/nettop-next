// These specs record plans, which changes the shared test server's installed
// revision and so makes every other draft stale. They run in the "recording"
// project, after all other specs (see playwright.config.ts). Each one builds its
// own drafts on the revision it finds, and only adds or removes what it made
// itself, so none depends on another's order.
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { expandResults, fitted, openRackInPhysical } from './helpers'
import {
  addRoom,
  addSwitch,
  command,
  getPlan,
  installedRevision,
  newPlan,
  record,
  unique,
} from './plan-api'

const root = (page: Page) => page.locator('.physical-explorer')
const mark = (page: Page, name: string) =>
  root(page).evaluate((el, n) => el.getAttribute(n) ?? '', name)
const expectMark = (page: Page, name: string, value: string) =>
  expect.poll(() => mark(page, name)).toBe(value)

const openChanges = async (page: Page) => {
  if (
    await page.getByRole('complementary', { name: 'Changes & plans' }).count()
  )
    return
  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(
    page.getByRole('complementary', { name: 'Changes & plans' }),
  ).toBeVisible()
}
const drawer = (page: Page) =>
  page.getByRole('complementary', { name: 'Changes & plans' })
const review = (page: Page) => page.getByTestId('review-step')
const recordButton = (page: Page) =>
  review(page).getByRole('button', { name: /^Record \d+ change/ })
const fillReview = async (page: Page, note: string, by?: string) => {
  await review(page).getByLabel(/^Note/).fill(note)
  if (by !== undefined)
    await review(page)
      .getByLabel(/^Recorded by/)
      .fill(by)
}
const expectRevision = (
  request: APIRequestContext,
  id: string,
  revision: string,
) =>
  expect.poll(async () => (await getPlan(request, id)).revision).toBe(revision)

/** A draft that adds a room with two switches joined by one cable: 6 changes. */
async function roomDraft(request: APIRequestContext, label: string) {
  const id = await newPlan(request, `Record ${label}`)
  const room = await addRoom(request, id, label)
  const a = await addSwitch(request, id, room.rackId, `SW-A ${label}`, 1)
  const b = await addSwitch(request, id, room.rackId, `SW-B ${label}`, 2)
  await command(request, id, {
    type: 'add_cable',
    cable: { a: `${a}:p1`, b: `${b}:p1` },
  })
  return { id, a, b, ...room }
}

/** Opens the draft in Physical at Rack A03 with the EDGE-17 trace running. */
async function physicalWithTrace(page: Page, planId: string) {
  await page.goto(`/?plan=${planId}`)
  await fitted(page)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await expandResults(page)
  await expect(page.getByTestId('route-row')).toHaveCount(3)
}

test('RC-05 the review step checks first, needs a note and Recorded by, records, and Installed then shows it with the location and trace kept', async ({
  page,
  request,
}) => {
  const label = unique('Rec')
  const d = await roomDraft(request, label)
  const other = await newPlan(request, `Other ${label}`)
  await command(request, other, {
    type: 'add_site',
    site: { name: `${label} Other` },
  })
  await physicalWithTrace(page, d.id)
  const location = await mark(page, 'data-location')
  const route = await mark(page, 'data-route-equipment')
  expect(route).not.toBe('')

  await openChanges(page)
  await page.getByRole('button', { name: 'Record as installed…' }).click()
  // The check runs when the step opens and says so first.
  await expect(page.getByTestId('review-check')).toContainText(
    'No problems found.',
  )
  await expect(page.getByTestId('review-list')).toContainText(
    `Site · ${label} Site`,
  )
  await expect(review(page)).toContainText(
    'Only record what is physically done.',
  )
  await expect(recordButton(page)).toHaveText('Record 6 changes')
  await expect(recordButton(page)).toBeDisabled()
  await fillReview(page, 'Installed the room and patched the two switches')
  await expect(recordButton(page)).toBeDisabled() // Recorded by is still empty
  await fillReview(
    page,
    'Installed the room and patched the two switches',
    'Dana Cohen',
  )
  await expect(recordButton(page)).toBeEnabled()
  await fillReview(page, 'x'.repeat(501))
  await expect(recordButton(page)).toBeDisabled()
  await expect(review(page)).toContainText(
    'Keep the note under 500 characters.',
  )
  await fillReview(page, 'Installed the room and patched the two switches')
  await recordButton(page).click()

  // Installed, with the same place and route; the toast says what happened.
  await expect(
    page.getByRole('button', { name: 'Installed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status')).toHaveText(
    new RegExp(
      `Recorded 6 changes from “Record ${label}”. Installed is updated; \\d+ other drafts? now needs? Update draft.`,
    ),
  )
  await expectMark(page, 'data-location', location)
  await expect.poll(() => mark(page, 'data-route-equipment')).toBe(route)
  const plan = await getPlan(request, d.id)
  expect(plan).toMatchObject({
    status: 'recorded',
    recordedBy: 'Dana Cohen',
    recordNote: 'Installed the room and patched the two switches',
  })
  const installed = await (
    await request.get('/api/topology?context=installed')
  ).json()
  expect(installed.equipment.map((e: { id: string }) => e.id)).toEqual(
    expect.arrayContaining([d.a, d.b]),
  )
  await expect(
    page.getByRole('button', {
      name: `Open ${label} Other in Plan`,
      exact: false,
    }),
  ).toHaveCount(0)

  // The drawer lists it as recorded, with who, when and why, and what changed.
  const row = page.locator(
    `[data-testid="recorded-row"][data-plan-id="${d.id}"]`,
  )
  await expect(row.getByTestId('recorded-line')).toContainText(
    'by Dana Cohen · Installed the room and patched the two switches',
  )
  await row.getByRole('button', { name: 'Show 6 changes' }).click()
  await expect(row.getByTestId('recorded-changes')).toContainText(
    `Containers added · Site · ${label} Site`,
  )
  await expect(row.getByTestId('recorded-changes')).toContainText(
    `Cables connected · SW-`,
  )

  // Recorded by is remembered in this browser.
  const next = await newPlan(request, `Next ${label}`)
  await command(request, next, {
    type: 'add_site',
    site: { name: `${label} Next` },
  })
  await page.goto(`/?plan=${next}`)
  await fitted(page)
  await openChanges(page)
  await page.getByRole('button', { name: 'Record as installed…' }).click()
  await expect(review(page).getByLabel(/^Recorded by/)).toHaveValue(
    'Dana Cohen',
  )
})

test('RC-05 a problem found by the check is listed first and keeps Record off', async ({
  page,
  request,
}) => {
  const label = unique('Prob')
  const mine = await newPlan(request, `Mine ${label}`)
  await command(request, mine, {
    type: 'add_site',
    site: { name: `${label} Mine` },
  })
  await page.goto(`/?plan=${mine}`)
  await fitted(page)
  await openChanges(page)
  // Someone else records first, behind this page's back.
  const theirs = await newPlan(request, `Theirs ${label}`)
  await command(request, theirs, {
    type: 'add_site',
    site: { name: `${label} Theirs` },
  })
  await record(request, theirs)

  await page.getByRole('button', { name: 'Record as installed…' }).click()
  const problems = page.getByTestId('review-problems')
  await expect(problems).toContainText(
    'Installed changed since this draft; update the draft first.',
  )
  await fillReview(page, 'Done', 'Dana Cohen')
  await expect(recordButton(page)).toBeDisabled()
  // The problem is listed before the grouped changes.
  const order = await review(page).evaluate((el) => {
    const at = (id: string) =>
      el.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top
    return at('review-problems') < at('review-list')
  })
  expect(order).toBe(true)
  expect((await getPlan(request, mine)).status).toBe('draft')
})

test('RC-09 a double click records once and shows the recorded plan', async ({
  page,
  request,
}) => {
  const label = unique('Dbl')
  const id = await newPlan(request, `Double ${label}`)
  await command(request, id, {
    type: 'add_site',
    site: { name: `${label} Site` },
  })
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openChanges(page)
  await page.getByRole('button', { name: 'Record as installed…' }).click()
  await fillReview(page, 'One site', 'Dana Cohen')
  await recordButton(page).dblclick()
  await expect(
    page.getByRole('button', { name: 'Installed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status')).toContainText('Recorded 1 change from')
  const row = page.locator(`[data-testid="recorded-row"][data-plan-id="${id}"]`)
  await expect(row).toContainText('Recorded')
  const installed = await (
    await request.get('/api/topology?context=installed')
  ).json()
  expect(
    installed.sites.filter((s: { name: string }) => s.name === `${label} Site`),
  ).toHaveLength(1)
  // A repeated request is a 409 that says "recorded", not a second record.
  const again = await request.post(`/api/plans/${id}/record`, {
    data: { expectedRevision: '2', note: 'again', recordedBy: 'Dana' },
  })
  expect(again.status()).toBe(409)
  expect((await again.json()).error).toContain('recorded and read-only')
})

test('RC-09 a record that finds the plan already recorded shows it as recorded, not as an error', async ({
  page,
  request,
}) => {
  const label = unique('Twice')
  const id = await newPlan(request, `Twice ${label}`)
  await command(request, id, {
    type: 'add_site',
    site: { name: `${label} Site` },
  })
  await page.goto(`/?plan=${id}`)
  await fitted(page)
  await openChanges(page)
  await page.getByRole('button', { name: 'Record as installed…' }).click()
  await fillReview(page, 'Recorded in another window', 'Dana Cohen')
  await record(request, id, 'Recorded in another window', 'Eli') // the other window
  await recordButton(page).click()
  await expect(
    page.getByRole('button', { name: 'Installed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status')).toContainText(
    `“Twice ${label}” was already recorded.`,
  )
  await expect(page.getByTestId('record-error')).toHaveCount(0)
  await expect(
    page.locator(`[data-testid="recorded-row"][data-plan-id="${id}"]`),
  ).toContainText('by Eli')
})

/**
 * Installed gets a room with two switches. "Mine" (a draft from that revision)
 * cables SW1 port 1 to SW2 port 2, moves SW1 to U6, cables SW4 to SW2, and adds a
 * site. Then someone records "Theirs", which puts a switch on U6, cables SW1
 * port 1 to SW2 port 1 and deletes SW4: three of Mine's changes no longer fit,
 * one still does.
 */
async function staleScenario(request: APIRequestContext) {
  const label = unique('Stale')
  const setup = await newPlan(request, `Setup ${label}`)
  const room = await addRoom(request, setup, label)
  const sw1 = await addSwitch(request, setup, room.rackId, `SW1 ${label}`, 1)
  const sw2 = await addSwitch(request, setup, room.rackId, `SW2 ${label}`, 2)
  const sw4 = await addSwitch(request, setup, room.rackId, `SW4 ${label}`, 3)
  await record(request, setup)
  const mine = await newPlan(request, `Mine ${label}`)
  await command(request, mine, {
    type: 'add_cable',
    cable: { a: `${sw1}:p1`, b: `${sw2}:p2` },
  })
  await command(request, mine, {
    type: 'move_equipment',
    placement: { equipmentId: sw1, rackId: room.rackId, unit: 6 },
  })
  await command(request, mine, {
    type: 'add_cable',
    cable: { a: `${sw4}:p1`, b: `${sw2}:p4` },
  })
  await command(request, mine, {
    type: 'add_site',
    site: { name: `${label} Extra` },
  })
  const theirs = await newPlan(request, `Theirs ${label}`)
  await addSwitch(request, theirs, room.rackId, `SW3 ${label}`, 6)
  await command(request, theirs, {
    type: 'add_cable',
    cable: { a: `${sw1}:p1`, b: `${sw2}:p1` },
  })
  await command(request, theirs, {
    type: 'delete_equipment',
    target: { id: sw4 },
  })
  await record(request, theirs)
  return { label, mine, sw1, sw2, sw4, ...room }
}

test('RB-03 a stale draft shows the card in Plan view, and the drawer banner and conflicts with links', async ({
  page,
  request,
}) => {
  const s = await staleScenario(request)
  const before = await getPlan(request, s.mine)
  await page.goto(`/?plan=${s.mine}`)
  // The card replaces the map and Physical.
  const card = page.getByTestId('stale-card')
  await expect(card).toContainText('Installed changed since this draft')
  await expect(card.getByRole('button', { name: 'Update draft' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Open Changes' })).toBeVisible()
  await expect(
    card.getByRole('button', { name: 'View Installed' }),
  ).toBeVisible()
  await expect(page.locator('.flow-surface')).toHaveCount(0)
  await expect(page.locator('.physical-explorer')).toHaveCount(0)

  // Open Changes: the banner, and the selector marks the draft.
  await card.getByRole('button', { name: 'Open Changes' }).click()
  await expect(page.getByTestId('stale-banner')).toContainText(
    'Installed changed since this draft.',
  )
  await expect(
    drawer(page).getByLabel('Draft', { exact: true }).locator('option:checked'),
  ).toContainText('behind Installed')
  await expect(page.getByTestId('conflicts')).toHaveCount(0) // nothing is checked until Update draft

  // Update draft: every conflict is listed, with its link and its reason; nothing changes.
  await page
    .getByTestId('stale-banner')
    .getByRole('button', { name: 'Update draft' })
    .click()
  const conflicts = page.getByTestId('conflict')
  await expect(conflicts).toHaveCount(3)
  await expect(page.getByTestId('conflicts')).toContainText(
    '3 changes no longer fit the current Installed:',
  )
  const place = page.locator(
    `[data-testid="conflict"][data-key="place_equipment:${s.sw1}"]`,
  )
  await expect(place).toContainText(
    `SW1 ${s.label} · ${s.label} R1 U1 → ${s.label} R1 U6`,
  )
  await expect(place).toContainText(
    `U6 in ${s.label} R1 is taken by SW3 ${s.label}`,
  )
  await expect(conflicts.filter({ hasText: 'already cabled' })).toHaveCount(1)
  // SW4 is gone from Installed: the line and the reason still name it, from the
  // labels the draft kept, never an ID.
  const removed = conflicts.filter({ hasText: 'no longer exists' })
  await expect(removed).toHaveCount(1)
  await expect(removed).toContainText(`SW4 ${s.label} · Port 1`)
  await expect(removed).toContainText(`SW2 ${s.label} · Port 4`)
  await expect(removed).toContainText(
    `SW4 ${s.label} · Port 1 no longer exists`,
  )
  await expect(removed).not.toContainText(s.sw4)
  await expect(removed).not.toContainText('An endpoint')
  await expect(
    page.getByTestId('stale-changes').getByTestId('change-line'),
  ).toHaveCount(4)
  const after = await getPlan(request, s.mine)
  expect(after.revision).toBe(before.revision)
  expect(after.baseRevision).toBe(before.baseRevision)

  // A link opens the object in Installed (the draft cannot be drawn).
  await place
    .getByRole('button', { name: new RegExp(`^SW1 ${s.label}`) })
    .click()
  await expect(
    page.getByRole('button', { name: 'Installed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expectMark(page, 'data-physical-level', 'equipment')
  await expectMark(page, 'data-selected-equipment', s.sw1)

  // Installed's drawer calls the draft out, and Open in Plan returns to the card.
  const rowOnInstalled = page.locator(
    `[data-testid="draft-row"][data-plan-id="${s.mine}"]`,
  )
  await expect(rowOnInstalled).toContainText('Installed changed')
  await rowOnInstalled.getByRole('button', { name: /in Plan$/ }).click()
  await expect(page.getByTestId('stale-card')).toBeVisible()
  await page
    .getByTestId('stale-card')
    .getByRole('button', { name: 'View Installed' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Installed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('RB-04 Drop removes a conflicting change, and Update draft then succeeds', async ({
  page,
  request,
}) => {
  const s = await staleScenario(request)
  await page.goto(`/?plan=${s.mine}`)
  await page
    .getByTestId('stale-card')
    .getByRole('button', { name: 'Update draft' })
    .click()
  // The conflicts open in the drawer by themselves.
  await expect(page.getByTestId('conflict')).toHaveCount(3)
  await page
    .getByRole('button', { name: /^Drop: SW1/ })
    .first()
    .click()
  await expect(page.getByTestId('conflict')).toHaveCount(2)
  await expect(page.getByRole('status')).toContainText('Undid:')
  await page
    .getByRole('button', { name: /^Drop:/ })
    .first()
    .click()
  await expect(page.getByTestId('conflict')).toHaveCount(1)
  await page.getByRole('button', { name: /^Drop:/ }).click()
  await expect(page.getByText('Cannot load the workspace')).toHaveCount(0)
  await expect(page.getByTestId('conflicts-none')).toContainText(
    'All changes fit the current Installed now.',
  )
  await expect(
    page.getByTestId('stale-changes').getByTestId('change-line'),
  ).toHaveCount(1)
  // The draft is still on the old base until Update draft moves it.
  expect((await getPlan(request, s.mine)).baseRevision).not.toBe(
    await installedRevision(request),
  )

  await page
    .getByTestId('stale-banner')
    .getByRole('button', { name: 'Update draft' })
    .click()
  await expect(page.getByTestId('stale-banner')).toHaveCount(0)
  await expect(page.getByTestId('draft-summary')).toBeVisible()
  await expect(
    page.getByTestId('draft-summary').getByTestId('change-line'),
  ).toHaveText(new RegExp(`Site · ${s.label} Extra`))
  const moved = await getPlan(request, s.mine)
  expect(moved.baseRevision).toBe(await installedRevision(request))
  // The draft is drawn again, on the new Installed.
  await expect(page.getByTestId('stale-card')).toHaveCount(0)
  await expect(page.locator('.flow-surface')).toBeVisible()
})
