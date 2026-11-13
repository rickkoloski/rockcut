import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, stepTypes } from './helpers'
import { batchOf, Made, openGantt, schedule, snack, stepOf, today, undo, type SBatch } from './schedule'
import { answerResult, checkOffResult, rstep, rsteps, Setup, uncheckResults, type RStep } from './d56'
import { enterCode, retireCoded, staffWithCode, type Coded } from './device'
import { getBoard, openBoard, type ApiCard } from '../brewery/taskBoardHelpers'

// D56 §3.2 test results and retests, S7–S15. The seed lager's Diacetyl test
// (day 15, after Set temp - 65°, before Set temp - 40°) has a result; each
// test brews a [TEST-TEMP] lager 15 days ago in its own tanks, so its test is
// due today. Results are un-checked (retests first) before the batch goes.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1200 } })

const LAGER = '[SEED] Lager with transfer'
const P = '/api/production'
const TEST = 'Diacetyl test'
const NEXT = 'Set temp - 40°'
const made = new Made()
const setup = new Setup()
test.afterEach(async () => {
  await uncheckResults(made.batches)
  await made.cleanup()
})
test.afterAll(() => setup.cleanup())

/** "Wed Dec 16", as the app writes a day. */
const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')

/** A [TEST-TEMP] lager brewed 15 days ago (its Diacetyl test due today), in its own two tanks. */
async function lager(label: string): Promise<SBatch> {
  const [a, b] = [await made.tank('FV'), await made.tank('BT')]
  const brand = await made.brand(label)
  const planned = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), -15), tank_ids: [a.id, b.id] })
  await made.checkOff(stepOf(planned, 'Brew day'), `9${Math.floor(Math.random() * 1e6)}`)
  const batch = await batchOf(planned.id)
  expect(stepOf(batch, TEST).due_on).toBe(today())
  return batch
}

const retestOf = (b: SBatch, testId: number) => rsteps(b).find((s) => s.retest_of_id === testId)

/** The board's card for a step a month either side of today. */
async function cardFor(stepId: number): Promise<ApiCard> {
  const board = await getBoard(await apiAs('brewer1'), addDays(today(), -3), addDays(today(), 20))
  return [...board.unfinished, ...board.days.flatMap((d) => d.cards)].find((c) => (c as { production?: { step_id: number } }).production?.step_id === stepId)!
}

/** Open a step's dialog from the URL (as the Task list panel does). */
async function openStep(page: Page, s: { id: number; due_on: string }) {
  await page.goto(`/brewery/production?step=${s.id}&day=${s.due_on}`)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
}

test.describe('S7 (breweryMgr): "Has a result" on a step type', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('turned on for a type; Diacetyl test has it; the template editor shows "Retest after" on both; kept after a reload', async ({ page }) => {
    const rouse = await setup.stepType('Rouse')
    const diacetyl = (await stepTypes()).find((t) => t.name === TEST && !t.retired_at)!
    await page.goto('/brewery/production/lists')
    await page.getByTestId(`step_types-edit-${rouse.id}`).click()
    await expect(page.getByTestId('step-type-has-result')).not.toBeChecked()
    await page.getByTestId('step-type-has-result').check()
    await page.getByTestId('step-type-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('step-type-dialog')).toBeHidden()

    await page.reload()
    await expect(page.getByTestId(`step_types-name-${rouse.id}`).locator('..')).toContainText('Has a result')
    await expect(page.getByTestId(`step_types-name-${diacetyl.id}`).locator('..')).toContainText('Has a result')
    await page.getByTestId(`step_types-edit-${rouse.id}`).click()
    await expect(page.getByTestId('step-type-has-result')).toBeChecked()
    await page.getByTestId('step-type-dialog').getByRole('button', { name: 'Cancel' }).click()

    // A template with both: "Retest after 2 days" under each; changed to 3 on the new one.
    const t = await setup.copy(LAGER, 'S7 results')
    await setup.addStep(t.id, { step_type_id: rouse.id, day_offset: 20, vessel_index: 0 })
    const steps = (await (await (await apiAs('breweryMgr')).get(`${P}/templates/${t.id}`)).json()).data.steps as { id: number; name: string }[]
    const [d, r] = [steps.find((s) => s.name === TEST)!, steps.find((s) => s.name === rouse.name)!]
    await page.goto(`/brewery/production/templates/${t.id}`)
    await expect(page.getByTestId(`entry-sub-${d.id}`)).toHaveText('Retest after 2 days')
    await expect(page.getByTestId(`entry-sub-${r.id}`)).toHaveText('Retest after 2 days')
    await page.getByTestId(`entry-edit-${r.id}`).click()
    await page.getByTestId('entry-retest-days').fill('3')
    await page.getByTestId('entry-dialog-save').click()
    await expect(page.getByTestId('entry-dialog')).toBeHidden()
    await page.reload()
    await expect(page.getByTestId(`entry-sub-${r.id}`)).toHaveText('Retest after 3 days')
    await expect(page.getByTestId(`entry-sub-${d.id}`)).toHaveText('Retest after 2 days')
  })
})

