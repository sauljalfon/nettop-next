import { expect, test, type Page } from '@playwright/test'
import {
  fitted,
  openRackInPhysical,
  selectEquipment,
  settledViewport,
  viewport,
} from './helpers'

// VP-02 (D34): on pages an open right drawer keeps the content clear; on the
// conceptual map a drawer floats over the canvas and never moves it.

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await fitted(page)
})

const inspector = (page: Page) =>
  page.getByRole('complementary', { name: 'Equipment inspector' })

async function openEdge17(page: Page) {
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-17"]').click()
  await expect(page.locator('.equipment-page')).toBeVisible()
}

/** Right edges of every visible block of the equipment page. */
const blockRights = (page: Page) =>
  page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const page = document.querySelector('.equipment-page')!
    const blocks = [
      ...page.children,
      ...(page.querySelector('.equipment-main')?.children ?? []),
    ].filter(visible)
    return blocks.map((b) => ({
      cls: b.className || b.tagName,
      right: b.getBoundingClientRect().right,
    }))
  })

const faceWidth = (page: Page) =>
  page
    .locator('.equipment-main')
    .evaluate((el) => el.getBoundingClientRect().width)

test('VP-02 a switch page keeps clear of the inspector', async ({ page }) => {
  await openEdge17(page)
  const wide = await faceWidth(page)

  await page.getByRole('button', { name: 'Open inspector' }).click()
  await expect(inspector(page)).toBeVisible()
  await expect(
    inspector(page).getByRole('heading', { name: 'EDGE-17' }),
  ).toBeVisible()
  const drawer = (await inspector(page).boundingBox())!
  const blocks = await blockRights(page)
  expect(blocks.length).toBeGreaterThan(0)
  for (const b of blocks)
    expect(b.right, `${b.cls} reaches under the inspector`).toBeLessThanOrEqual(
      drawer.x,
    )
  const sideways = await page
    .locator('.equipment-page')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(sideways).toBeLessThanOrEqual(1)
  const narrow = await faceWidth(page)
  expect(narrow).toBeLessThan(wide)

  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await expect.poll(() => faceWidth(page)).toBeGreaterThan(narrow)
})

test('VP-02 the rack keeps clear of the Changes drawer', async ({ page }) => {
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  const drawer = page.getByRole('complementary', { name: 'Changes & plans' })
  await expect(drawer).toBeVisible()
  const box = (await drawer.boundingBox())!
  const cabinet = (await page.locator('.rack-cabinet').boundingBox())!
  expect(cabinet.x + cabinet.width).toBeLessThanOrEqual(box.x)
  // Nothing else on the rack page (the notes beside it) reaches under it either.
  const rights = await page.locator('.rack-level > *').evaluateAll((els) =>
    els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => r.right),
  )
  for (const right of rights) expect(right).toBeLessThanOrEqual(box.x)
})

test('VP-02 on the map the inspector floats over the canvas and nothing moves', async ({
  page,
}) => {
  // Focus on EDGE-17 with the drawers closed, then open the inspector over it.
  await selectEquipment(page, 'EDGE-17')
  await page.getByRole('button', { name: 'Close Equipment inspector' }).click()
  await page.getByRole('button', { name: 'Open explorer', exact: true }).click()
  await fitted(page)
  const surface = await page.locator('.flow-surface').boundingBox()
  const before = await settledViewport(page)
  await page
    .getByRole('button', { name: 'Open inspector', exact: true })
    .click()
  await expect(inspector(page)).toBeVisible()
  expect(await page.locator('.flow-surface').boundingBox()).toEqual(surface)
  expect(await viewport(page)).toBe(before)
  const drawer = (await inspector(page).boundingBox())!
  const flow = (await page.locator('.flow-surface').boundingBox())!
  expect(drawer.x).toBeLessThan(flow.x + flow.width)
  expect(drawer.x + drawer.width).toBeGreaterThan(flow.x)
})

// VP-03 (D33): a 1U row is never below 26px; a tall rack scrolls and never clips a name.
test('VP-03 Rack T42 keeps 26px rows, scrolls, and labels every unit', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Annex', 'Annex Hall', 'Rack T42')
  const cabinet = page.locator('.rack-cabinet')
  expect(
    Number(await cabinet.getAttribute('data-unit-px')),
  ).toBeGreaterThanOrEqual(26)
  for (let unit = 1; unit <= 42; unit++) {
    const slot = (await page
      .getByTestId(`rack-slot-rack-t42-${unit}`)
      .boundingBox())!
    expect(slot.height, `U${unit}`).toBeGreaterThanOrEqual(26)
  }
  const scrolls = await page
    .locator('.rack-level')
    .evaluate((el) => el.scrollHeight > el.clientHeight + 1)
  expect(scrolls).toBe(true)
  await expect(cabinet.locator('.unit-label')).toHaveText(
    Array.from({ length: 42 }, (_, i) => `U${42 - i}`),
  )
})

