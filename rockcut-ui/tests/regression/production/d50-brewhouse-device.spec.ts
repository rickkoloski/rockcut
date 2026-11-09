import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, batchOf, dragBy, Made, openGantt, schedule, snack, stepOf, today, type SBatch } from './schedule'
import { apiAs } from '../scheduler/helpers'
import { doneActing, enterCode, firstName, retireCoded, staffWithCode, type Coded } from './device'

// D50: the brewhouse device on the production schedule with a mouse, at a
// Chromebook's 1366×768 (spec §2.1): P104–P107, D1–D3, D5–D8 (mouse), L4.
// The touch run is d50-brewhouse-touch.spec.ts; the board's linked tasks
// (D4) are in task-board-linked.spec.ts. Persist-verified through the API.

test.use({ storageState: authFile('breweryDevice'), viewport: { width: 1366, height: 768 } })

const P = '/api/production'
const ALE = '[SEED] Standard ale'
const DEVICE = 'Brewhouse tablet'
const made = new Made()
let brewerA: Coded | null = null
let brewerB: Coded | null = null
let bartender: Coded | null = null

test.beforeAll(async () => {
  brewerA = await staffWithCode('D50 A')
  brewerB = await staffWithCode('D50 B')
  bartender = await staffWithCode('D50 bar', 'bar')
})
test.afterAll(async () => {
  await made.cleanup()
  await retireCoded([brewerA, brewerB, bartender])
})

async function ale(label: string, brewOffset: number, tankIds?: (number | null)[]): Promise<SBatch> {
  const brand = await made.brand(label)
  const tank = await made.tank('FV')
  return batchOf((await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewOffset), tank_ids: tankIds ?? [tank.id] })).id)
}

const dot = (page: Page, id: number) => page.getByTestId(`gantt-step-${id}`)

test('P104: Brewery → Production is in the nav; the Gantt reads; Check off asks for a code first', async ({ page }) => {
  const b = await ale('Galactic', 2)
  const fdh = stepOf(b, 'FDH')
  await page.goto('/tasks/brewery')
  // The Brewery heading opens to its one page.
  const nav = page.locator('.MuiDrawer-paper:visible')
  await nav.getByText('Brewery', { exact: true }).click()
  await nav.getByText('Production', { exact: true }).click()
  await expect(page).toHaveURL(/\/brewery\/production$/)
  await expect(page.getByTestId('gantt-inner')).toBeVisible()

  await dot(page, fdh.id).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-done-on').fill(fdh.due_on > today() ? today() : fdh.due_on)
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('acting-code-dialog')).toBeVisible()
  await page.getByTestId('acting-cancel').click()
  await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)
  // Cancelled: no error, nothing done.
  await expect(page.getByTestId('step-dialog').getByRole('alert')).toHaveCount(0)
  expect(stepOf(await batchOf(b.id), 'FDH').done_on).toBeNull()
})

test('P105: a drag asks for the code once; recorded as that person; "Acting as" on the Gantt; the next drag needs none', async ({ page }) => {
  const b = await ale('Galactic', 2)
  const [fdh, carb] = [stepOf(b, 'FDH'), stepOf(b, 'Carb')]
  await openGantt(page)
  await dragBy(page, dot(page, fdh.id), 1)
  await enterCode(page, brewerA!.code)
  await expect(page.getByTestId('move-prompt')).toContainText('FDH moved 1 day later')
  await page.getByTestId('move-only').check()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toHaveText('FDH moved 1 day later.')
  await expect(page.getByTestId('acting-name')).toHaveText(`Acting as ${firstName(brewerA!)}`)
  expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(addDays(fdh.due_on, 1))

  // Within the window: no dialog.
  await dragBy(page, dot(page, carb.id), 1)
  await expect(page.getByTestId('move-prompt')).toBeVisible()
  await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)
  await page.getByTestId('move-cancel').click()
})

test('D6 (mouse): Ctrl-click three steps and drag: they move as a block, the prompt runs, as the acting person', async ({ page }) => {
  const b = await ale('Enos', 2)
  const names = ['PDH', 'FDH', 'Set temp - 58°']
  await openGantt(page)
  await dot(page, stepOf(b, 'PDH').id).scrollIntoViewIfNeeded()
  for (const n of names) await dot(page, stepOf(b, n).id).click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByTestId('gantt-selection-count')).toHaveText('3 steps selected')
  await dragBy(page, dot(page, stepOf(b, 'FDH').id), 1)
  await enterCode(page, brewerB!.code)
  await expect(page.getByTestId('move-prompt')).toContainText('3 steps moved 1 day later')
  await page.getByTestId('move-only').check()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toHaveText('3 steps moved 1 day later.')
  const after = await batchOf(b.id)
  for (const n of names) expect(stepOf(after, n).due_on, n).toBe(addDays(stepOf(b, n).due_on, 1))
  await expect(page.getByTestId('acting-name')).toHaveText(`Acting as ${firstName(brewerB!)}`)
})

