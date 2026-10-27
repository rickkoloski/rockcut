import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { contrastOf } from '../ui/contrast'
import {
  addDays,
  addOutage,
  addTemplateStep,
  apiAs,
  createTank,
  createTemplate,
  denverToday,
  retireAll,
  retireTanks,
  shortTag,
  stepTypes,
  phases,
  tempTag,
  template,
  templates,
} from './helpers'

// D46 DEV gate fix cycle 2: the QA report's must-fix M1 and minors 1–3 and
// 5–9 (`stepwise_results/d46_qa_report.md`, `prompts/d46_lead_decisions_3.md`).
// The API rules behind M1 and minors 4 and 8 are ExUnit's (`production_test`).

test.use({ storageState: authFile('brewer1') })

const madeTemplates: number[] = []
const madeTanks: number[] = []
test.afterAll(async () => {
  await retireAll('templates', madeTemplates.splice(0))
  await retireTanks(madeTanks.splice(0))
})

let typeId: Record<string, number> = {}
let phaseId: Record<string, number> = {}
test.beforeAll(async () => {
  typeId = Object.fromEntries((await stepTypes()).map((t) => [t.name, t.id]))
  phaseId = Object.fromEntries((await phases()).map((p) => [p.name, p.id]))
})

/** Brew day; FDH day 13 after it; Carb day 23 after FDH; Transfer into tank 1 on day 35 (with its CIP). */
async function transferTemplate(label: string) {
  const t = await createTemplate(tempTag(label))
  madeTemplates.push(t.id)
  const brew = t.steps[0].id
  let full = await addTemplateStep(t.id, { step_type_id: typeId['FDH'], day_offset: 13, comes_after_id: brew })
  const fdh = full.steps.find((s) => s.name === 'FDH')!.id
  full = await addTemplateStep(t.id, { step_type_id: typeId['Carb'], day_offset: 23, comes_after_id: fdh })
  const carb = full.steps.find((s) => s.name === 'Carb')!.id
  full = await addTemplateStep(t.id, { step_type_id: typeId['Transfer'], day_offset: 35, vessel_index: 1 })
  const xfer = full.steps.find((s) => s.name === 'Transfer')!.id
  return { id: t.id, brew, fdh, carb, xfer }
}

async function pickType(page: Page, name: string) {
  await page.getByTestId('entry-type').click()
  await page.getByTestId(`entry-type-${typeId[name]}`).click()
}

/** The option test ids an open MUI select shows (then closes it). */
async function optionIds(page: Page, selectTestId: string): Promise<string[]> {
  await page.getByTestId(selectTestId).click()
  const ids = await page.getByRole('option').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? ''))
  await page.keyboard.press('Escape')
  return ids
}