test('VP-03 scrolled to the bottom, U1 is fully visible above the results panel', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Open trace tools' }).click()
  await page.getByRole('button', { name: 'Find AGG / BB', exact: true }).click()
  await expect(page.getByTestId('route-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close Trace tools' }).click()
  await openRackInPhysical(page, 'Annex', 'Annex Hall', 'Rack T42')
  const panel = page.getByLabel('Map trace results')
  await expect(panel).toBeVisible()
  const level = page.locator('.rack-level')
  await level.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect
    .poll(async () => {
      const slot = (await page
        .getByTestId('rack-slot-rack-t42-1')
        .boundingBox())!
      const top = (await panel.boundingBox())!.y
      const area = (await level.boundingBox())!
      return (
        slot.y + slot.height <= top + 1 &&
        slot.y >= area.y &&
        slot.y + slot.height <= area.y + area.height + 1
      )
    })
    .toBe(true)
})

test('VP-03 on Rack A03 no name is clipped on its label strip', async ({
  page,
}) => {
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  const strips = await page.locator('.rack-cabinet .tape').evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent ?? '',
      title: el.getAttribute('title') ?? '',
      clipped: el.scrollWidth > el.clientWidth + 1,
    })),
  )
  expect(strips.length).toBeGreaterThan(0)
  for (const s of strips)
    if (s.clipped) expect(s.title, s.text).toContain(s.text)
})

// VP-03b (D34 follow-up): with the inspector open the face still shows every port,
// and the endpoint detail moves below the face instead of over it.
const boxOf = async (loc: ReturnType<Page['locator']>) =>
  (await loc.boundingBox())!
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: typeof a,
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height

async function openEquipmentPage(
  page: Page,
  node: string,
  rack: string,
  id: string,
) {
  await openRackInPhysical(page, 'Main Campus', node, rack)
  await page.locator(`.rack-block[data-equipment-id="${id}"]`).click()
  await expect(page.locator('.equipment-page')).toBeVisible()
}

test('VP-03b EDGE-17 with the inspector open: all 24 ports inside the face card, no sideways scroll, detail below', async ({
  page,
}) => {
  await openEquipmentPage(page, 'Building A', 'Rack A03', 'edge-17')
  await page.getByRole('button', { name: 'Open inspector' }).click()
  await expect(inspector(page)).toBeVisible()
  const card = await boxOf(page.locator('.face-card'))
  for (let n = 1; n <= 24; n++) {
    const jack = await boxOf(page.locator(`[data-endpoint-id="edge-17:p${n}"]`))
    expect(jack.x, `port ${n} left`).toBeGreaterThanOrEqual(card.x)
    expect(jack.x + jack.width, `port ${n} right`).toBeLessThanOrEqual(
      card.x + card.width,
    )
  }
  const plate = await page
    .locator('.faceplate')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(plate).toBeLessThanOrEqual(1)
  expect(overlaps(card, await boxOf(page.getByTestId('endpoint-detail')))).toBe(
    false,
  )
})

test('VP-03b HDF-01 with the inspector open: the whole grid inside the face card, no sideways scroll, detail below', async ({
  page,
}) => {
  await openEquipmentPage(page, 'North Sub-main', 'Rack SM01', 'hdf-01')
  await page.getByRole('button', { name: 'Open inspector' }).click()
  await expect(inspector(page)).toBeVisible()
  const card = await boxOf(page.locator('.face-card'))
  const outside = await page
    .locator('[data-testid="face-endpoint"]')
    .evaluateAll(
      (els, c) =>
        els.filter((e) => {
          const r = e.getBoundingClientRect()
          return r.left < c.x || r.right > c.x + c.width
        }).length,
      card,
    )
  expect(outside).toBe(0)
  const scroller = await page
    .locator('.hdf-scroll')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(scroller).toBeLessThanOrEqual(1)
  expect(overlaps(card, await boxOf(page.getByTestId('endpoint-detail')))).toBe(
    false,
  )
})

