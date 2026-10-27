import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, createTemplate, retireAll, stepTypes, tempTag, template } from './helpers'
import { addDays, addProcess, Made, openGantt, schedule, snack, today, undo, type SBatch } from './schedule'

// D49 §3.12a Clean not sanitized: the Mark… list (mockup B), the CIP
// variants (CIP & Sanitize, CIP - no sani, Sanitize) and the soft "Filling a
// tank that isn't sanitized" flag: P122–P129. The rules in full are in
// ExUnit (clean_not_sanitized_test). The board title (P125) is D49 task 3.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())

/** A standalone CIP through the API (`method` its variant), cleaned up with the spec's tanks. */
async function cip(tankId: number, day: string, method: string, done = false) {
  const res = await (await apiAs('brewer1')).post(`${P}/cips`, { data: { tank_id: tankId, due_on: day, cip_method: method, already_done: done } })
  expect(res.status()).toBe(201)
  const id = (await res.json()).data.cip.id as number
  made.cips.push(id)
  return id
}

async function mark(tankId: number, state: string, day: string) {
  const res = await (await apiAs('brewer1')).post(`${P}/tanks/${tankId}/condition`, { data: { state, marked_on: day } })
  expect(res.status()).toBe(201)
}

/** A batch from the seed ale brewing `brewIn` days from today in `tankId`. */
async function fill(tankId: number, brewIn: number, label = 'Fest'): Promise<SBatch> {
  const brand = await made.brand(label)
  return made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewIn), tank_ids: [tankId] })
}

const tankFlags = async (tankId: number) => (await schedule()).flags.filter((f) => f.tank_id === tankId && !f.signed_off).map((f) => f.kind).sort()
const status = (page: Page, tankId: number) => page.getByTestId(`gantt-status-${tankId}`)

async function openPanel(page: Page, tankId: number) {
  await page.getByTestId(`gantt-tank-menu-${tankId}`).click()
  await expect(page.getByTestId('tank-panel')).toBeVisible()
}

