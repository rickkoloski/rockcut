import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addTemplateStep, createTemplate, phases, retireAll, stepTypes, tempTag, template, templates } from './helpers'

// D46 §3.4 templates and the editor: P14–P18. Every template here is a
// [TEST-TEMP] one (the P18 copy is renamed to one) and is retired afterwards.

test.use({ storageState: authFile('brewer1') })

const made: number[] = []
test.afterAll(async () => {
  await retireAll('templates', made.splice(0))
})

let typeId: Record<string, number> = {}
let phaseId: Record<string, number> = {}
test.beforeAll(async () => {
  typeId = Object.fromEntries((await stepTypes()).map((t) => [t.name, t.id]))
  phaseId = Object.fromEntries((await phases()).map((p) => [p.name, p.id]))
})

interface Entry {
  type?: string
  /** A phase start (marker) for this phase. */
  marker?: string
  day: number
  tank?: number
  temperature?: number
  /** The phase a step starts, when not its type's. */
  phase?: string
  notes?: string
  /** Name of the entry it comes after (the newest with that name). */
  after?: string
}

/** Add one entry through Add step / Add phase start. */
async function addEntry(page: Page, templateId: number, e: Entry) {
  await page.getByTestId(e.marker ? 'template-add-marker' : 'template-add-step').click()
  const dialog = page.getByTestId('entry-dialog')
  if (e.type) {
    await page.getByTestId('entry-type').click()
    await page.getByTestId(`entry-type-${typeId[e.type]}`).click()
  }
  if (e.temperature != null) await page.getByTestId('entry-temperature').fill(String(e.temperature))
  await page.getByTestId('entry-day').fill(String(e.day))
  if (e.tank) {
    await page.getByTestId('entry-tank').click()
    await page.getByTestId(`entry-tank-${e.tank}`).click()
  }
  const phase = e.marker ?? e.phase
  if (phase) {
    await page.getByTestId('entry-phase').click()
    await page.getByTestId(`entry-phase-${phaseId[phase]}`).click()
  }
  if (e.after) {
    const steps = (await template(templateId)).steps.filter((s) => s.name === e.after)
    await page.getByTestId('entry-after').click()
    await page.getByTestId(`entry-after-${steps[steps.length - 1].id}`).click()
  }
  if (e.notes) await page.getByTestId('entry-notes').fill(e.notes)
  await page.getByTestId('entry-dialog-save').click()
  await expect(dialog).toBeHidden()
}

async function rowNames(page: Page) {
  await expect(page.locator('[data-testid^="entry-name-"]').first()).toBeVisible()
  return page.locator('[data-testid^="entry-name-"]').allInnerTexts()
}

