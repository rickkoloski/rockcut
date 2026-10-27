import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, Made, openGantt, schedule, snack, stepOf, today, type SBatch } from './schedule'

// D49 task 0 (BB1): a refused snackbar Undo keeps its button while the token
// lasts, so the same Undo works once the blocker is cleared. QA's path A
// (recheck 7): two users, so the owner's snackbar isn't replaced meanwhile.
// BB2's routes are in ExUnit (split_moves_test).

test.use({ viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())

async function openBatch(page: Page, b: { id: number }, vessel = 0) {
  await page.getByTestId(`gantt-bar-${b.id}-${vessel}`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

/** Check `step` off in the step dialog on its own day (so nothing moves). */
async function checkOffOnItsDay(page: Page, step: { id: number; due_on: string }) {
  await page.getByTestId(`batch-step-note-${step.id}`).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-done-on').fill(step.due_on)
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()
}

test('BB1: a refused Undo keeps its button; once breweryMgr un-checks the Transfer, the same Undo works', async ({ browser }) => {
  const [a, d, e] = [await made.tank('FV2'), await made.tank('B1SD'), await made.tank('B1SE')]
  const brand = await made.brand('Ale')
  // Brewed 15 days ago, brew day done; split 2 days before FDH (part 1 stays, part 2 → B1SD); part 2 transfers into B1SE.
  const planned = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), -15), tank_ids: [a.id] })
  await made.checkOff(stepOf(planned, 'Brew day'), `T${Date.now() % 1_000_000}`)
  const api = await apiAs('brewer1')
  const splitOn = addDays(stepOf(planned, 'FDH').due_on, -2)
  const split = await api.post(`${P}/batches/${planned.id}/split`, { data: { due_on: splitOn, parts: [{ stays: true, volume_bbl: 12 }, { tank_id: d.id, volume_bbl: 8 }] } })
  expect(split.status()).toBe(201)
  const part2 = () => schedule().then((s) => s.batches.find((x) => x.split_parent_id === planned.id && x.part_number === 2)!)
  const added = await api.post(`${P}/batches/${(await part2()).id}/transfers`, { data: { due_on: addDays(splitOn, 3), tank_id: e.id } })
  expect(added.status()).toBe(201)
  const b = await batchOf(planned.id)
  const p2: SBatch = await part2()
  const transfer = stepOf(p2, 'Transfer')

  const owner = await browser.newContext({ storageState: authFile('owner'), viewport: { width: 1440, height: 1400 } })
  try {
    const page = await owner.newPage()
    await openGantt(page)

    // The owner checks off the Split on its day.
    await openBatch(page, b)
    await checkOffOnItsDay(page, stepOf(b, 'Split - Transfer'))
    await expect(snack(page)).toHaveText('Split - Transfer done.')
    await page.getByTestId('batch-dialog-close').click()

    // breweryMgr checks off part 2's Transfer.
    const manager = await apiAs('breweryMgr')
    expect((await manager.post(`${P}/steps/${transfer.id}/complete`, { data: { done_on: transfer.due_on } })).status()).toBe(200)

    // The owner's Undo is refused with the rule, and the button stays.
    await page.getByTestId('gantt-undo').click()
    await expect(snack(page)).toHaveText(`Mark ${p2.label}: Transfer not done first.`)
    await expect(page.getByTestId('gantt-undo')).toBeEnabled()
    // Past the usual 6 seconds, it's still there.
    await page.waitForTimeout(7_000)
    await expect(page.getByTestId('gantt-undo')).toBeVisible()
    expect(stepOf(await batchOf(b.id), 'Split - Transfer').done_on).toBe(splitOn)

    // breweryMgr un-checks the Transfer: the same Undo now works.
    expect((await manager.post(`${P}/steps/${transfer.id}/uncomplete`)).status()).toBe(200)
    await page.getByTestId('gantt-undo').click()
    await expect(snack(page)).toHaveText('Undone.')
    expect(stepOf(await batchOf(b.id), 'Split - Transfer').done_on).toBeNull()
    expect((await part2()).status).toBe('planned')
  } finally {
    await owner.close()
  }
})