test.describe('M1: a Transfer/Filter goes into a new tank', () => {
  test('"Into tank" offers only the next new tank; its CIP goes on the tank it leaves', async ({ page }) => {
    const t = await transferTemplate('M1 transfer')
    await page.goto(`/brewery/production/templates/${t.id}`)
    await page.getByTestId('template-add-step').click()
    await pickType(page, 'Filter')
    await page.getByTestId('entry-day').fill('39')
    await expect(page.getByTestId('entry-dialog').locator('label', { hasText: /^Into tank$/ })).toBeVisible()
    await expect(page.getByTestId('entry-tank')).toHaveText('After transfer 2')
    expect(await optionIds(page, 'entry-tank')).toEqual(['entry-tank-2'])
    await expect(page.getByTestId('entry-dialog')).toContainText('Moves the beer out of the tank after transfer 1 into a new tank.')
    await page.getByTestId('entry-dialog-save').click()
    await expect(page.getByTestId('entry-dialog')).toBeHidden()

    const saved = await template(t.id)
    const filter = saved.steps.find((s) => s.name === 'Filter')!
    expect(filter.vessel_index).toBe(2)
    const cips = saved.steps.filter((s) => s.name === 'CIP & Sanitize').map((s) => [s.day_offset, s.vessel_index])
    expect(cips).toEqual([
      [35, 0],
      [39, 1],
    ])
    await page.reload()
    const cip39 = saved.steps.find((s) => s.name === 'CIP & Sanitize' && s.day_offset === 39)!
    await expect(page.getByTestId(`entry-tank-${cip39.id}`)).toHaveText('After transfer 1')
    await expect(page.getByTestId(`entry-tank-${filter.id}`)).toHaveText('After transfer 2')
  })

  test('other steps choose only existing tanks; switching the type leaves their tank alone', async ({ page }) => {
    const t = await transferTemplate('M1 tanks')
    await page.goto(`/brewery/production/templates/${t.id}`)
    await page.getByTestId('template-add-step').click()
    await pickType(page, 'Gravity check')
    await page.getByTestId('entry-day').fill('37')
    expect(await optionIds(page, 'entry-tank')).toEqual(['entry-tank-0', 'entry-tank-1'])
    await page.getByTestId('entry-tank').click()
    await page.getByTestId('entry-tank-1').click()

    await pickType(page, 'Transfer')
    await expect(page.getByTestId('entry-tank')).toHaveText('After transfer 2')
    await pickType(page, 'Gravity check')
    await expect(page.getByTestId('entry-tank')).toHaveText('After transfer 1')
    await expect(page.getByTestId('entry-dialog').locator('label', { hasText: /^Tank$/ })).toBeVisible()
    await expect(page.getByTestId('entry-dialog').locator('label', { hasText: /^Into tank$/ })).toHaveCount(0)
  })
})

test('minor 1: link pickers offer only steps the link can reach', async ({ page }) => {
  const t = await transferTemplate('m1 pickers')
  await page.goto(`/brewery/production/templates/${t.id}`)

  // Add step on day 15: comes after day ≤ 15, leads to day ≥ 15.
  await page.getByTestId('template-add-step').click()
  await pickType(page, 'Amylo')
  await page.getByTestId('entry-day').fill('15')
  expect(await optionIds(page, 'entry-after')).toEqual(['', `entry-after-${t.brew}`, `entry-after-${t.fdh}`])
  const leads = await optionIds(page, 'entry-leads')
  expect(leads).toContain(`entry-leads-${t.carb}`)
  expect(leads).not.toContain(`entry-leads-${t.fdh}`)
  expect(leads).not.toContain(`entry-leads-${t.brew}`)
  await page.getByTestId('entry-dialog-cancel').click()

  // Edit Carb (day 23, after FDH): "comes after" leaves out FDH (already linked) and later steps;
  // "leads to" leaves out earlier steps and anything Carb follows.
  await page.getByTestId(`entry-edit-${t.carb}`).click()
  const after = await optionIds(page, 'link-new-after')
  expect(after).toContain(`link-new-after-${t.brew}`)
  expect(after).not.toContain(`link-new-after-${t.fdh}`)
  expect(after).not.toContain(`link-new-after-${t.xfer}`)
  const next = await optionIds(page, 'link-new-leads')
  expect(next).toContain(`link-new-leads-${t.xfer}`)
  expect(next).not.toContain(`link-new-leads-${t.fdh}`)

  // FDH: Carb already follows it, so it isn't offered again.
  await page.getByTestId('entry-dialog-cancel').click()
  await page.getByTestId(`entry-edit-${t.fdh}`).click()
  expect(await optionIds(page, 'link-new-leads')).not.toContain(`link-new-leads-${t.carb}`)
})

