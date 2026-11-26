import { expect, type Page } from '@playwright/test'
import { chooseRack } from './patching-helpers'

/** The small box at the unit (D51) and its pieces. */
export const addBox = (page: Page) => page.getByTestId('add-box')
export const boxAdd = (page: Page) =>
  addBox(page).getByRole('button', { name: /^Add( \d+)?$/ })

/** The Add tab's entry whose card says `text` (a model's name, "Patch panel", "HDF", "UPS"…). */
export const libraryEntry = (page: Page, text: string) =>
  page.getByTestId('library-item').filter({ hasText: text })

export interface Where {
  site: string
  node: string
  rack: string
  rackId: string
}

export const BUILDING_A_RACK: Where = {
  site: 'Main Campus',
  node: 'Building A',
  rack: 'Rack A03',
  rackId: 'rack-a03',
}

/** Opens the dock's Add tab. */
export async function openLibrary(page: Page) {
  if (await page.getByTestId('library-item').first().isVisible()) return
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await expect(page.getByTestId('library-item').first()).toBeVisible()
}

/**
 * The way a user adds by clicking: the library entry, the rack (the note's
 * Site › Node › Rack picker, unless that rack is already shown), then a free
 * unit. Leaves the box open at that unit.
 */
export async function pickAndOpenBox(
  page: Page,
  entry: string,
  where: Where,
  unit: number,
) {
  await openLibrary(page)
  await libraryEntry(page, entry).click()
  const note = page.getByTestId('pick-note')
  await expect(note).toBeVisible()
  const slot = page.getByTestId(`rack-slot-${where.rackId}-${unit}`)
  if (!(await slot.count())) {
    await chooseRack(note, 'Rack', where)
    await note.getByRole('button', { name: 'Show rack' }).click()
  }
  await slot.click()
  await expect(addBox(page)).toBeVisible()
}

/** The same by dragging the entry onto the unit of the rack that is shown. */
export async function dragAndOpenBox(
  page: Page,
  entry: string,
  rackId: string,
  unit: number,
) {
  await openLibrary(page)
  await libraryEntry(page, entry).dragTo(
    page.getByTestId(`rack-slot-${rackId}-${unit}`),
  )
  await expect(addBox(page)).toBeVisible()
}
