import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from '../scheduler/helpers'
import { addDays, batchOf, dragBy, Made, openGantt, snack, stepOf, today } from './schedule'
import { enterCode, retireCoded, staffWithCode, type Coded } from './device'

// D50 DEV fix cycle 1 (lead decisions 3).
// Gap 1: a real person from another department gets "That staff code can't do
// this here", and it doesn't count toward the lock.
// Gap 4: removing a tank's condition mark asks first. On the device the staff
// code comes after the confirm.
// Locator rule: the confirm is clicked inside its dialog, by its exact name.

const P = '/api/production'
const ALE = '[SEED] Standard ale'
const made = new Made()
let brewer: Coded | null = null
let taproom: Coded | null = null

test.beforeAll(async () => {
  brewer = await staffWithCode('D50 fix1')
  taproom = await staffWithCode('D50 fix1 bar', 'bar')
})
test.afterAll(async () => {
  await made.cleanup()
  await retireCoded([brewer, taproom])
})

type Mark = { id: number; tank_id: number }
async function marksOf(tankId: number): Promise<Mark[]> {
  const body = await (await (await apiAs('brewer1')).get(`${P}/schedule`)).json()
  return (body.data.condition_marks as Mark[]).filter((m) => m.tank_id === tankId)
}

/** A [TEST-TEMP] tank marked dirty yesterday (through the API), and that mark. */
async function markedTank(): Promise<{ tankId: number; mark: Mark }> {
  const tank = await made.tank('Mark')
  const res = await (await apiAs('brewer1')).post(`${P}/tanks/${tank.id}/condition`, { data: { state: 'dirty', marked_on: addDays(today(), -1) } })
  expect(res.status(), await res.text()).toBe(201)
  const [mark] = await marksOf(tank.id)
  return { tankId: tank.id, mark }
}

const confirmDialog = (page: Page) => page.getByTestId('mark-remove-confirm')

async function openRemove(page: Page, tankId: number, markId: number) {
  await page.getByTestId(`gantt-tank-menu-${tankId}`).click()
  await page.getByTestId(`tank-panel-mark-remove-${markId}`).click()
  await expect(confirmDialog(page)).toBeVisible()
}

test.describe('the brewhouse device', () => {
  test.use({ storageState: authFile('breweryDevice'), viewport: { width: 1366, height: 768 } })

  test('gap 1: a Taproom person’s real code “can’t do this here”, five times without a lock; then a brewer’s code works', async ({ page }) => {
    const b = await made.plan({ brand_id: (await made.brand('Galactic')).id, template: ALE, brew_on: addDays(today(), 2), tank_ids: [(await made.tank('FV')).id] })
    const fdh = stepOf(b, 'FDH')
    await openGantt(page)
    await dragBy(page, page.getByTestId(`gantt-step-${fdh.id}`), 1)
    for (let i = 0; i < 5; i++) {
      await enterCode(page, taproom!.code)
      await expect(page.getByTestId('acting-code-dialog')).toContainText("That staff code can't do this here")
      // The dialog stays open with an empty field.
      await expect(page.getByTestId('acting-staff-code')).toHaveValue('')
    }
    await expect(page.getByTestId('acting-code-dialog')).not.toContainText('Too many wrong codes')
    expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(fdh.due_on)

    // Not locked: the brewer's code goes through to the move prompt.
    await enterCode(page, brewer!.code)
    await expect(page.getByTestId('move-prompt')).toContainText('FDH moved 1 day later')
    await page.getByTestId('move-only').check()
    await page.getByTestId('move-apply').click()
    await expect(snack(page)).toHaveText('FDH moved 1 day later.')
    expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(addDays(fdh.due_on, 1))
  })

  test('gap 4: Remove asks first, then the staff code; Cancel keeps the mark, Remove deletes it', async ({ page }) => {
    const { tankId, mark } = await markedTank()
    await openGantt(page)
    await openRemove(page, tankId, mark.id)
    // No code is asked before the confirm.
    await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)
    await confirmDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(confirmDialog(page)).toHaveCount(0)
    expect((await marksOf(tankId)).map((m) => m.id)).toEqual([mark.id])

    await page.getByTestId(`tank-panel-mark-remove-${mark.id}`).click()
    await confirmDialog(page).getByRole('button', { name: 'Remove', exact: true }).click()
    await enterCode(page, brewer!.code)
    await expect(snack(page)).toContainText(`Mark removed:`)
    expect(await marksOf(tankId)).toEqual([])
  })
})

test.describe('a person', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1000 } })

  test('gap 4: Remove asks first; Cancel keeps the mark, Remove deletes it', async ({ page }) => {
    const { tankId, mark } = await markedTank()
    await openGantt(page)
    await openRemove(page, tankId, mark.id)
    await expect(confirmDialog(page)).toContainText('Marked dirty by')
    await confirmDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(confirmDialog(page)).toHaveCount(0)
    expect((await marksOf(tankId)).map((m) => m.id)).toEqual([mark.id])

    await page.getByTestId(`tank-panel-mark-remove-${mark.id}`).click()
    await confirmDialog(page).getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(snack(page)).toContainText('Mark removed:')
    expect(await marksOf(tankId)).toEqual([])
  })
})
