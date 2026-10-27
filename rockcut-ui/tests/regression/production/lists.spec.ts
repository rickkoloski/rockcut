import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addTemplateStep, apiAs, createTemplate, phases, retireAll, shortTag, stepTypes, tempTag, template } from './helpers'

// D46 §3.3 Phases & steps: P11–P13. Changes go to [TEST-TEMP] rows; seeded
// rows are only read (P12 uses a [TEST-TEMP] stand-in for Fining, so the
// seed list stays as it is for the other specs).

test.use({ storageState: authFile('brewer1') })

const made = { step_types: [] as number[], phases: [] as number[], templates: [] as number[] }
test.afterAll(async () => {
  await retireAll('templates', made.templates.splice(0))
  await retireAll('step_types', made.step_types.splice(0))
  await retireAll('phases', made.phases.splice(0))
})

test('P11: Add a step type; it is in the template editor’s Add step picker', async ({ page }) => {
  const name = shortTag('Hop stand check')
  await page.goto('/brewery/production/lists')
  await page.getByTestId('step-type-add').click()
  await page.getByTestId('step-type-name').fill(name)
  await page.getByTestId('step-type-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('step-type-dialog')).toBeHidden()
  await expect(page.locator('[data-testid^="step_types-name-"]').last()).toHaveText(name)
  const type = (await stepTypes()).find((t) => t.name === name)!
  made.step_types.push(type.id)
  expect(type).toMatchObject({ built_in: false, retired_at: null })

  const t = await createTemplate(tempTag('P11 template'))
  made.templates.push(t.id)
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId('template-add-step').click()
  await page.getByTestId('entry-type').click()
  await expect(page.getByTestId(`entry-type-${type.id}`)).toHaveText(name)
})

test('P12: retire a step type a template uses: gone from the picker; the template keeps its step', async ({ page }) => {
  const name = shortTag('Fining')
  const res = await (await apiAs('brewer1')).post('/api/production/step_types', { data: { name } })
  const type = (await res.json()).data
  made.step_types.push(type.id)
  const t = await createTemplate(tempTag('P12 template'))
  made.templates.push(t.id)
  await addTemplateStep(t.id, { step_type_id: type.id, day_offset: 10 })

  await page.goto('/brewery/production/lists')
  await page.getByTestId(`step_types-retire-${type.id}`).click()
  await expect(page.getByRole('dialog')).toContainText(`Retire ${name}? It leaves the pickers. Templates that use it keep it.`)
  await page.getByRole('dialog').getByRole('button', { name: 'Retire' }).click()
  await expect(page.getByTestId(`step_types-name-${type.id}`)).toHaveCount(0)
  await page.getByTestId('step_types-retired-toggle').click()
  await expect(page.getByTestId(`step_types-retired-row-${type.id}`)).toBeVisible()

  await page.goto(`/brewery/production/templates/${t.id}`)
  await expect(page.getByTestId('template-entries')).toContainText(name)
  await page.getByTestId('template-add-step').click()
  await page.getByTestId('entry-type').click()
  await expect(page.getByTestId(`entry-type-${type.id}`)).toHaveCount(0)
  expect((await template(t.id)).steps.map((s) => s.name)).toContain(name)
})

test('P13: a built-in type (Transfer) has Edit but no Retire; renaming works', async ({ page }) => {
  const transfer = (await stepTypes()).find((t) => t.built_in && t.name === 'Transfer')!
  await page.goto('/brewery/production/lists')
  await expect(page.getByTestId(`step_types-name-${transfer.id}`)).toHaveText('Transfer')
  await expect(page.getByTestId(`step_types-retire-${transfer.id}`)).toHaveCount(0)
  await page.getByTestId(`step_types-edit-${transfer.id}`).click()
  await expect(page.getByTestId('step-type-built-in')).toContainText('You can rename it, but not retire it.')
  await page.getByTestId('step-type-name').fill('Rack')
  await page.getByTestId('step-type-dialog').getByRole('button', { name: 'Save' }).click()
  try {
    await expect(page.getByTestId(`step_types-name-${transfer.id}`)).toHaveText('Rack')
  } finally {
    await (await apiAs('brewer1')).patch(`/api/production/step_types/${transfer.id}`, { data: { name: 'Transfer' } })
  }
  const refused = await (await apiAs('brewer1')).delete(`/api/production/step_types/${transfer.id}`)
  expect(refused.status()).toBe(422)
})

test('a new phase takes a palette color, persists, and can be recolored', async ({ page }) => {
  const name = shortTag('Souring')
  await page.goto('/brewery/production/lists')
  await page.getByTestId('phase-add').click()
  await page.getByTestId('phase-name').fill(name)
  await page.getByTestId('phase-swatch-rose').click()
  await expect(page.getByTestId('phase-swatch-rose')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('phase-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('[data-testid^="phases-name-"]').last()).toHaveText(name)
  const phase = (await phases()).find((p) => p.name === name)!
  made.phases.push(phase.id)
  expect(phase.color).toBe('rose')

  await page.reload()
  await page.getByTestId(`phases-edit-${phase.id}`).click()
  await expect(page.getByTestId('phase-swatch-rose')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('phase-swatch-slate').click()
  await page.getByTestId('phase-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('phase-dialog')).toBeHidden()
  expect((await phases()).find((p) => p.id === phase.id)!.color).toBe('slate')

  // A duplicate name is refused inline.
  await page.getByTestId('phase-add').click()
  await page.getByTestId('phase-name').fill('crash')
  await page.getByTestId('phase-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('phase-dialog')).toContainText('A phase named Crash already exists.')
})