test('minor 2: dialogs that save at once say Close; removing a link and deleting a period ask first', async ({ page }) => {
  const t = await transferTemplate('m2 close')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId(`entry-edit-${t.carb}`).click()
  await expect(page.getByTestId('entry-dialog-cancel')).toHaveText('Close')
  const link = (await template(t.id)).links.find((l) => l.from_step_id === t.fdh && l.to_step_id === t.carb)!
  await page.getByTestId(`link-remove-${link.id}`).click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Remove the link from FDH to Carb?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId(`link-row-${link.id}`)).toBeVisible()
  expect((await template(t.id)).links.some((l) => l.id === link.id)).toBe(true)

  const removed = page.waitForResponse((r) => r.url().endsWith(`/links/${link.id}`) && r.request().method() === 'DELETE')
  await page.getByTestId(`link-remove-${link.id}`).click()
  await page.getByRole('dialog').filter({ hasText: 'Remove the link from FDH to Carb?' }).getByRole('button', { name: 'Remove' }).click()
  expect((await removed).ok()).toBe(true)
  await expect(page.getByTestId(`link-row-${link.id}`)).toHaveCount(0)
  await page.getByTestId('entry-dialog-cancel').click()

  // Add step keeps Cancel.
  await page.getByTestId('template-add-step').click()
  await expect(page.getByTestId('entry-dialog-cancel')).toHaveText('Cancel')
  await page.getByTestId('entry-dialog-cancel').click()

  // The tank dialog (its periods save at once) says Close; Delete on a period asks.
  const tank = await createTank(shortTag('m2 tank'))
  madeTanks.push(tank.id)
  const o = await addOutage(tank.id, addDays(denverToday(), 3), addDays(denverToday(), 5))
  await page.goto('/brewery/production/tanks')
  await page.getByTestId(`tank-edit-${tank.id}`).click()
  await expect(page.getByTestId('tank-dialog').getByRole('button', { name: 'Close' })).toBeVisible()
  await page.getByTestId(`tank-outage-change-${o.id}`).click()
  await page.getByTestId('outage-delete').click()
  const ask = page.getByRole('dialog').filter({ hasText: 'Delete the out-of-service period' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('outage-dialog')).toBeVisible()
  const res = await (await apiAs('brewer1')).get('/api/production/tanks')
  expect(((await res.json()) as { data: { id: number; outages: unknown[] }[] }).data.find((x) => x.id === tank.id)!.outages).toHaveLength(1)
})

test('minor 3: an entry someone else removed: "removed by someone else" and Reload', async ({ page }) => {
  const t = await transferTemplate('m3 stale')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await expect(page.getByTestId(`entry-name-${t.carb}`)).toBeVisible()
  // Someone else removes Carb; this page still shows it.
  const gone = await (await apiAs('brewer2')).delete(`/api/production/templates/${t.id}/steps/${t.carb}`)
  expect(gone.status()).toBe(200)

  await page.getByTestId(`entry-edit-${t.carb}`).click()
  await page.getByTestId('entry-notes').fill('stale edit')
  await page.getByTestId('entry-dialog-save').click()
  await expect(page.getByTestId('entry-dialog-error')).toContainText('This was removed by someone else. Reload to see the latest.')
  await page.getByTestId('reload-after-gone').click()
  await expect(page.getByTestId(`entry-name-${t.fdh}`)).toBeVisible()
  await expect(page.getByTestId(`entry-name-${t.carb}`)).toHaveCount(0)
})

test('minor 5: the ramp preview keeps to 28–80°F and whole degrees', async ({ page }) => {
  const t = await transferTemplate('m5 ramp')
  const before = (await template(t.id)).steps.length
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId('template-add-ramp').click()
  await page.getByTestId('ramp-first-day').fill('18')
  await page.getByTestId('ramp-start').fill('90')
  await page.getByTestId('ramp-target').fill('20')
  await expect(page.getByTestId('ramp-preview')).toHaveText('Start and target are whole degrees from 28 to 80°F.')
  await page.getByTestId('ramp-dialog-save').click()
  await expect(page.getByTestId('ramp-dialog-error')).toHaveText('Start and target are whole degrees from 28 to 80°F.')

  await page.getByTestId('ramp-start').fill('34')
  await page.getByTestId('ramp-target').fill('30')
  await page.getByTestId('ramp-change').fill('0.5')
  await expect(page.getByTestId('ramp-preview')).toHaveText('The change per day is a whole number of degrees, at least 1.')
  await page.getByTestId('ramp-change').fill('2')
  await expect(page.getByTestId('ramp-preview')).toHaveText('3 Set temp steps: 34°, 32°, 30° on days 18–20.')
  await page.getByTestId('ramp-dialog-cancel').click()
  expect((await template(t.id)).steps).toHaveLength(before)
})