test('S8: Gantt → the test’s dot → Check off → Fail → Retest in 2 days → Move all: ✗, a retest 2 days on, the next step follows it; kept after a reload', async ({ page }) => {
  const b = await lager('S8')
  const [t, next] = [stepOf(b, TEST), stepOf(b, NEXT)]
  await openGantt(page)
  await page.getByTestId(`gantt-step-${t.id}`).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-check-off').click()
  await answerResult(page, { result: 'fail', retest: 2 })
  const retestOn = addDays(today(), 2)
  // The move prompt after a retest: about the following steps, on the retest's day.
  const prompt = page.getByTestId('move-prompt')
  await expect(prompt.getByRole('heading')).toContainText(`${TEST} failed · retest ${dayLabel(retestOn)}`)
  await expect(page.getByTestId('move-prompt-sub')).toHaveText(`${b.label} · retest ${dayLabel(retestOn)}`)
  await expect(prompt).toContainText('Move them with the retest')
  await expect(prompt).toContainText('Keep the following steps’ dates')
  await expect(prompt).not.toContainText(`Move only ${TEST}`)
  await page.getByTestId('move-all').check()
  await page.getByTestId('move-apply').click()
  await expect(prompt).toBeHidden()
  await expect(snack(page)).toContainText(`Fail · retest ${dayLabel(retestOn)}`)

  await page.reload()
  await expect(page.getByTestId(`gantt-result-${t.id}`)).toHaveText('✗')
  const now = await batchOf(b.id)
  const [done, retest] = [rsteps(now).find((s) => s.id === t.id)!, retestOf(now, t.id)!]
  expect(done).toMatchObject({ done_on: today(), result: 'fail' })
  expect(retest).toMatchObject({ due_on: retestOn, done_on: null, result: null })
  expect(stepOf(now, NEXT).due_on).toBe(addDays(next.due_on, 2))
  expect(now.links.some((l) => l.from_step_id === retest.id && l.to_step_id === next.id)).toBe(true)
  await expect(page.getByTestId(`gantt-step-${retest.id}`)).toBeVisible()
})

test('S9: on the board, tick the test → Fail → Continue as planned: done with ✗ Fail, no retest, the next step unchanged', async ({ page }) => {
  const b = await lager('S9')
  const [t, next] = [stepOf(b, TEST), stepOf(b, NEXT)]
  const card = await cardFor(t.id)
  await openBoard(page, { from: today(), to: addDays(today(), 6) })
  await page.getByTestId(`task-check-${card.key}`).click()
  await answerResult(page, { result: 'fail', continue: true })
  await expect(page.getByTestId(`task-check-${card.key}`)).toBeChecked()

  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId(`task-result-${card.key}`)).toHaveText('✗ Fail · continued as planned')
  const now = await batchOf(b.id)
  expect(rsteps(now).find((s) => s.id === t.id)).toMatchObject({ done_on: today(), result: 'fail' })
  expect(retestOf(now, t.id)).toBeUndefined()
  expect(stepOf(now, NEXT).due_on).toBe(next.due_on)
})

test('S10: step dialog Fail → Retest, then the snackbar’s Undo: the retest goes, the links are back on the test, the next step is back', async ({ page }) => {
  const b = await lager('S10')
  const [t, next] = [stepOf(b, TEST), stepOf(b, NEXT)]
  await openStep(page, t)
  await page.getByTestId('step-check-off').click()
  await answerResult(page, { result: 'fail', retest: 2 })
  await page.getByTestId('move-all').check()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toContainText('Fail · retest')
  expect(retestOf(await batchOf(b.id), t.id)).toBeTruthy()
  await undo(page)

  await page.reload()
  await expect(page.getByTestId(`gantt-step-${t.id}`)).toBeVisible()
  await expect(page.getByTestId(`gantt-result-${t.id}`)).toHaveCount(0)
  const now = await batchOf(b.id)
  expect(retestOf(now, t.id)).toBeUndefined()
  expect(rsteps(now).find((s) => s.id === t.id)).toMatchObject({ done_on: null, result: null })
  expect(stepOf(now, NEXT).due_on).toBe(next.due_on)
  expect(now.links.some((l) => l.from_step_id === t.id && l.to_step_id === next.id)).toBe(true)
})

