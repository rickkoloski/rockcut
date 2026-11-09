import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addTemplateStep, createTemplate, retireAll, stepTypes, template, tempTag } from './helpers'
import { addDays, batchOf, Made, openGantt, snack, stepOf, today, undo, type SBatch } from './schedule'

// D50 §2.6 and §2.7 as breweryMgr: L1 (a template link picked and Saved is
// kept; a refused Save links nothing), L2 (a batch step's links: add with
// Save, Remove, each undone), L3 (what would loop or run backwards isn't
// offered). L4 (the device, with a code) is in d50-brewhouse-device.spec.ts.

test.use({ storageState: authFile('breweryMgr'), viewport: { width: 1440, height: 1200 } })

const ALE = '[SEED] Standard ale'
const made = new Made()
const templates: number[] = []

test.afterAll(async () => {
  await made.cleanup()
  await retireAll('templates', templates)
})

async function ale(label: string, brewOffset: number): Promise<SBatch> {
  const brand = await made.brand(label)
  const tank = await made.tank('FV')
  return batchOf((await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewOffset), tank_ids: [tank.id] })).id)
}

/** A template: Brew day; PDH day 7 and FDH day 13, each after Brew day, not linked to each other. */
async function pdhFdh() {
  const types = await stepTypes()
  const id = (name: string) => types.find((t) => t.name === name && !t.retired_at)!.id
  let t = await createTemplate(tempTag('D50 links'))
  templates.push(t.id)
  const brew = t.steps[0]
  t = await addTemplateStep(t.id, { step_type_id: id('PDH'), day_offset: 7, vessel_index: 0, comes_after_id: brew.id })
  t = await addTemplateStep(t.id, { step_type_id: id('FDH'), day_offset: 13, vessel_index: 0, comes_after_id: brew.id })
  const by = (name: string) => t.steps.find((s) => s.name === name)!
  return { t, pdh: by('PDH'), fdh: by('FDH') }
}

async function pickIn(page: Page, select: string, option: string) {
  await page.getByTestId(select).click()
  await page.getByTestId(option).click()
}

test('L1 (§2.6): pick "Add: leads to" FDH on PDH and press Save: the link is there after a reload', async ({ page }) => {
  const { t, pdh, fdh } = await pdhFdh()
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId(`entry-edit-${pdh.id}`).click()
  // The Links section sits above Notes now.
  const dialog = page.getByTestId('entry-dialog')
  const [links, notes] = [await dialog.getByTestId('links-editor').boundingBox(), await dialog.getByTestId('entry-notes').boundingBox()]
  expect(links!.y).toBeLessThan(notes!.y)

  await pickIn(page, 'link-new-leads', `link-new-leads-${fdh.id}`)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await page.reload()
  await expect(page.getByTestId(`entry-links-${fdh.id}`)).toContainText('after PDH')
  expect((await template(t.id)).links.some((l) => l.from_step_id === pdh.id && l.to_step_id === fdh.id)).toBe(true)
})

test('L1: a Save the server refuses links nothing, and says why', async ({ page }) => {
  const { t, pdh, fdh } = await pdhFdh()
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId(`entry-edit-${pdh.id}`).click()
  await pickIn(page, 'link-new-leads', `link-new-leads-${fdh.id}`)
  await page.route(`**/api/production/templates/${t.id}/steps/${pdh.id}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'link_cycle', message: 'That link would go in a circle.' }) })
      : route.continue(),
  )
  const dialog = page.getByTestId('entry-dialog')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toContainText('That link would go in a circle.')
  await expect(dialog).toBeVisible()
  expect((await template(t.id)).links.some((l) => l.from_step_id === pdh.id && l.to_step_id === fdh.id)).toBe(false)
})

test('L2 (§2.7): add "Comes after" with Save, then Remove another; each Undo puts it back', async ({ page }) => {
  const b = await ale('Galactic', 2)
  const [pdh, carb] = [stepOf(b, 'PDH'), stepOf(b, 'Carb')]
  const into = b.links.find((l) => l.to_step_id === carb.id)!
  await openGantt(page)

  // Add: PDH → Carb, saved with Save.
  await page.getByTestId(`gantt-step-${carb.id}`).click()
  await pickIn(page, 'step-link-new-after', `step-link-new-after-${pdh.id}`)
  await page.getByTestId('step-dialog-save').click()
  await expect(snack(page)).toHaveText('Saved.')
  let links = (await batchOf(b.id)).links
  expect(links.some((l) => l.from_step_id === pdh.id && l.to_step_id === carb.id)).toBe(true)
  await undo(page)
  links = (await batchOf(b.id)).links
  expect(links.some((l) => l.from_step_id === pdh.id && l.to_step_id === carb.id)).toBe(false)

  // Remove the link into Carb it had (Save closed the dialog).
  await expect(page.getByTestId('step-dialog')).toHaveCount(0)
  await page.getByTestId(`gantt-step-${carb.id}`).click()
  await page.getByTestId(`step-link-remove-${into.id}`).click()
  await page.getByRole('button', { name: 'Remove' }).last().click()
  await expect(snack(page)).toHaveText('Link removed.')
  expect((await batchOf(b.id)).links.some((l) => l.id === into.id)).toBe(false)
  await undo(page)
  expect((await batchOf(b.id)).links.some((l) => l.id === into.id)).toBe(true)
})

test('L3: the pickers don’t offer a loop or a "comes after" on a later day', async ({ page }) => {
  const b = await ale('Crusher', 2)
  const [fdh, pkg, pdh] = [stepOf(b, 'FDH'), stepOf(b, 'Package'), stepOf(b, 'PDH')]
  await openGantt(page)
  await page.getByTestId(`gantt-step-${fdh.id}`).click()
  await page.getByTestId('step-link-new-after').click()
  // Package follows FDH (a loop), and is later: never offered as "comes after".
  await expect(page.getByTestId(`step-link-new-after-${pkg.id}`)).toHaveCount(0)
  // PDH is earlier and doesn't follow it: offered.
  await expect(page.getByTestId(`step-link-new-after-${pdh.id}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByTestId('step-link-new-leads').click()
  // Brew day is never "leads to"; PDH is earlier.
  await expect(page.getByTestId(`step-link-new-leads-${stepOf(b, 'Brew day').id}`)).toHaveCount(0)
  await expect(page.getByTestId(`step-link-new-leads-${pdh.id}`)).toHaveCount(0)
})
