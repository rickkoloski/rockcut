import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs } from './helpers'
import { batchOf, Made, openGantt, snack, stepOf, today, type SBatch } from './schedule'

// D56 on the Gantt: S16 (§3.3 "Label by", on the account by decision 18, so
// a second browser has it) and S20 (§3.7, 4950: Ctrl/Cmd+Z over a dialog,
// the snackbar staying, clear of the dialog's title). Batches are [TEST-TEMP]
// ones in the spec's own tanks.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1200 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
test.afterEach(async () => {
  // brewer1's Gantt view back to nothing expanded (it's on the account now).
  await (await apiAs('brewer1')).put('/api/me/board_settings/production', { data: { expanded: [], label_by: {} } })
  await made.cleanup()
})

/** The Gantt view save (expanded tanks, Label by) finishing. */
const viewSaved = (page: Page) => page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith('/api/me/board_settings/production') && r.ok())

test('S16: two batches in FV3; expand it and pick one in "Label by": its rows by name only; kept after a reload and in another browser', async ({ page, browser }) => {
  const tank = await made.tank('FV3')
  // The seed ale runs 25 days: one ending today + 5, the next brewed the day after.
  const a = await batchOf((await made.plan({ brand_id: (await made.brand('S16 A')).id, template: ALE, brew_on: addDays(today(), -20), tank_ids: [tank.id] })).id)
  const b = await batchOf((await made.plan({ brand_id: (await made.brand('S16 B')).id, template: ALE, brew_on: addDays(today(), 6), tank_ids: [tank.id] })).id)
  const [aStep, bStep] = [stepOf(a, 'Carb'), stepOf(b, 'Brew day')]

  const check = async (p: Page, named: SBatch, other: SBatch, namedStep: number, otherStep: number) => {
    await expect(p.getByTestId(`gantt-caret-${tank.id}`)).toHaveAttribute('aria-expanded', 'true')
    await expect(p.getByTestId(`gantt-label-by-${tank.id}`)).toHaveValue(String(named.id))
    await expect(p.getByTestId(`gantt-step-row-${namedStep}`)).toBeVisible()
    await expect(p.getByTestId(`gantt-step-batch-${namedStep}`)).toHaveCount(0)
    await expect(p.getByTestId(`gantt-step-batch-${otherStep}`)).toHaveText(other.label)
  }

  await openGantt(page)
  let saved = viewSaved(page)
  await page.getByTestId(`gantt-caret-${tank.id}`).click()
  await saved
  const picker = page.getByTestId(`gantt-label-by-${tank.id}`)
  await expect(picker.locator('option')).toHaveText([a.label, b.label])
  saved = viewSaved(page)
  await picker.selectOption(String(b.id))
  await saved
  await check(page, b, a, bStep.id, aStep.id)

  // On the account: after a reload, and in a second browser (its own storage).
  await page.reload()
  await check(page, b, a, bStep.id, aStep.id)
  const me = (await (await (await apiAs('brewer1')).get('/api/me')).json()).board_settings.production
  expect(me.expanded).toContain(String(tank.id))
  expect(me.label_by).toMatchObject({ [String(tank.id)]: b.id })

  const other = await browser.newContext({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1200 } })
  try {
    const p2 = await other.newPage()
    await openGantt(p2)
    await check(p2, b, a, bStep.id, aStep.id)
    // Picking A there comes back here on a reload.
    saved = viewSaved(p2)
    await p2.getByTestId(`gantt-label-by-${tank.id}`).selectOption(String(a.id))
    await saved
  } finally {
    await other.close()
  }
  await page.reload()
  await check(page, a, b, aStep.id, bStep.id)
})

test('S20 (4950): Pencil in from the batch dialog, then Ctrl/Cmd+Z with the dialog open: Undo runs; the snackbar stays, clear of the title', async ({ page }) => {
  const tank = await made.tank('FV')
  const b = await batchOf((await made.plan({ brand_id: (await made.brand('S20')).id, template: ALE, brew_on: addDays(today(), 10), tank_ids: [tank.id] })).id)
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  const dialog = page.getByTestId('batch-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('batch-pencil').click()
  await expect(snack(page)).toContainText('is pencilled in.')
  await expect(dialog).toBeVisible()
  expect(((await (await (await apiAs('brewer1')).get(`${P}/schedule?from=${today()}&to=${addDays(today(), 60)}`)).json()).data.batches as { id: number; pencilled: boolean }[]).find((x) => x.id === b.id)!.pencilled).toBe(true)

  // C: at the bottom, clear of the dialog's title. B: still there after the 6 seconds it used to hide at.
  const [bar, title] = [(await page.getByTestId('gantt-snack-text').locator('xpath=ancestor::*[contains(@class,"MuiSnackbarContent-root")][1]').boundingBox())!, (await page.getByTestId('batch-dialog-title').boundingBox())!]
  expect(bar.y).toBeGreaterThan(title.y + title.height)
  expect(bar.y + bar.height).toBeGreaterThan(page.viewportSize()!.height / 2)
  await expect(page.getByTestId('gantt-snack-hint')).toHaveText(/Ctrl\+Z|⌘Z/)
  await page.waitForTimeout(7000)
  await expect(page.getByTestId('gantt-undo')).toBeVisible()

  // A: the shortcut, with focus in the dialog.
  await dialog.focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(snack(page)).toHaveText('Undone.')
  await page.reload()
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId('batch-dialog-sub')).toContainText('planned')
  await expect(page.getByTestId('batch-dialog-sub')).not.toContainText('pencilled')
})
