import { expect, type Page } from '@playwright/test'

/**
 * D52: the page settings gear (task boards, View Schedule, the Scheduler, the
 * Gantt, Brands & Recipes, the Ingredient Library, the Buy-a-Beer Board). Its
 * menu holds choices (a heading that opens its options), switches and plain
 * items. These helpers open the gear when it's closed and leave it as the app
 * does: choices and switches keep the menu open, so `closeSettings` ends a run.
 */

const menu = (page: Page) => page.getByRole('menu')

export async function openSettings(page: Page, gear: string) {
  if (await menu(page).isVisible()) return
  await page.getByTestId(gear).click()
  await expect(menu(page)).toBeVisible()
}

export async function closeSettings(page: Page) {
  if (!(await menu(page).isVisible())) return
  await page.keyboard.press('Escape')
  // A pick that changes the URL can take focus out of the menu; then a click
  // outside it (the backdrop) closes it.
  try {
    await expect(menu(page)).toBeHidden({ timeout: 1000 })
  } catch {
    await page.mouse.click(2, 2)
    await expect(menu(page)).toBeHidden()
  }
}

/** Pick `value` under a choice heading (e.g. `board-filter` → `board-filter-mine`). */
export async function pickSetting(page: Page, gear: string, choice: string, value: string | number, opts: { close?: boolean } = {}) {
  await openSettings(page, gear)
  const option = page.getByTestId(`${choice}-${value}`)
  if (!(await option.isVisible())) await page.getByTestId(choice).click()
  await option.click()
  if (opts.close !== false) await closeSettings(page)
}

/** What a choice heading says is picked ("All", "My tasks", "2 weeks"). */
export async function settingValue(page: Page, gear: string, choice: string): Promise<string> {
  await openSettings(page, gear)
  const text = (await page.getByTestId(choice).innerText()).split('\n').map((s) => s.trim()).filter(Boolean)
  await closeSettings(page)
  return text[1] ?? ''
}

/** Turn a switch on or off (no-op when it already is). */
export async function setSetting(page: Page, gear: string, toggle: string, on: boolean, opts: { close?: boolean } = {}) {
  await openSettings(page, gear)
  const input = page.getByTestId(toggle)
  if ((await input.isChecked()) !== on) await input.locator('xpath=ancestor::li[1]').click()
  await expect(input).toBeChecked({ checked: on })
  if (opts.close !== false) await closeSettings(page)
}

/** Whether a switch is on. */
export async function settingOn(page: Page, gear: string, toggle: string): Promise<boolean> {
  await openSettings(page, gear)
  const on = await page.getByTestId(toggle).isChecked()
  await closeSettings(page)
  return on
}

/** Click a plain item (History, Calendar sync, Export CSV…); the app closes the menu. */
export async function settingsItem(page: Page, gear: string, item: string) {
  await openSettings(page, gear)
  await page.getByTestId(item).click()
}

/** The test ids of the menu's plain items and choice headings, in order (the menu is left closed). */
export async function settingsItems(page: Page, gear: string): Promise<string[]> {
  await openSettings(page, gear)
  const ids = await menu(page).locator('[role="menuitem"][data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!))
  await closeSettings(page)
  return ids
}

/** The options under a choice heading (`board-filter` → ['board-filter-all', …]); the menu is left closed. */
export async function choiceOptions(page: Page, gear: string, choice: string): Promise<string[]> {
  await openSettings(page, gear)
  await page.getByTestId(choice).click()
  const ids = await menu(page)
    .locator(`[data-testid^="${choice}-"]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!))
  await closeSettings(page)
  return ids
}

/** The board's manager entries (History, Daily items); [] for anyone else. */
export async function boardManagerItems(page: Page): Promise<string[]> {
  return (await settingsItems(page, 'board-settings')).filter((id) => id.startsWith('board-menu-'))
}
