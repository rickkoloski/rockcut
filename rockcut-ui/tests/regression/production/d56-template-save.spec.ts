import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addTemplateStep, apiAs, createTemplate, retireAll, stepTypes, template, tempTag } from './helpers'

// D56 §3.5 (5210), S18 as breweryMgr: a template step and its new links are
// saved in one call, all or nothing. The pickers offer only links that can
// be made, so the refusal is a real race: the spec makes the second link
// through the API after it's picked.

test.use({ storageState: authFile('breweryMgr'), viewport: { width: 1440, height: 1200 } })

const P = '/api/production'
const templates: number[] = []
test.afterAll(() => retireAll('templates', templates))

/** Brew day; PDH day 7, FDH day 13 and Carb day 16, each after Brew day only. */
async function threeAfterBrew() {
  const types = await stepTypes()
  const id = (name: string) => types.find((t) => t.name === name && !t.retired_at)!.id
  let t = await createTemplate(tempTag('S18 links'))
  templates.push(t.id)
  const brew = t.steps[0]
  t = await addTemplateStep(t.id, { step_type_id: id('PDH'), day_offset: 7, vessel_index: 0, comes_after_id: brew.id })
  t = await addTemplateStep(t.id, { step_type_id: id('FDH'), day_offset: 13, vessel_index: 0, comes_after_id: brew.id })
  t = await addTemplateStep(t.id, { step_type_id: id('Carb'), day_offset: 16, vessel_index: 0, comes_after_id: brew.id })
  const by = (name: string) => t.steps.find((s) => s.name === name)!
  return { t, pdh: by('PDH'), fdh: by('FDH'), carb: by('Carb') }
}

async function pickIn(page: Page, select: string, option: string) {
  await page.getByTestId(select).click()
  await page.getByTestId(option).click()
}

const linked = async (id: number, from: number, to: number) => (await template(id)).links.some((l) => l.from_step_id === from && l.to_step_id === to)

test('S18: on FDH, a new day and two links picked (comes after PDH, leads to Carb); the server refuses the second: nothing saved, the error names it; the dialog reloads and a retry saves the rest', async ({ page }) => {
  const { t, pdh, fdh, carb } = await threeAfterBrew()
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId(`entry-edit-${fdh.id}`).click()
  const dialog = page.getByTestId('entry-dialog')
  await pickIn(page, 'link-new-after', `link-new-after-${pdh.id}`)
  await pickIn(page, 'link-new-leads', `link-new-leads-${carb.id}`)
  await page.getByTestId('entry-day').fill('14')

  // Meanwhile FDH → Carb is linked elsewhere.
  const api = await apiAs('breweryMgr')
  const made = await api.post(`${P}/templates/${t.id}/links`, { data: { from_step_id: fdh.id, to_step_id: carb.id } })
  expect(made.status(), await made.text()).toBe(201)

  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toContainText('Leads to Carb: Those steps are already linked.')
  await expect(dialog).toBeVisible()
  // Nothing saved: not the first link, not the day.
  let now = await template(t.id)
  expect(now.links.some((l) => l.from_step_id === pdh.id && l.to_step_id === fdh.id)).toBe(false)
  expect(now.steps.find((s) => s.id === fdh.id)!.day_offset).toBe(13)

  // DEV gap 6: the dialog reloaded the template: FDH → Carb shows as a link it has, and the
  // picker no longer offers it. Save again saves the day and the PDH link.
  await expect(page.getByTestId('links-editor')).toContainText('Carb')
  await page.getByTestId('link-new-leads').click()
  await expect(page.getByTestId(`link-new-leads-${carb.id}`)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await page.reload()
  await expect(page.getByTestId(`entry-links-${fdh.id}`)).toContainText('PDH')
  await expect(page.getByTestId(`entry-links-${carb.id}`)).toContainText('FDH')
  now = await template(t.id)
  expect(now.steps.find((s) => s.id === fdh.id)!.day_offset).toBe(14)
  expect(await linked(t.id, pdh.id, fdh.id)).toBe(true)
  expect(await linked(t.id, fdh.id, carb.id)).toBe(true)
})

test('DEV gap 6: Add step with Comes after FDH and Leads to Carb; Carb moved earlier meanwhile: the error names "Leads to Carb", nothing added, the dialog shows Carb’s new day; day 11 after PDH saves', async ({ page }) => {
  const { t, pdh, fdh, carb } = await threeAfterBrew()
  const dry = (await stepTypes()).find((s) => s.name === 'Dry hop' && !s.retired_at)!
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId('template-add-step').click()
  const dialog = page.getByTestId('entry-dialog')
  await pickIn(page, 'entry-type', `entry-type-${dry.id}`)
  await page.getByTestId('entry-day').fill('14')
  await pickIn(page, 'entry-after', `entry-after-${fdh.id}`)
  await pickIn(page, 'entry-leads', `entry-leads-${carb.id}`)

  // Meanwhile Carb moves to day 12, before the new step.
  const api = await apiAs('breweryMgr')
  const moved = await api.patch(`${P}/templates/${t.id}/steps/${carb.id}`, { data: { day_offset: 12 } })
  expect(moved.status(), await moved.text()).toBe(200)

  await dialog.getByRole('button', { name: 'Add' }).click()
  await expect(dialog).toContainText("Leads to Carb: A step can't come before the step it follows.")
  await expect(dialog).toBeVisible()
  expect((await template(t.id)).steps.some((s) => s.name === 'Dry hop')).toBe(false)
  // The template reloaded: Carb (day 12) is no longer offered after day 14, so the stale pick is gone.
  await page.getByTestId('entry-leads').click()
  await expect(page.getByTestId(`entry-leads-${carb.id}`)).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Day 11, before Carb's new day (so after PDH, not FDH): Add saves the step and both links.
  await page.getByTestId('entry-day').fill('11')
  await pickIn(page, 'entry-after', `entry-after-${pdh.id}`)
  await pickIn(page, 'entry-leads', `entry-leads-${carb.id}`)
  await dialog.getByRole('button', { name: 'Add' }).click()
  await expect(dialog).toBeHidden()
  await page.reload()
  const now = await template(t.id)
  const added = now.steps.find((s) => s.name === 'Dry hop')!
  expect(await linked(t.id, pdh.id, added.id)).toBe(true)
  expect(await linked(t.id, added.id, carb.id)).toBe(true)
  await expect(page.getByTestId(`entry-name-${added.id}`)).toBeVisible()
})
