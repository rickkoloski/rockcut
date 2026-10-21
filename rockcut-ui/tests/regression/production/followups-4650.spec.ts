import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  activeTankIds,
  apiAs,
  addTemplateStep,
  createTank,
  createTemplate,
  pick,
  retireAll,
  retireTanks,
  shortTag,
  stepTypes,
  tempTag,
  template,
} from './helpers'

// D47 task 0: task 4650 (the D46 recheck's N1–N4 and item 10) and the
// template parts of Split - Transfer / Split - Filter (P109) and Package -
// Partial (P111). The API rules are ExUnit's (`production_test`, "D47 task 0").

test.use({ storageState: authFile('brewer1') })

const madeTemplates: number[] = []
test.afterAll(async () => {
  await retireAll('templates', madeTemplates.splice(0))
})

let typeId: Record<string, number> = {}
test.beforeAll(async () => {
  typeId = Object.fromEntries((await stepTypes()).map((t) => [t.name, t.id]))
})

/** Brew day; Transfer day 20 → tank 1; Rouse day 22 in tank 1; Transfer day 25 → tank 2; Package day 32 in tank 2. */
async function twoTransfers(label: string) {
  const t = await createTemplate(tempTag(label))
  madeTemplates.push(t.id)
  await addTemplateStep(t.id, { step_type_id: typeId['Transfer'], day_offset: 20, vessel_index: 1 })
  await addTemplateStep(t.id, { step_type_id: typeId['Rouse'], day_offset: 22, vessel_index: 1 })
  await addTemplateStep(t.id, { step_type_id: typeId['Transfer'], day_offset: 25, vessel_index: 2 })
  const full = await addTemplateStep(t.id, { step_type_id: typeId['Package'], day_offset: 32, vessel_index: 2 })
  const transfer = (day: number) => full.steps.find((s) => s.name === 'Transfer' && s.day_offset === day)!.id
  return { id: t.id, first: transfer(20), second: transfer(25) }
}

async function addStep(page: Page, type: string, day: number) {
  await page.getByTestId('template-add-step').click()
  await pick(page, 'entry-type', `entry-type-${typeId[type]}`)
  await page.getByTestId('entry-day').fill(String(day))
}

test('N1: a Transfer out of day order says why and offers no tank', async ({ page }) => {
  const t = await twoTransfers('N1 order')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await expect(page.getByTestId('template-issues')).toHaveCount(0)

  await addStep(page, 'Transfer', 22)
  const dialog = page.getByTestId('entry-dialog')
  await expect(dialog).toContainText('Transfers stay in day order: this one would come before the transfer on day 25.')
  await expect(page.getByTestId('entry-tank')).toHaveCount(0)
  await page.getByTestId('entry-dialog-save').click()
  await expect(dialog).toBeVisible()
  // After the last transfer it's fine again: the next new tank.
  await page.getByTestId('entry-day').fill('33')
  await expect(page.getByTestId('entry-tank')).toHaveText('After transfer 3')
  await page.getByTestId('entry-dialog-cancel').click()

  // Editing the day-20 transfer past the day-25 one.
  await page.getByTestId(`entry-edit-${t.first}`).click()
  await expect(page.getByTestId('entry-tank')).toHaveText('After transfer 1')
  await page.getByTestId('entry-day').fill('27')
  await expect(dialog).toContainText('Transfers stay in day order: this one would come after the transfer on day 25.')
  await page.getByTestId('entry-dialog-save').click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('entry-dialog-cancel').click()

  await page.reload()
  await expect(page.getByTestId(`entry-day-${t.first}`)).toHaveText('Day 20')
})