test('P14: build "Lager with transfer" in the editor; saved in day order with the CIP; preview in color', async ({ page }) => {
  test.setTimeout(120_000)
  const name = tempTag('Lager with transfer')
  await page.goto('/brewery/production/templates')
  await page.getByTestId('template-new').click()
  await page.getByTestId('template-name').fill(name)
  await page.getByTestId('template-name-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/brewery\/production\/templates\/\d+$/)
  const id = Number(page.url().split('/').pop())
  made.push(id)
  await expect(page.getByTestId('template-issues')).toContainText('The first tank has no Package, Split or Transfer.')

  const notes = 'Forced test: hold a sample at 140°F for 20 minutes.'
  const entries: Entry[] = [
    { marker: 'Lag', day: 1, after: 'Brew day' },
    { marker: 'Fermentation', day: 2, after: 'Lag' },
    { type: 'Set temp', day: 12, temperature: 65, phase: 'Diacetyl rest', after: 'Brew day' },
    { type: 'Diacetyl test', day: 15, notes, after: 'Set temp - 65°' },
    { type: 'Set temp', day: 16, temperature: 40, phase: 'Crash', after: 'Diacetyl test' },
    { marker: 'Lagering', day: 17, after: 'Set temp - 40°' },
    { type: 'Set temp', day: 31, temperature: 30, phase: 'Crash', after: 'Lagering' },
    { marker: 'Conditioning', day: 33, after: 'Set temp - 30°' },
    { type: 'Transfer', day: 35, tank: 1, after: 'Conditioning' },
    { type: 'Carb', day: 36, tank: 1, after: 'Transfer' },
    { marker: 'Conditioning', day: 38, tank: 1, after: 'Carb' },
    { type: 'Package', day: 40, tank: 1, after: 'Conditioning' },
  ]
  for (const e of entries) await addEntry(page, id, e)

  const expected = [
    'Brew day',
    'Lag starts',
    'Fermentation starts',
    'Set temp - 65°',
    'Diacetyl test',
    'Set temp - 40°',
    'Lagering starts',
    'Set temp - 30°',
    'Conditioning starts',
    'Transfer',
    'CIP & Sanitize',
    'Carb',
    'Conditioning starts',
    'Package',
  ]
  await page.reload()
  await expect(page.getByTestId('template-entries')).toBeVisible()
  expect(await rowNames(page)).toEqual(expected)
  await expect(page.getByTestId('template-issues')).toHaveCount(0)

  const saved = await template(id)
  const cip = saved.steps.find((s) => s.name === 'CIP & Sanitize')!
  expect(cip).toMatchObject({ day_offset: 35, vessel_index: 0 })
  await expect(page.getByTestId(`entry-tank-${cip.id}`)).toHaveText('First tank')
  const dtest = saved.steps.find((s) => s.name === 'Diacetyl test')!
  expect(dtest.notes).toBe(notes)
  await expect(page.getByTestId(`entry-notes-${dtest.id}`)).toBeVisible()
  const carb = saved.steps.find((s) => s.name === 'Carb')!
  await expect(page.getByTestId(`entry-phase-${carb.id}`)).toHaveText('Carbonating')
  expect(saved.steps.find((s) => s.name === 'Lag')!.on_task_list).toBe(false)

  // The preview: two bars, colored by phase, CIP days hatched.
  const preview = page.getByTestId('template-preview')
  await expect(preview.getByTestId('preview-bar-0')).toBeVisible()
  await expect(preview.getByTestId('preview-bar-1')).toBeVisible()
  await expect(preview.getByTestId('preview-day-0-5')).toHaveAttribute('data-phase', 'Fermentation')
  await expect(preview.getByTestId('preview-day-0-20')).toHaveAttribute('data-phase', 'Lagering')
  await expect(preview.getByTestId('preview-day-0-35')).toHaveAttribute('data-phase', 'cip')
  await expect(preview.getByTestId('preview-day-1-36')).toHaveAttribute('data-phase', 'Carbonating')
  await expect(preview.getByTestId('preview-dot-0-15')).toBeVisible()
  await expect(page.getByTestId('preview-legend')).toContainText('Diacetyl rest')
})

/** A one-tank template: Brew day, FDH day 13 after it, Conditioning marker day 22 after FDH, Carb 23, Package 25. */
async function aleTemplate(label: string) {
  const t = await createTemplate(tempTag(label))
  made.push(t.id)
  const brew = t.steps[0].id
  let full = await addTemplateStep(t.id, { step_type_id: typeId['FDH'], day_offset: 13, comes_after_id: brew })
  const fdh = full.steps.find((s) => s.name === 'FDH')!.id
  full = await addTemplateStep(t.id, { phase_id: phaseId['Conditioning'], day_offset: 22, comes_after_id: fdh })
  const cond = full.steps.find((s) => s.name === 'Conditioning')!.id
  full = await addTemplateStep(t.id, { step_type_id: typeId['Carb'], day_offset: 23, comes_after_id: cond })
  full = await addTemplateStep(t.id, { step_type_id: typeId['Package'], day_offset: 25 })
  return { id: t.id, fdh, cond, carb: full.steps.find((s) => s.name === 'Carb')!.id, pack: full.steps.find((s) => s.name === 'Package')!.id }
}

test('P15: Add a ramp 58° → 32°, 10° a day, from day 18 after FDH: four chained Set temps', async ({ page }) => {
  const t = await aleTemplate('P15 ramp')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId('template-add-ramp').click()
  await page.getByTestId('ramp-start').fill('58')
  await page.getByTestId('ramp-target').fill('32')
  await page.getByTestId('ramp-change').fill('10')
  await page.getByTestId('ramp-first-day').fill('18')
  await page.getByTestId('ramp-after').click()
  await page.getByTestId(`ramp-after-${t.fdh}`).click()
  await page.getByTestId('ramp-leads').click()
  await page.getByTestId(`ramp-leads-${t.cond}`).click()
  await expect(page.getByTestId('ramp-preview')).toHaveText('4 Set temp steps: 58°, 48°, 38°, 32° on days 18–21.')
  await page.getByTestId('ramp-dialog-save').click()
  await expect(page.getByTestId('ramp-dialog')).toBeHidden()

  await page.reload()
  expect((await rowNames(page)).slice(2, 6)).toEqual(['Set temp - 58°', 'Set temp - 48°', 'Set temp - 38°', 'Set temp - 32°'])
  const saved = await template(t.id)
  const ramp = saved.steps.filter((s) => s.name.startsWith('Set temp'))
  expect(ramp.map((s) => s.day_offset)).toEqual([18, 19, 20, 21])
  const linked = (a: number, b: number) => saved.links.find((l) => l.from_step_id === a && l.to_step_id === b)
  expect(linked(t.fdh, ramp[0].id)).toBeTruthy()
  for (let i = 0; i < 3; i++) expect(linked(ramp[i].id, ramp[i + 1].id)?.default_answer).toBe('move_all')
  expect(linked(ramp[3].id, t.cond)).toBeTruthy()
  expect(linked(t.fdh, t.cond)).toBeUndefined()
  await expect(page.getByTestId(`entry-phase-${ramp[0].id}`)).toHaveText('Crash')
  await expect(page.getByTestId(`entry-links-${t.cond}`)).toHaveText('after Set temp - 32° · moves with it')
})

test('P16: link Carb → Package with "stays by default"', async ({ page }) => {
  const t = await aleTemplate('P16 link')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId(`entry-edit-${t.carb}`).click()
  await page.getByTestId('link-new-leads').click()
  await page.getByTestId(`link-new-leads-${t.pack}`).click()
  await page.getByTestId('link-new-leads-add').click()
  const link = (await template(t.id)).links.find((l) => l.from_step_id === t.carb && l.to_step_id === t.pack)!
  await page.getByTestId(`link-answer-${link.id}`).click()
  await page.getByTestId(`link-answer-${link.id}-move_only`).click()
  await expect(page.getByTestId(`link-answer-${link.id}`)).toHaveText('Stays by default')
  await page.getByTestId('entry-dialog-cancel').click()
  await expect(page.getByTestId(`entry-links-${t.pack}`)).toHaveText('after Carb · stays')
  await page.reload()
  await expect(page.getByTestId(`entry-links-${t.pack}`)).toHaveText('after Carb · stays')

  // A link that would close a loop (Package → FDH, which Package follows) is refused in the dialog.
  await page.getByTestId(`entry-edit-${t.pack}`).click()
  await page.getByTestId('link-new-leads').click()
  await page.getByTestId(`link-new-leads-${t.fdh}`).click()
  await page.getByTestId('link-new-leads-add').click()
  await expect(page.getByTestId('links-error')).toHaveText('That link would go in a circle.')
})

test('P17: removing the Package is allowed; the banner and the Incomplete badge appear', async ({ page }) => {
  const t = await aleTemplate('P17 package')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await expect(page.getByTestId('template-issues')).toHaveCount(0)
  await page.getByTestId(`entry-remove-${t.pack}`).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByTestId('template-issues')).toContainText('The first tank has no Package, Split or Transfer.')
  await page.reload()
  await expect(page.getByTestId('template-issues')).toContainText('The first tank has no Package, Split or Transfer.')
  await page.goto('/brewery/production/templates')
  await expect(page.getByTestId(`template-incomplete-${t.id}`)).toBeVisible()

  // Brew day can't be removed.
  await page.goto(`/brewery/production/templates/${t.id}`)
  const brew = (await template(t.id)).steps[0]
  await expect(page.getByTestId(`entry-remove-${brew.id}`)).toHaveCount(0)
})