test('P106: Tanks, Templates and Phases & steps open read-only', async ({ page }) => {
  await page.goto('/brewery/production/tanks')
  await expect(page.getByTestId('setup-read-only')).toHaveText('Read only on a shared device. Set up on a personal account.')
  await expect(page.getByTestId('tanks-list')).toBeVisible()
  await expect(page.getByTestId('tank-add')).toHaveCount(0)
  await expect(page.locator('[data-testid^="tank-edit-"], [data-testid^="tank-retire-"], [data-testid^="tanks-list-handle-"]')).toHaveCount(0)

  await page.goto('/brewery/production/lists')
  await expect(page.getByTestId('setup-read-only')).toBeVisible()
  await expect(page.getByTestId('phase-add')).toHaveCount(0)
  await expect(page.getByTestId('step-type-add')).toHaveCount(0)
  await expect(page.locator('[data-testid^="phases-edit-"], [data-testid^="step_types-retire-"], [data-testid^="phases-up-"]')).toHaveCount(0)

  await page.goto('/brewery/production/templates')
  await expect(page.getByTestId('setup-read-only')).toBeVisible()
  await expect(page.getByTestId('template-new')).toHaveCount(0)
  await expect(page.locator('[data-testid^="template-duplicate-"], [data-testid^="template-retire-"]')).toHaveCount(0)
  await page.locator('[data-testid^="template-link-"]').first().click()
  await expect(page.getByTestId('template-entries')).toBeVisible()
  await expect(page.getByTestId('setup-read-only')).toBeVisible()
  for (const id of ['template-add-step', 'template-add-marker', 'template-add-ramp', 'template-rename']) await expect(page.getByTestId(id)).toHaveCount(0)
  await expect(page.locator('[data-testid^="entry-edit-"], [data-testid^="entry-remove-"]')).toHaveCount(0)
})

test('D1: Plan batch with a code; its P-number and its linked tasks on the Brewery board', async ({ page }) => {
  const brand = await made.brand('Altruism')
  const tank = await made.tank('FV')
  const brewOn = addDays(today(), 3)
  await openGantt(page)
  await page.getByTestId('gantt-add-process').click()
  await page.getByTestId('gantt-plan').click()
  await page.getByTestId('plan-brand').click()
  await page.getByTestId(`plan-brand-${brand.id}`).click()
  await page.getByTestId('plan-template').click()
  await page.getByRole('option', { name: ALE, exact: true }).click()
  await page.getByTestId('plan-brew-on').fill(brewOn)
  await page.getByTestId('plan-volume').fill('20')
  await page.getByTestId('plan-tank-0').click()
  await page.getByTestId(`plan-tank-0-${tank.id}`).click()
  await page.getByTestId('plan-dialog').getByRole('button', { name: 'Save' }).click()
  await enterCode(page, brewerA!.code)
  await expect(page.getByTestId('plan-dialog')).toBeHidden()
  await expect(snack(page)).toContainText('planned.')

  const b = (await schedule()).batches.find((x) => x.brand_id === brand.id)!
  made.batches.push(b.id)
  expect(b.p_number).toMatch(/^P\d+$/)
  const board = (await (await apiAs('brewer1')).get(`/api/boards/brewery/tasks?from=${brewOn}&to=${addDays(brewOn, 30)}`)).json()
  const titles = JSON.stringify(await board)
  expect(titles).toContain(`${b.label} · Brew day`)
})

test('D2: Mark OK on a flag with a code: signed off by that person, on the device', async ({ page }) => {
  // No tank, filling within 3 days: a "no tank" flag.
  const b = await ale('Crusher', 2, [null])
  const flag = (await schedule()).flags.find((f) => f.kind === 'no_tank' && f.batch_ids.includes(b.id))!
  await openGantt(page)
  await page.getByTestId('gantt-flags').click()
  const row = page.getByTestId(`flag-${flag.key}`)
  await row.getByTestId('flag-ok').click()
  await enterCode(page, brewerB!.code)
  await expect(row.getByTestId('flag-signed-by')).toContainText(`Signed off by ${brewerB!.person.name} · on ${DEVICE}`)
  const after = (await schedule()).flags.find((f) => f.key === flag.key)!
  expect(after.signed_off).toBe(true)
})