test('S11: three Fails in a row raise "3 failed Diacetyl tests"; signed off; a 4th Fail brings it back', async ({ page }) => {
  const b = await lager('S11')
  let s: RStep = stepOf(b, TEST) as RStep
  const chain = [s.id]
  for (let i = 0; i < 3; i++) {
    await checkOffResult({ ...s, due_on: today() }, { result: 'fail', fail_action: 'retest', retest_days: 1 })
    s = retestOf(await batchOf(b.id), s.id) as RStep
    chain.push(s.id)
  }
  const flag = () => schedule().then((x) => x.flags.find((f) => f.kind === 'failed_tests' && f.batch_ids.includes(b.id)))
  const f = (await flag())!
  expect(f.message).toBe(`${b.label} · 3 failed ${TEST}s`)

  await openGantt(page)
  await page.getByTestId('gantt-flags').click()
  const row = page.getByTestId(`flag-${f.key}`)
  await expect(row).toContainText(`${b.label} · 3 failed ${TEST}s`)
  await row.getByTestId('flag-ok').click()
  await expect(row.getByTestId('flag-signed-by')).toBeVisible()
  expect((await flag())!.signed_off).toBe(true)

  // A 4th Fail (Continue this time): open again, saying it was signed off.
  await checkOffResult({ ...s, due_on: today() }, { result: 'fail', fail_action: 'continue' })
  await page.reload()
  await page.getByTestId('gantt-flags').click()
  const again = (await flag())!
  expect(again).toMatchObject({ signed_off: false, was_signed_off: true, message: `${b.label} · 4 failed ${TEST}s` })
  await expect(page.getByTestId(`flag-${again.key}`)).toContainText(`${b.label} · 4 failed ${TEST}s`)
  await expect(page.getByTestId(`flag-${again.key}`).getByTestId('flag-was-signed')).toBeVisible()
})

test.describe('S12 (breweryDevice, staff code)', () => {
  test.use({ storageState: authFile('breweryDevice'), viewport: { width: 1366, height: 768 } })
  let brewer: Coded | null = null
  test.beforeAll(async () => {
    brewer = await staffWithCode('D56 S12')
  })
  test.afterAll(() => retireCoded([brewer]))

  test('checks off the test as Fail → Retest: works; the retest’s task is on the board; the test’s task says "✗ Fail · retest …"', async ({ page }) => {
    const b = await lager('S12')
    const t = stepOf(b, TEST)
    await openStep(page, t)
    await page.getByTestId('step-check-off').click()
    await enterCode(page, brewer!.code)
    await answerResult(page, { result: 'fail', retest: 2 })
    await page.getByTestId('move-all').check()
    await page.getByTestId('move-apply').click()
    await expect(snack(page)).toContainText('Fail · retest')

    const retest = retestOf(await batchOf(b.id), t.id)!
    expect(retest.due_on).toBe(addDays(today(), 2))
    const [testCard, retestCard] = [await cardFor(t.id), await cardFor(retest.id)]
    expect(retestCard).toBeTruthy()
    await openBoard(page, { from: today(), to: addDays(today(), 6) })
    await expect(page.getByTestId(`task-result-${testCard.key}`)).toHaveText(`✗ Fail · retest ${dayLabel(retest.due_on)}`)
    await expect(page.getByTestId(`task-${retestCard.key}`)).toBeVisible()
    await page.reload()
    await expect(page.getByTestId(`task-result-${testCard.key}`)).toHaveText(`✗ Fail · retest ${dayLabel(retest.due_on)}`)
  })
})

test('S13: a has-result step checked off with no result is 422 result_required', async () => {
  const b = await lager('S13')
  const t = stepOf(b, TEST)
  const res = await (await apiAs('brewer1')).post(`${P}/steps/${t.id}/complete`, { data: { done_on: today(), answer: 'move_all' } })
  expect(res.status()).toBe(422)
  expect((await res.json()).error).toBe('result_required')
  expect((await rstep(t.id))!.done_on).toBeNull()
})

test.describe('S14 (brewer2)', () => {
  test('a pre-brew step at −31 and retest days 0 are 422 with the messages', async () => {
    const api = await apiAs('brewer2')
    const t = await setup.copy(LAGER, 'S14')
    const plain = (await stepTypes()).find((s) => s.name === 'Addition' && !s.retired_at)!
    const early = await api.post(`${P}/templates/${t.id}/steps`, { data: { step_type_id: plain.id, day_offset: -31, vessel_index: 0 } })
    expect(early.status()).toBe(422)
    expect(JSON.stringify(await early.json())).toMatch(/30/)

    const steps = (await (await api.get(`${P}/templates/${t.id}`)).json()).data.steps as { id: number; name: string }[]
    const d = steps.find((s) => s.name === TEST)!
    const zero = await api.patch(`${P}/templates/${t.id}/steps/${d.id}`, { data: { retest_days: 0 } })
    expect(zero.status()).toBe(422)
    expect(JSON.stringify(await zero.json())).toMatch(/retest_days/)

    // At check-off too.
    const b = await lager('S14')
    const res = await api.post(`${P}/steps/${stepOf(b, TEST).id}/complete`, { data: { done_on: today(), result: 'fail', fail_action: 'retest', retest_days: 0, answer: 'move_all' } })
    expect(res.status()).toBe(422)
    expect(JSON.stringify(await res.json())).toMatch(/retest_days|1 to 30|1 and 30/)
    expect((await rstep(stepOf(b, TEST).id))!.done_on).toBeNull()
  })
})

test('S15: office1 recording a result is 403, as for other schedule writes', async () => {
  const b = await lager('S15')
  const t = stepOf(b, TEST)
  const res = await (await apiAs('office1')).post(`${P}/steps/${t.id}/complete`, { data: { done_on: today(), result: 'pass' } })
  expect(res.status()).toBe(403)
  expect((await rstep(t.id))!.done_on).toBeNull()
})