test.describe('as brewer2', () => {
  test.use({ storageState: authFile('brewer2') })

  test('P18: Duplicate "[SEED] Standard ale", rename it; editing the copy leaves the original', async ({ page }) => {
    const original = (await templates()).find((t) => t.name === '[SEED] Standard ale')!
    const before = await template(original.id)
    const known = new Set((await templates()).map((t) => t.id))
    await page.goto('/brewery/production/templates')
    await page.getByTestId(`template-duplicate-${original.id}`).click()
    await expect.poll(async () => (await templates()).some((t) => !known.has(t.id))).toBe(true)
    const copy = (await templates()).find((t) => !known.has(t.id))!
    made.push(copy.id)
    expect(copy.name).toMatch(/^Copy of \[SEED\] Standard ale/)

    const name = tempTag('Standard ale copy')
    await page.getByTestId(`template-link-${copy.id}`).click()
    await page.getByTestId('template-rename').click()
    await page.getByTestId('template-name').fill(name)
    await page.getByTestId('template-name-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('template-name-dialog')).toBeHidden()
    const fdh = (await template(copy.id)).steps.find((s) => s.name === 'FDH')!
    await page.getByTestId(`entry-remove-${fdh.id}`).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByTestId(`entry-name-${fdh.id}`)).toHaveCount(0)

    const after = await template(original.id)
    expect(after.name).toBe('[SEED] Standard ale')
    expect(after.steps.map((s) => s.name)).toEqual(before.steps.map((s) => s.name))
    expect((await template(copy.id)).name).toBe(name)
  })
})
