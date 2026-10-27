import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, Made, openGantt, schedule, snack, stepOf, today, type SBatch } from './schedule'

// D48 DEV gate fix cycle 7 (lead decisions 8): Undo obeys the order rules a
// check-off or an un-check does (AA1). The rules themselves, and the other
// paths, are in ExUnit (split_moves_test).

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

test('AA1 path A: owner checks off the Split, breweryMgr a part’s Transfer; the owner’s Undo is refused with the rule, and part 2 is unchanged', async ({ browser }) => {
  const [a, d, e] = [await made.tank('FV2'), await made.tank('Q1SD'), await made.tank('Q1SE')]
  const brand = await made.brand('Ale')
  // Brewed 15 days ago, brew day done; split 2 days before FDH (part 1 stays, part 2 → Q1SD); part 2 transfers into Q1SE.
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
  const manager = await browser.newContext({ storageState: authFile('breweryMgr'), viewport: { width: 1440, height: 1400 } })
  try {
    const [page, page2] = [await owner.newPage(), await manager.newPage()]
    await openGantt(page)
    await openGantt(page2)

    // The owner checks off the Split on its day: the snackbar offers Undo.
    await openBatch(page, b)
    await checkOffOnItsDay(page, stepOf(b, 'Split - Transfer'))
    await expect(snack(page)).toHaveText('Split - Transfer done.')
    await page.getByTestId('batch-dialog-close').click()

    // breweryMgr checks off part 2's Transfer, allowed now the Split is done.
    await page2.reload()
    await openBatch(page2, p2)
    await checkOffOnItsDay(page2, transfer)
    await expect(snack(page2)).toHaveText('Transfer done.')

    // The owner's Undo: refused with the rule's own words; nothing changes.
    await page.getByTestId('gantt-undo').click()
    await expect(snack(page)).toHaveText(`Mark ${p2.label}: Transfer not done first.`)
    const after = await part2()
    expect([after.status, stepOf(after, 'Transfer').done_on]).toEqual(['fermenting', transfer.due_on])
    expect(stepOf(await batchOf(b.id), 'Split - Transfer').done_on).toBe(splitOn)
  } finally {
    await owner.close()
    await manager.close()
  }
})