test('N2: removing a middle Transfer warns that the later tanks depend on it', async ({ page }) => {
  const t = await twoTransfers('N2 remove')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId(`entry-remove-${t.first}`).click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Remove Transfer?' })
  await expect(confirm).toContainText('The tanks after this transfer depend on it.')
  await expect(page.getByTestId('remove-issues')).toContainText('The template becomes incomplete')
  await expect(page.getByTestId('remove-issue-vessel_not_started')).toHaveText('The tank after transfer 1 has no Transfer or Filter starting it.')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await page.reload()
  await expect(page.getByTestId(`entry-name-${t.first}`)).toHaveText('Transfer')

  // A step whose removal leaves nothing incomplete: no warning.
  const rouse = (await template(t.id)).steps.find((s) => s.name === 'Rouse')!
  await page.getByTestId(`entry-remove-${rouse.id}`).click()
  await expect(page.getByRole('dialog').filter({ hasText: 'Remove Rouse?' })).toBeVisible()
  await expect(page.getByTestId('remove-issues')).toHaveCount(0)
  await expect(page.getByRole('dialog')).not.toContainText('depend on it')
})

test('N3: the ramp dialog caps the change per day at the gap between start and target', async ({ page }) => {
  const t = await twoTransfers('N3 ramp')
  await page.goto(`/brewery/production/templates/${t.id}`)
  await page.getByTestId('template-add-ramp').click()
  await page.getByTestId('ramp-first-day').fill('30')
  await page.getByTestId('ramp-start').fill('80')
  await page.getByTestId('ramp-target').fill('28')
  await page.getByTestId('ramp-change').fill('100')
  const cap = 'The change per day can be at most 52°, the gap between start and target.'
  await expect(page.getByTestId('ramp-preview')).toHaveText(cap)
  await page.getByTestId('ramp-dialog-save').click()
  await expect(page.getByTestId('ramp-dialog-error')).toHaveText(cap)
  await page.getByTestId('ramp-change').fill('52')
  await expect(page.getByTestId('ramp-preview')).toHaveText('2 Set temp steps: 80°, 28° on days 30–31.')

  // The API names the rule too, if a request gets past the dialog.
  const res = await apiAs('brewer1')
  const refused = await res.post(`/api/production/templates/${t.id}/ramp`, { data: { start: 80, target: 28, change_per_day: 100, first_day: 30 } })
  expect(refused.status()).toBe(422)
  expect((await refused.json()).message).toBe('The change per day is a whole number of degrees from 1 to 52° (the gap between start and target).')
})

test('N4a: a step after the tank’s exit is named in the banner', async ({ page }) => {
  const t = await twoTransfers('N4a exit')
  await addTemplateStep(t.id, { step_type_id: typeId['FDH'], day_offset: 22 })
  await page.goto(`/brewery/production/templates/${t.id}`)
  await expect(page.getByTestId('template-issue-step_after_exit')).toHaveText(
    'The first tank is emptied by the Transfer on day 20, but FDH on day 22 comes after it.',
  )
})

test('N4b: a template id that doesn’t exist says "Template not found" and links back', async ({ page }) => {
  await page.goto('/brewery/production/templates/99999999')
  await expect(page.getByTestId('template-load-error')).toContainText('Template not found.')
  await expect(page.getByTestId('template-load-error')).not.toContainText('removed by someone else')
  await page.getByTestId('template-load-back').click()
  await expect(page).toHaveURL(/\/brewery\/production\/templates$/)
})

test('P109: Split - Filter in the entries and the preview; Edit switches it to Split - Transfer', async ({ page }) => {
  const t = await createTemplate(tempTag('P109 split'))
  madeTemplates.push(t.id)
  await page.goto(`/brewery/production/templates/${t.id}`)
  await addStep(page, 'Split', 30)
  await expect(page.getByTestId('entry-split-method')).toHaveText('Transfer')
  await pick(page, 'entry-split-method', 'entry-split-method-filter')
  await expect(page.getByTestId('entry-dialog')).toContainText('Add to the name (“Split - Filter” stays)')
  await page.getByTestId('entry-dialog-save').click()
  await expect(page.getByTestId('entry-dialog')).toBeHidden()

  let split = (await template(t.id)).steps.find((s) => s.name.startsWith('Split'))!
  expect(split.name).toBe('Split - Filter')
  await page.reload()
  await expect(page.getByTestId(`entry-name-${split.id}`)).toHaveText('Split - Filter')
  // The Split is the tank's exit: nothing missing.
  await expect(page.getByTestId('template-issues')).toHaveCount(0)
  await page.getByTestId('preview-dot-0-30').hover()
  await expect(page.getByRole('tooltip')).toHaveText('Day 30 · Split - Filter')

  await page.getByTestId(`entry-edit-${split.id}`).click()
  await expect(page.getByTestId('entry-split-method')).toHaveText('Filter')
  await pick(page, 'entry-split-method', 'entry-split-method-transfer')
  await page.getByTestId('entry-dialog-save').click()
  await expect(page.getByTestId('entry-dialog')).toBeHidden()
  await page.reload()
  await expect(page.getByTestId(`entry-name-${split.id}`)).toHaveText('Split - Transfer')
  split = (await template(t.id)).steps.find((s) => s.id === split.id)!
  expect(split.name).toBe('Split - Transfer')
})