/** Add process ▾ → CIP… in `tankId` today, `method`, already done. */
async function addCipDone(page: Page, tankId: number, method: string) {
  await addProcess(page, 'cip')
  await page.getByTestId(`cip-method-${method}`).check()
  await page.getByTestId('cip-tank').click()
  await page.getByTestId(`cip-tank-${tankId}`).click()
  await page.getByTestId('cip-done').check()
  await page.getByTestId('cip-add-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('cip-add-dialog')).toBeHidden()
}

test('P122: Sani 40 days → Mark… → Clean not sanitized: "Clean no sani 0 days" in amber, a marker; Undo puts it back', async ({ page }) => {
  const s1 = await made.tank('Serving 1', 30)
  await cip(s1.id, addDays(today(), -40), 'sanitize_full', true)
  await openGantt(page)
  await expect(status(page, s1.id)).toHaveText('Sani 40 days')

  await openPanel(page, s1.id)
  // Mockup B: three large rows; the current state's greyed out.
  for (const key of ['clean', 'cleaned', 'dirty']) expect((await page.getByTestId(`tank-panel-mark-as-${key}`).boundingBox())!.height).toBeGreaterThanOrEqual(56)
  await expect(page.getByTestId('tank-panel-mark-as-clean')).toBeDisabled()
  await expect(page.getByTestId('tank-panel-mark-as-clean')).toContainText('Current state')
  await expect(page.getByTestId('tank-panel-mark-save')).toBeDisabled()
  await page.getByTestId('tank-panel-mark-as-cleaned').click()
  await expect(page.getByTestId('mark-day')).toHaveValue(today())
  await page.getByTestId('tank-panel-mark-save').click()
  await expect(snack(page)).toHaveText(new RegExp(`^${s1.name.replace(/[[\]]/g, '\\$&')} marked clean not sanitized \\(`))
  await expect(status(page, s1.id)).toHaveText('Clean no sani 0 days')
  // Its row is now the current one.
  await expect(page.getByTestId('tank-panel-mark-as-cleaned')).toBeDisabled()
  await page.getByTestId('tank-panel').getByRole('button', { name: 'Close' }).click()

  // Amber (warning), as the dirty line is.
  const color = await status(page, s1.id).evaluate((el) => getComputedStyle(el).color)
  const sched = await schedule()
  expect(sched.statuses.find((s) => s.tank_id === s1.id)).toMatchObject({ state: 'cleaned', alert: false })
  expect(color).not.toBe(await page.getByTestId('gantt-inner').evaluate((el) => getComputedStyle(el).color))
  const m = (await (await apiAs('brewer1')).get(`${P}/schedule`).then((r) => r.json())).data.condition_marks.find((x: { tank_id: number }) => x.tank_id === s1.id)
  await expect(page.getByTestId(`gantt-mark-${m.id}`)).toHaveAttribute('data-state', 'cleaned')

  await undo(page)
  await expect(status(page, s1.id)).toHaveText('Sani 40 days')
})

test('P123: a fill after it is flagged "isn\'t sanitized" (soft): sign off; a done CIP & Sanitize before it clears it', async ({ page }) => {
  const s1 = await made.tank('Serving 1', 30)
  await cip(s1.id, addDays(today(), -40), 'sanitize_full', true)
  await mark(s1.id, 'cleaned', today())
  const b = await fill(s1.id, 7, 'Oktoberfest')
  expect(await tankFlags(s1.id)).toEqual(['unsanitized_fill'])

  await openGantt(page)
  await page.getByTestId('gantt-flags').click()
  const row = page.getByTestId(`flag-unsanitized_fill:${b.id}.0`)
  await expect(row).toContainText(`${b.label} fills ${s1.name}, which isn't sanitized.`)
  await row.getByTestId('flag-ok').click()
  await expect(row.getByTestId('flag-signed-by')).toBeVisible()
  await page.getByTestId('flags-close').click()
  expect(await tankFlags(s1.id)).toEqual([])

  // A done CIP & Sanitize today: no flag at all, and "Sani 0 days".
  await addCipDone(page, s1.id, 'sanitize_full')
  await expect(snack(page)).toHaveText(`CIP & Sanitize recorded in ${s1.name}.`)
  await expect(status(page, s1.id)).toHaveText('Sani 0 days')
  expect((await schedule()).flags.filter((f) => f.tank_id === s1.id)).toEqual([])
})

test('P124: a dirty tank → Mark… → Clean not sanitized: the dirty flags clear', async ({ page }) => {
  const fv = await made.tank('FV5')
  await mark(fv.id, 'dirty', addDays(today(), -1))
  expect(await tankFlags(fv.id)).toEqual(['dirty_no_cip'])
  await openGantt(page)
  await expect(status(page, fv.id)).toHaveText('Empty · dirty 1 day · no CIP planned')

  await openPanel(page, fv.id)
  await expect(page.getByTestId('tank-panel-mark-as-dirty')).toBeDisabled()
  await page.getByTestId('tank-panel-mark-as-cleaned').click()
  await page.getByTestId('mark-note').fill('Rinsed, no sani')
  await page.getByTestId('tank-panel-mark-save').click()
  await expect(status(page, fv.id)).toHaveText('Clean no sani 0 days')
  await expect(page.getByTestId('tank-panel-history')).toContainText('Clean not sanitized')
  expect(await tankFlags(fv.id)).toEqual([])
})

test('P125: Add process ▾ → CIP… → CIP - no sani, already done, on a dirty tank: Clean no sani, no dirty flags', async ({ page }) => {
  const s1 = await made.tank('Serving 1', 30)
  await mark(s1.id, 'dirty', addDays(today(), -1))
  await openGantt(page)
  await addCipDone(page, s1.id, 'no_sani')
  await expect(snack(page)).toHaveText(`CIP - no sani recorded in ${s1.name}.`)
  await expect(status(page, s1.id)).toHaveText('Clean no sani 0 days')
  expect(await tankFlags(s1.id)).toEqual([])
  const c = (await schedule()).cips.find((x) => x.tank_id === s1.id)!
  expect(c.name).toBe('CIP - no sani')
})

test('P126: a batch\'s exit CIP switched to CIP - no sani in the step dialog; the next fill isn\'t sanitized, not dirty', async ({ page }) => {
  const fv = await made.tank('FV6')
  const first = await fill(fv.id, 3, 'Galactic')
  const exitCip = first.steps.find((s) => s.behavior === 'cip')!
  // Brewed the day after Galactic's exit CIP.
  await fill(fv.id, Math.round((Date.parse(exitCip.due_on) - Date.parse(today())) / 86_400_000) + 1, 'Crusher')
  expect(await tankFlags(fv.id)).toEqual([])

  await openGantt(page)
  await page.getByTestId(`gantt-bar-${first.id}-0`).click()
  await page.getByTestId(`batch-step-note-${exitCip.id}`).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-cip-method').click()
  await page.getByTestId('step-cip-method-no_sani').click()
  await page.getByTestId('step-dialog-save').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()

  const after = (await schedule()).batches.find((b) => b.id === first.id)!
  expect(after.steps.find((s) => s.id === exitCip.id)!.name).toBe('CIP - no sani')
  expect(await tankFlags(fv.id)).toEqual(['unsanitized_fill'])
})

test('P127: Clean no sani 2 days → Add process ▾ → CIP… → Sanitize, done: Sani 0 days; a fill after it has no flags', async ({ page }) => {
  const s1 = await made.tank('Serving 1', 30)
  await mark(s1.id, 'dirty', addDays(today(), -3))
  await cip(s1.id, addDays(today(), -2), 'no_sani', true)
  await openGantt(page)
  await expect(status(page, s1.id)).toHaveText('Clean no sani 2 days')

  await addCipDone(page, s1.id, 'sanitize')
  await expect(snack(page)).toHaveText(`Sanitize recorded in ${s1.name}.`)
  await expect(status(page, s1.id)).toHaveText('Sani 0 days')
  await fill(s1.id, 3)
  expect((await schedule()).flags.filter((f) => f.tank_id === s1.id)).toEqual([])
})

test('P128: a planned CIP - no sani, then a Sanitize, then a fill: no flags; delete the Sanitize → isn\'t sanitized', async ({ page }) => {
  const fv = await made.tank('FV7')
  await mark(fv.id, 'dirty', addDays(today(), -1))
  await cip(fv.id, addDays(today(), 1), 'no_sani')
  const sanitize = await cip(fv.id, addDays(today(), 2), 'sanitize')
  await fill(fv.id, 3, 'Enos')
  expect(await tankFlags(fv.id)).toEqual([])

  await openGantt(page)
  await page.getByTestId(`gantt-cip-${sanitize}`).click()
  await expect(page.getByTestId('step-dialog-name')).toHaveText(`Sanitize · ${fv.name}`)
  await page.getByTestId('cip-delete').click()
  await page.getByRole('dialog', { name: 'Delete Sanitize' }).getByRole('button', { name: 'Delete' }).click()
  await expect(snack(page)).toHaveText('Sanitize deleted.')
  expect(await tankFlags(fv.id)).toEqual(['unsanitized_fill'])
})

test('P129: a Sanitize done on a dirty tank (empty-spot menu): still dirty; the step dialog says to run a CIP first', async ({ page }) => {
  const fv = await made.tank('FV8')
  await mark(fv.id, 'dirty', addDays(today(), -1))
  await openGantt(page)

  // The empty-spot menu's Add CIP… opens the same dialog, on that tank.
  const lane = page.getByTestId(`gantt-lane-${fv.id}`)
  await page.getByTestId(`gantt-tank-name-${fv.id}`).scrollIntoViewIfNeeded()
  const box = (await lane.boundingBox())!
  const from = await page.getByTestId('gantt-from').inputValue()
  const px = box.width / (Math.round((Date.parse(await page.getByTestId('gantt-to').inputValue()) - Date.parse(from)) / 86_400_000) + 1)
  const offset = Math.round((Date.parse(today()) - Date.parse(from)) / 86_400_000)
  await page.mouse.click(box.x + px * (offset + 0.5), box.y + box.height - 4)
  await expect(page.getByTestId('spot-cip')).toHaveText('Add CIP…')
  await page.getByTestId('spot-cip').click()
  await expect(page.getByTestId('cip-tank')).toContainText(fv.name)
  await page.getByTestId('cip-day').fill(today())
  await page.getByTestId('cip-method-sanitize').check()
  await page.getByTestId('cip-done').check()
  await page.getByTestId('cip-add-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toHaveText(`Sanitize recorded in ${fv.name}.`)

  await expect(status(page, fv.id)).toHaveText('Empty · dirty 1 day · no CIP planned')
  const s = (await schedule()).cips.find((c) => c.tank_id === fv.id)!
  await page.getByTestId(`gantt-cip-${s.id}`).click()
  await expect(page.getByTestId('step-sanitize-dirty')).toHaveText('The tank was dirty: run a CIP first.')
})

test('Templates: a CIP entry takes the variant; its name follows ("CIP - no sani")', async ({ page }) => {
  const t = await createTemplate(tempTag('No-sani ale'))
  try {
    const cipType = (await stepTypes()).find((x) => x.name === 'CIP & Sanitize')!
    await page.goto(`/brewery/production/templates/${t.id}`)
    await page.getByTestId('template-add-step').click()
    await page.getByTestId('entry-type').click()
    await page.getByTestId(`entry-type-${cipType.id}`).click()
    await page.getByTestId('entry-cip-method').click()
    await page.getByTestId('entry-cip-method-no_sani').click()
    await expect(page.getByTestId('entry-dialog')).toContainText('“CIP - no sani” stays')
    await page.getByTestId('entry-day').fill('20')
    await page.getByTestId('entry-dialog-save').click()
    await expect(page.getByTestId('entry-dialog')).toBeHidden()
    const saved = (await template(t.id)).steps.find((x) => x.name === 'CIP - no sani') as { id: number; cip_method?: string } | undefined
    expect(saved?.cip_method).toBe('no_sani')
    await expect(page.getByTestId(`entry-name-${saved!.id}`)).toHaveText('CIP - no sani')
  } finally {
    await retireAll('templates', [t.id])
  }
})