test('D3: a Taproom member’s code is refused; the dialog stays open and nothing changes', async ({ page }) => {
  const b = await ale('Fest', 2)
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await dragBy(page, dot(page, fdh.id), 1)
  await enterCode(page, bartender!.code)
  await expect(page.getByTestId('acting-code-dialog')).toContainText("That staff code isn't right")
  await expect(page.getByTestId('acting-staff-code')).toHaveValue('')
  await page.getByTestId('acting-cancel').click()
  await expect(page.getByTestId('move-prompt')).toHaveCount(0)
  expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(fdh.due_on)
})

test('D5: brewer B can’t undo brewer A’s move (“Only A can undo this.”); A’s code can', async ({ page }) => {
  const b = await ale('Galactic', 2)
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await dragBy(page, dot(page, fdh.id), 1)
  await enterCode(page, brewerA!.code)
  await page.getByTestId('move-only').check()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toHaveText('FDH moved 1 day later.')
  await doneActing(page)

  await page.getByTestId('gantt-undo').click()
  await enterCode(page, brewerB!.code)
  await expect(snack(page)).toHaveText(`Only ${firstName(brewerA!)} can undo this.`)
  expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(addDays(fdh.due_on, 1))

  // The Undo stays while its 2 minutes last; with A's code it works.
  await page.getByTestId('gantt-undo').click()
  await enterCode(page, brewerA!.code)
  await expect(snack(page)).toHaveText('Undone.')
  expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(fdh.due_on)
})

test('D7: Add step to a batch with a code', async ({ page }) => {
  const b = await ale('Enos', 2)
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await page.getByTestId('batch-add-step').click()
  await page.getByTestId('add-step-type').click()
  await page.getByTestId('add-step-type-custom').click()
  await page.getByTestId('add-step-name').fill('Dry hop 2')
  await page.getByTestId('add-step-day').fill(addDays(today(), 12))
  await page.getByTestId('add-step-dialog-save').click()
  await enterCode(page, brewerA!.code)
  await expect(snack(page)).toHaveText(`Dry hop 2 added to ${b.label}.`)
  expect(stepOf(await batchOf(b.id), 'Dry hop 2').due_on).toBe(addDays(today(), 12))
})

test('D8: the lock message shows in the code dialog (the lock itself: ExUnit)', async ({ page }) => {
  const b = await ale('Fest', 2)
  await page.route(`**${P}/steps/move`, (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'staff_code_locked', retry_after_minutes: 7, message: 'Too many wrong codes. Try again in 7 minutes.' }),
    }),
  )
  await openGantt(page)
  await dragBy(page, dot(page, stepOf(b, 'FDH').id), 1)
  await enterCode(page, '0000')
  await expect(page.getByTestId('acting-code-dialog')).toContainText('Too many wrong codes. Try again in 7 minutes.')
  await page.getByTestId('acting-cancel').click()
})

test('L4: link two steps in the step dialog with a code; recorded as the person', async ({ page }) => {
  const b = await ale('Galactic', 2)
  const [brew, carb] = [stepOf(b, 'Brew day'), stepOf(b, 'Carb')]
  await openGantt(page)
  await dot(page, carb.id).click()
  await page.getByTestId('step-link-new-after').click()
  await page.getByTestId(`step-link-new-after-${brew.id}`).click()
  await page.getByTestId('step-link-new-after-add').click()
  await enterCode(page, brewerA!.code)
  await expect(snack(page)).toHaveText('Linked: Brew day → Carb.')
  const links = (await batchOf(b.id)).links
  expect(links.some((l) => l.from_step_id === brew.id && l.to_step_id === carb.id)).toBe(true)
})

test.describe('the Taproom tablet', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('P107: a typed /brewery/production is "Not available on a shared device"; no Production in the nav', async ({ page }) => {
    for (const url of ['/brewery/production', '/brewery/production/tanks']) {
      await page.goto(url)
      await expect(page.getByTestId('device-not-available')).toBeVisible()
    }
    await expect(page.locator('.MuiDrawer-paper:visible').getByText('Production', { exact: true })).toHaveCount(0)
  })
})

test.describe('a person', () => {
  test.use({ storageState: authFile('brewer1') })

  test('no "Acting as" and no code dialog on a person’s Gantt; writes go straight through', async ({ page }) => {
    const b = await ale('Fest', 2)
    await openGantt(page)
    await dragBy(page, dot(page, stepOf(b, 'FDH').id), 1)
    await expect(page.getByTestId('move-prompt')).toBeVisible()
    await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)
    await page.getByTestId('move-cancel').click()
    await expect(page.getByTestId('acting-banner')).toHaveCount(0)
  })
})