test('P111: Package - Partial isn’t the tank’s exit and adds no CIP', async ({ page }) => {
  const t = await createTemplate(tempTag('P111 partial'))
  madeTemplates.push(t.id)
  await addTemplateStep(t.id, { step_type_id: typeId['Package'], day_offset: 40 })
  await page.goto(`/brewery/production/templates/${t.id}`)
  await expect(page.getByTestId('template-issues')).toHaveCount(0)

  await addStep(page, 'Package', 30)
  await expect(page.getByTestId('entry-package')).toHaveText('Full')
  await pick(page, 'entry-package', 'entry-package-partial')
  await expect(page.getByTestId('entry-dialog')).toContainText('Add to the name (“Package - Partial” stays)')
  await page.getByTestId('entry-dialog-save').click()
  await expect(page.getByTestId('entry-dialog')).toBeHidden()

  await page.reload()
  const saved = await template(t.id)
  expect(saved.steps.map((s) => [s.name, s.day_offset])).toEqual([
    ['Brew day', 0],
    ['Package - Partial', 30],
    ['Package', 40],
  ])
  await expect(page.getByTestId('template-entries')).toContainText('Package - Partial')
  await expect(page.getByTestId('template-issues')).toHaveCount(0)
  // The preview's bar runs past the partial one to the full Package.
  await expect(page.getByTestId('preview-day-0-40')).toBeVisible()

  // Remove the full Package: the dialog says so, then the banner does.
  const full = saved.steps.find((s) => s.name === 'Package')!
  await page.getByTestId(`entry-remove-${full.id}`).click()
  await expect(page.getByTestId('remove-issue-vessel_has_no_exit')).toHaveText('The first tank has no Package, Split or Transfer.')
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByTestId('template-issue-vessel_has_no_exit')).toHaveText('The first tank has no Package, Split or Transfer.')
  await page.reload()
  await expect(page.getByTestId('template-issue-vessel_has_no_exit')).toBeVisible()
})

test.describe('item 10: ordered lists drag by a handle', () => {
  const madeTanks: number[] = []
  let order: number[] = []
  test.beforeAll(async () => {
    order = await activeTankIds()
  })
  test.afterAll(async () => {
    await retireTanks(madeTanks.splice(0), order)
  })

  test('the row isn’t a button; the handle is, and moves the row with the keyboard', async ({ page }) => {
    const tank = await createTank(shortTag('Handle'))
    madeTanks.push(tank.id)
    await page.goto('/brewery/production/tanks')
    const row = page.getByTestId(`tanks-list-row-${tank.id}`)
    await expect(row).toBeVisible()
    // No role="button" around the row's own buttons.
    expect(await row.evaluate((el) => !!el.closest('[role="button"]'))).toBe(false)
    expect(await row.locator('[role="button"] button').count()).toBe(0)

    const handle = page.getByTestId(`tanks-list-handle-${tank.id}`)
    await expect(handle).toHaveAttribute('role', 'button')
    await expect(page.getByRole('button', { name: `Drag ${tank.name}` })).toBeVisible()

    const before = await activeTankIds()
    await handle.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Space')
    await expect.poll(async () => (await activeTankIds()).indexOf(tank.id)).toBe(before.length - 2)
    await page.reload()
    await expect(page.locator('[data-testid^="tanks-list-row-"]').nth(before.length - 2)).toHaveAttribute('data-testid', `tanks-list-row-${tank.id}`)
  })
})
