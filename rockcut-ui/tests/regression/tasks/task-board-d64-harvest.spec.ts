import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { getBoard, openBoard, apiAs, type ApiCard } from '../brewery/taskBoardHelpers'
import { expectNoSidewaysScroll } from '../ingredients/helpers'
import { batchOf, snack, stepOf, today, type SBatch } from '../production/schedule'
import { enterCode, retireCoded, staffWithCode, type Coded } from '../production/device'
import { addCount, brink, fillHarvest, history, Yeast, yeastProduct } from '../production/yeast'

// D64 Stop 3 (spec §5.1, §8, decision 13): the Yeast harvest step's linked
// task on the Brewery board checks off through the same Harvest dialog as the
// Gantt: as a person, and on the brewhouse device with a staff code (recorded
// as that person "· on Brewhouse tablet"; a bartender's code can't do this
// here). Mark not done is refused once the brink is counted. At 360 px the
// dialog and its question fit. Named task-board-* for the one-worker
// `brewery-board` project. Persist-verified through the API.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1400 } })

const yeast = new Yeast()
test.afterEach(async () => {
  await yeast.cleanup()
})

/** The board's card for a step on today's column. */
async function cardOf(stepId: number): Promise<ApiCard> {
  const board = await getBoard(await apiAs('brewer1'), today(), today())
  const c = [...board.unfinished, ...board.days.flatMap((d) => d.cards)].find((x) => x.production?.step_id === stepId)
  expect(c, `the linked task of step ${stepId}`).toBeTruthy()
  return c!
}

/** "Yeast harvest - #2" is due today (the template's day 8). */
async function harvestToday(label: string): Promise<{ b: SBatch; stepId: number; card: ApiCard }> {
  const b = await yeast.brewed(label)
  const stepId = stepOf(b, 'Yeast harvest - #2').id
  return { b, stepId, card: await cardOf(stepId) }
}

const check = (page: Page, c: ApiCard) => page.getByTestId(`task-check-${c.id}:${c.due_on}`).click()

test('a person checks off the linked task: the Harvest dialog, the harvest saved; Mark not done refused once counted', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-board', '150')
  const { b, card } = await harvestToday('Galactic')
  await openBoard(page, { from: today(), to: today() })
  await check(page, card)

  const d = await fillHarvest(page, { brinkId: tb.id, lb: '25', strainId: us05.id, note: 'from the board' })
  await expect(d.getByTestId('harvest-lb-helper')).toHaveText(`${tb.name} empty: 150 lb`)
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toHaveText(`Yeast harvest - #2 done · 25 lb → ${tb.name}.`)
  await expect(page.getByTestId(`task-done-by-${card.id}:${card.due_on}`)).toBeVisible()
  expect(stepOf(await batchOf(b.id), 'Yeast harvest - #2').done_on).toBe(today())
  expect((await brink(tb.id))!.yeast).toMatchObject({ on_hand_lb: '25', generation: 1 })

  await addCount(tb.id)
  await check(page, card)
  await expect(snack(page)).toHaveText(`${tb.name} has been pitched from or counted since this harvest. The harvest can't be un-checked.`)
  expect(stepOf(await batchOf(b.id), 'Yeast harvest - #2').done_on).toBe(today())
})

test.describe('the brewhouse device (D50 staff codes)', () => {
  test.use({ storageState: authFile('breweryDevice') })
  let brewer: Coded | null = null
  let bartender: Coded | null = null
  test.beforeAll(async () => {
    brewer = await staffWithCode('D64 brewer')
    bartender = await staffWithCode('D64 bar', 'bar')
  })
  test.afterAll(async () => {
    await retireCoded([brewer, bartender])
  })

  test("a bartender's code can't do this here; a brewer's records the harvest as them, on the device", async ({ page }) => {
    const us05 = await yeastProduct('US-05')
    const tb = await yeast.brink('YB-device')
    const { b, stepId, card } = await harvestToday('Galactic')
    await openBoard(page, { from: today(), to: today() })

    await check(page, card)
    await enterCode(page, bartender!.code)
    await expect(page.getByTestId('acting-code-dialog')).toContainText("That staff code can't do this here")
    await page.getByTestId('acting-staff-code').fill(brewer!.code)
    await page.getByTestId('acting-submit').click()

    const d = await fillHarvest(page, { brinkId: tb.id, lb: '18', strainId: us05.id })
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(snack(page)).toHaveText(`Yeast harvest - #2 done · 18 lb → ${tb.name}.`)

    const step = (await batchOf(b.id)).steps.find((s) => s.id === stepId) as unknown as { done_by: { name: string }; done_on_device: { name: string } }
    expect(step.done_by.name).toBe(brewer!.person.name)
    expect(step.done_on_device.name).toBe('Brewhouse tablet')
    const [entry] = (await history(tb.id))[0].entries
    expect(entry.entered_by?.name).toBe(brewer!.person.name)
    expect(entry.device).toBe('Brewhouse tablet')
  })
})

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test('the Harvest dialog and the has-yeast question fit, with no sideways scroll', async ({ page }) => {
    const us05 = await yeastProduct('US-05')
    const tb = await yeast.brink('YB-phone')
    const b = await yeast.brewed('Galactic')
    // The first pull (yesterday's step) through the API, so the brink shows yeast.
    const first = stepOf(b, 'Yeast harvest')
    const res = await (await apiAs('brewer1')).post(`/api/production/steps/${first.id}/complete`, {
      data: { done_on: first.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_lb: '30', yeast_product_ids: [us05.id], yeast_generation: 1 },
    })
    expect(res.status(), await res.text()).toBe(200)
    const card = await cardOf(stepOf(b, 'Yeast harvest - #2').id)

    await openBoard(page, { from: today(), to: today() })
    await check(page, card)
    const d = page.getByTestId('harvest-dialog')
    await expect(d.getByTestId('harvest-brink')).toContainText(`${tb.name} · 30 lb US-05 gen 1`)
    await d.getByTestId('harvest-lb').fill('6')
    await expectNoSidewaysScroll(page)
    await d.getByRole('button', { name: 'Save' }).click()
    const q = page.getByTestId('harvest-question-has-yeast')
    await expect(q).toBeVisible()
    await expectNoSidewaysScroll(page)
    await q.getByRole('button', { name: 'Harvest on top' }).click()
    await expect(snack(page)).toContainText('Yeast harvest - #2 done · 6 lb')
    expect((await brink(tb.id))!.yeast?.on_hand_lb).toBe('36')
  })
})