for (const mode of ['light', 'dark'] as const) {
  test(`minor 6: Out chips, the Now chip and the Incomplete badge read at 4.5:1 (${mode})`, async ({ page }) => {
    // This page only: /api/me says `mode` (nothing saved for the persona).
    await page.route('**/api/me', async (route) => {
      const res = await route.fetch()
      route.fulfill({ response: res, json: { ...(await res.json()), color_mode: mode } })
    })
    const now = await createTank(shortTag('m6 now'))
    const coming = await createTank(shortTag('m6 next'))
    madeTanks.push(now.id, coming.id)
    await addOutage(now.id, addDays(denverToday(), -1), null, 'Valve')
    await addOutage(coming.id, addDays(denverToday(), 4), addDays(denverToday(), 6))
    const t = await createTemplate(tempTag('m6 incomplete'))
    madeTemplates.push(t.id)

    await page.goto('/brewery/production/tanks')
    for (const id of [now.id, coming.id]) {
      const chip = page.getByTestId(`tank-out-chip-${id}`).locator('.MuiChip-label')
      expect(await contrastOf(chip), `chip ${id}`).toBeGreaterThanOrEqual(4.5)
    }
    await page.getByTestId(`tank-edit-${now.id}`).click()
    const nowChip = page.getByTestId('tank-outages-now').locator('.MuiChip-label')
    expect(await contrastOf(nowChip)).toBeGreaterThanOrEqual(4.5)
    await page.keyboard.press('Escape')

    await page.goto('/brewery/production/templates')
    const badge = page.getByTestId(`template-incomplete-${t.id}`).locator('.MuiChip-label')
    expect(await contrastOf(badge)).toBeGreaterThanOrEqual(4.5)
  })
}

test.describe('minor 7: phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the preview keeps its tank labels in view while it scrolls, with a fade where there is more', async ({ page }) => {
    const lager = (await templates()).find((x) => x.name === '[SEED] Lager with transfer')!
    await page.goto(`/brewery/production/templates/${lager.id}`)
    const scroller = page.getByTestId('preview-scroll')
    await scroller.scrollIntoViewIfNeeded()
    await expect(page.getByTestId('preview-scroll-hint')).toBeVisible()
    await expect(page.getByTestId('preview-scroll-hint-left')).toHaveCount(0)
    const box = (await scroller.boundingBox())!

    await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
    await expect(page.getByTestId('preview-scroll-hint')).toHaveCount(0)
    await expect(page.getByTestId('preview-scroll-hint-left')).toBeVisible()
    for (const k of [0, 1]) {
      const label = (await page.getByTestId(`preview-label-${k}`).boundingBox())!
      expect(label.x, `label ${k}`).toBeGreaterThanOrEqual(box.x - 1)
      expect(label.x).toBeLessThan(box.x + 10)
    }
    await expect(page.getByTestId('preview-label-1')).toHaveText('After transfer 1')
  })
})

test('minor 8: capacity of 10,000 bbl or more says so', async ({ page }) => {
  await page.goto('/brewery/production/tanks')
  await page.getByTestId('tank-add').click()
  await page.getByTestId('tank-name').fill(shortTag('m8 big'))
  await page.getByTestId('tank-capacity').fill('10000')
  await page.getByTestId('tank-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('tank-dialog')).toContainText('Capacity must be under 10,000 bbl.')
})

test('minor 9: Add phase start explains Comes after only', async ({ page }) => {
  const t = await transferTemplate('m9 marker')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId('template-add-marker').click()
  await expect(page.getByTestId('entry-dialog')).toContainText('Comes after: moving that step offers to move this one too.')
  await expect(page.getByTestId('entry-dialog')).not.toContainText('Leads to')
  expect(phaseId['Lag']).toBeGreaterThan(0)
})