test('VP-03b without a drawer the HDF grid fills its card, and every jack number is at least 11px', async ({
  page,
}) => {
  await openEquipmentPage(page, 'North Sub-main', 'Rack SM01', 'hdf-01')
  const m = await page.evaluate(() => {
    const card = document.querySelector('.face-card') as HTMLElement
    const grid = document.querySelector('.hdf-grid') as HTMLElement
    const cs = getComputedStyle(card)
    const inner =
      card.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight)
    const sizes = [
      ...document.querySelectorAll('[data-testid="face-endpoint"]'),
    ].map((e) => parseFloat(getComputedStyle(e).fontSize))
    return {
      ratio: grid.getBoundingClientRect().width / inner,
      min: Math.min(...sizes),
    }
  })
  expect(m.ratio).toBeGreaterThanOrEqual(0.9)
  expect(m.min).toBeGreaterThanOrEqual(11)
})

// VP-04 (D33): one form layout. Label above the control, a focus ring inside the
// box, place selects on one row, proposed forms dashed, ink primary / paper Cancel.
const rgbOf = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      background: cs.backgroundColor,
      border: cs.borderTopColor,
      borderStyle: cs.borderTopStyle,
    }
  })

/** How far the focus ring (outline + offset, outer box-shadow) reaches past the border box. */
const ringReach = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el)
    const outline =
      cs.outlineStyle === 'none'
        ? 0
        : Math.max(
            0,
            parseFloat(cs.outlineWidth) + (parseFloat(cs.outlineOffset) || 0),
          )
    let shadow = 0
    if (cs.boxShadow !== 'none' && !cs.boxShadow.includes('inset')) {
      const m = cs.boxShadow.match(
        /(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/,
      )
      if (m)
        shadow = Math.max(
          0,
          Number(m[4]) +
            Math.max(Math.abs(Number(m[1])), Math.abs(Number(m[2]))),
        )
    }
    return Math.max(outline, shadow)
  })

test('VP-04 the Add HDF form: label above, focus rings inside, place stacked in the narrow drawer, ink and paper buttons, dashed', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add HDF…' }).click()
  const form = page.getByTestId('hdf-form')
  await expect(form).toBeVisible()

  // The form's own ring is inside its box.
  await form.focus()
  const own = await form.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      style: cs.outlineStyle,
      width: parseFloat(cs.outlineWidth),
      offset: parseFloat(cs.outlineOffset),
      color: cs.outlineColor,
    }
  })
  expect(own.style).not.toBe('none')
  expect(own.width).toBe(2)
  expect(own.offset).toBeLessThanOrEqual(-2)
  expect(own.color).toBe('rgb(28, 43, 58)')
  expect(await ringReach(form)).toBe(0)

  // The Name input's ring stays inside the form.
  const name = form.getByLabel('Name')
  await name.focus()
  const formBox = (await form.boundingBox())!
  const nameBox = (await name.boundingBox())!
  const reach = await ringReach(name)
  expect(nameBox.x - reach).toBeGreaterThanOrEqual(formBox.x)
  expect(nameBox.x + nameBox.width + reach).toBeLessThanOrEqual(
    formBox.x + formBox.width,
  )
  expect(nameBox.y - reach).toBeGreaterThanOrEqual(formBox.y)
  expect(nameBox.y + nameBox.height + reach).toBeLessThanOrEqual(
    formBox.y + formBox.height,
  )

  // Site, Node, Rack: one row, left to right, each label above its select.
  const place = form.getByRole('group', { name: 'Place' })
  const parts = []
  for (const part of ['Site', 'Node', 'Rack']) {
    const select = place.getByLabel(part, { exact: true })
    const label = place.locator('label', { hasText: new RegExp(`^${part}$`) })
    const s = (await select.boundingBox())!
    const l = (await label.boundingBox())!
    expect(
      l.y + l.height,
      `${part} label above its select`,
    ).toBeLessThanOrEqual(s.y + 0.5)
    parts.push(s)
  }
  // The library drawer is narrow, so the three stack one per line (owner, 2026-10-15)
  // and no chosen name is clipped; the patching screen keeps them on one row (below).
  expect(parts[1].y).toBeGreaterThan(parts[0].y + parts[0].height)
  expect(parts[2].y).toBeGreaterThan(parts[1].y + parts[1].height)
  expect(Math.abs(parts[0].x - parts[1].x)).toBeLessThanOrEqual(1)
  expect(Math.abs(parts[1].x - parts[2].x)).toBeLessThanOrEqual(1)
  expect(parts[0].width).toBeGreaterThanOrEqual(200)

  // Ink submit, paper Cancel with a rule border; a proposed form is dashed.
  const submit = await rgbOf(
    form.getByRole('button', { name: 'Add HDF to plan' }),
  )
  expect(submit.background).toBe('rgb(28, 43, 58)')
  const cancel = await rgbOf(form.getByRole('button', { name: 'Cancel' }))
  expect(cancel.background).toBe('rgb(255, 255, 255)')
  expect(cancel.border).toBe('rgb(211, 218, 225)')
  expect((await rgbOf(form)).borderStyle).toBe('dashed')
})

test('VP-04 a library item is one card: icon, then name over its description, then Add…', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  const item = page
    .locator('.library-item')
    .filter({ hasText: 'Access switch' })
  const icon = (await item.locator('.equipment-icon').boundingBox())!
  const name = (await item.locator('strong').boundingBox())!
  const description = (await item.locator('small').boundingBox())!
  const add = (await item
    .getByRole('button', { name: 'Add Access switch…' })
    .boundingBox())!
  expect(icon.x + icon.width).toBeLessThanOrEqual(name.x)
  expect(description.y).toBeGreaterThanOrEqual(name.y + name.height - 0.5)
  expect(add.x).toBeGreaterThanOrEqual(
    Math.max(name.x + name.width, description.x + description.width),
  )
  expect(
    Math.abs(add.y + add.height / 2 - (icon.y + icon.height / 2)),
  ).toBeLessThan(20)
  expect((await rgbOf(item)).border).toBe('rgb(211, 218, 225)')
})

test('VP-04 the patching screen: the far end Site, Node and Rack share a row, Equipment is below', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.locator('.rack-block[data-equipment-id="edge-17"]').click()
  await page.locator('[data-endpoint-id="edge-17:p4"]').click()
  await page
    .getByTestId('connect-popover')
    .getByRole('button', { name: 'Choose far end…' })
    .click()
  const picker = page
    .getByTestId('patching')
    .getByRole('region', { name: 'To' })
    .getByRole('group', { name: 'Far end' })
  const box = async (name: string) =>
    (await picker.getByLabel(name, { exact: true }).boundingBox())!
  const [site, node, rack, equipment] = [
    await box('Site'),
    await box('Node'),
    await box('Rack'),
    await box('Equipment'),
  ]
  expect(Math.abs(site.y - node.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(node.y - rack.y)).toBeLessThanOrEqual(1)
  expect(site.x).toBeLessThan(node.x)
  expect(node.x).toBeLessThan(rack.x)
  expect(equipment.y).toBeGreaterThan(site.y + site.height)
  // Each equipment name on the Next line is isolated alone, never with its port label.
  await expect(page.getByTestId('patching-next').locator('bdi')).toHaveText([
    'EDGE-17',
    /^[^·]+$/,
  ])
})

// VP-05 (D33): no text on screen is smaller than 11px.
async function smallText(page: Page) {
  return page.evaluate(() => {
    const out: string[] = []
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    )
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim()
      const el = n.parentElement
      if (!text || !el) continue
      // React Flow's attribution link is a library credit we do not style.
      if (el.closest('.react-flow__attribution')) continue
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden')
        continue
      const size = parseFloat(cs.fontSize)
      if (size < 11)
        out.push(
          `<${el.tagName.toLowerCase()} class="${el.className}"> ${size}px "${text.slice(0, 40)}"`,
        )
    }
    return out
  })
}

test('VP-05 the map with EDGE-17 selected and the inspector open has no text under 11px', async ({
  page,
}) => {
  await selectEquipment(page, 'EDGE-17')
  await expect(inspector(page)).toBeVisible()
  expect(await smallText(page)).toEqual([])
})

test('VP-05 Physical: the site canvas, Rack A03 and HDF-01 have no text under 11px', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Physical', exact: true }).click()
  const sites = page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('button', { name: 'Sites', exact: true })
  if (await sites.count()) await sites.click()
  await page
    .getByRole('button', { name: 'Open Main Campus', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: /^Open racks of / }).first(),
  ).toBeVisible()
  expect(await smallText(page), 'site canvas').toEqual([])

  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await expect(page.locator('.rack-block').first()).toBeVisible()
  expect(await smallText(page), 'Rack A03').toEqual([])

  await page.goto('/')
  await fitted(page)
  await openEquipmentPage(page, 'North Sub-main', 'Rack SM01', 'hdf-01')
  expect(await smallText(page), 'HDF-01').toEqual([])
})

test('VP-05 the HDF form in the library and the Changes drawer have no text under 11px', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Plan: Expansion' }).click()
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add HDF…' }).click()
  await expect(page.getByTestId('hdf-form')).toBeVisible()
  expect(await smallText(page), 'HDF form').toEqual([])
  await page.getByRole('button', { name: 'Close Equipment library' }).click()
  await page.getByRole('button', { name: /^Changes/ }).click()
  await expect(
    page.getByRole('complementary', { name: 'Changes & plans' }),
  ).toBeVisible()
  expect(await smallText(page), 'Changes drawer').toEqual([])
})
