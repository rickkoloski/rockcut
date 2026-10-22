import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addTemplateStep, apiAs, createTemplate, retireAll, stepTypes, tempTag } from './helpers'
import { addDays, addProcess, batchOf, dragBy, dragToLane, Made, openGantt, pNumbers, schedule, snack, stepOf, today, undo, type SBatch } from './schedule'

// D47 §3.5–§3.6 planning batches, their numbers, moving and re-tanking bars,
// and the flags planning raises: P21–P24, P30–P33, P36–P40, P53, P54, P60,
// P109, P112. Each test works on its own [TEST-TEMP] brand and tanks.
// P-number assertions are relative: other planned batches exist.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const made = new Made()
const templatesMade: number[] = []
test.afterAll(async () => {
  await made.cleanup()
  await retireAll('templates', templatesMade.splice(0))
})

const ALE = '[SEED] Standard ale'
const LAGER = '[SEED] Lager with transfer'

/** "Enos P2 → P3" for every planned batch whose number changed. */
async function renumberedSince(before: Map<number, string>): Promise<string[]> {
  const after = await pNumbers()
  const sched = await schedule()
  return [...after]
    .filter(([id, p]) => before.has(id) && before.get(id) !== p)
    .map(([id, p]) => `${sched.batches.find((b) => b.id === id)!.label.replace(/ P\d+$/, '')} ${before.get(id)} → ${p}`)
}

async function pickOption(page: Page, select: string, option: string) {
  await page.getByTestId(select).click()
  await page.getByTestId(option).click()
}

async function planThroughDialog(page: Page, f: { brand: number; template: string; brewOn: string; volume: number; tanks?: (number | null)[]; twoDays?: boolean }) {
  await pickOption(page, 'plan-brand', `plan-brand-${f.brand}`)
  await page.getByTestId('plan-template').click()
  await page.getByRole('option', { name: f.template, exact: true }).click()
  await page.getByTestId('plan-brew-on').fill(f.brewOn)
  await page.getByTestId('plan-volume').fill(String(f.volume))
  if (f.twoDays) await page.getByTestId('plan-two-days').check()
  for (const [k, id] of (f.tanks ?? []).entries()) {
    if (id === undefined) continue
    await pickOption(page, `plan-tank-${k}`, id === null ? `plan-tank-${k}-none` : `plan-tank-${k}-${id}`)
  }
  await page.getByTestId('plan-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('plan-dialog')).toBeHidden()
}

const newest = async (brandId: number): Promise<SBatch> => {
  const b = (await schedule()).batches.filter((x) => x.brand_id === brandId).sort((a, c) => c.id - a.id)[0]
  made.batches.push(b.id)
  return b
}

test('P21: Plan batch: ghosted with its P-number; later planned batches renumber, named in the message', async ({ page }) => {
  const brand = await made.brand('Galactic')
  const tank = await made.tank('FV3')
  const before = await pNumbers()
  await openGantt(page)
  await addProcess(page, 'plan')
  await planThroughDialog(page, { brand: brand.id, template: ALE, brewOn: addDays(today(), 1), volume: 20, tanks: [tank.id] })
  const batch = await newest(brand.id)
  expect(batch.p_number).toMatch(/^P\d+$/)
  const renumbered = await renumberedSince(before)
  await expect(snack(page)).toContainText(`${batch.label} planned.`)
  for (const r of renumbered) await expect(snack(page)).toContainText(r)

  await page.reload()
  const bar = page.getByTestId(`gantt-bar-${batch.id}-0`)
  await expect(bar).toHaveAttribute('data-planned', 'true')
  await expect(bar).toContainText(`${batch.label} · 20 bbl`)
  await expect(page.getByTestId(`gantt-row-${tank.id}`).getByTestId(`gantt-bar-${batch.id}-0`)).toBeVisible()
})

test('P22: tap an empty spot → Plan a batch with a transfer left Unassigned: two bars and the green arrow', async ({ page }) => {
  const brand = await made.brand('Fest')
  const tank = await made.tank('FV6')
  await openGantt(page)
  const lane = page.getByTestId(`gantt-lane-${tank.id}`)
  // Into view vertically only: a lane is wider than the grid, and scrolling it
  // sideways would put its first days under the sticky tank column.
  await page.getByTestId(`gantt-tank-name-${tank.id}`).scrollIntoViewIfNeeded()
  const box = (await lane.boundingBox())!
  const from = await page.getByTestId('gantt-from').inputValue()
  const px = box.width / (Math.round((Date.parse(await page.getByTestId('gantt-to').inputValue()) - Date.parse(from)) / 86_400_000) + 1)
  // The day 10 days into the view.
  await page.mouse.click(box.x + px * 10.5, box.y + box.height - 4)
  await expect(page.getByTestId('gantt-spot-menu')).toContainText(tank.name)
  await page.getByTestId('spot-plan').click()
  await expect(page.getByTestId('plan-brew-on')).toHaveValue(addDays(from, 10))
  await expect(page.getByTestId('plan-tank-0')).toContainText(tank.name)
  await planThroughDialog(page, { brand: brand.id, template: LAGER, brewOn: addDays(from, 10), volume: 20, tanks: [undefined as never, null] })
  const batch = await newest(brand.id)
  expect(batch.vessels).toEqual([
    { vessel_index: 0, tank_id: tank.id },
    { vessel_index: 1, tank_id: null },
  ])
  await page.reload()
  await expect(page.getByTestId(`gantt-row-${tank.id}`).getByTestId(`gantt-bar-${batch.id}-0`)).toBeVisible()
  await expect(page.getByTestId('gantt-row-unassigned').getByTestId(`gantt-bar-${batch.id}-1`)).toContainText('after transfer')
  await expect(page.getByTestId(`gantt-transfer-${batch.id}-0`)).toBeAttached()
})

test('P23, P24: the first planned keeps the lower P-number; a two-day brew', async ({ page }) => {
  const brand = await made.brand('Enos')
  const day = addDays(today(), 20)
  const a = await made.plan({ brand_id: brand.id, template: ALE, brew_on: day })
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: day })
  const nums = await pNumbers()
  expect(Number(nums.get(a.id)!.slice(1))).toBe(Number(nums.get(b.id)!.slice(1)) - 1)

  await openGantt(page)
  await addProcess(page, 'plan')
  await planThroughDialog(page, { brand: brand.id, template: ALE, brewOn: addDays(today(), 4), volume: 15, twoDays: true })
  const two = await newest(brand.id)
  const first = stepOf(two, 'Brew day - 1 of 2')
  const second = stepOf(two, 'Brew day - 2 of 2')
  expect([first.due_on, second.due_on]).toEqual([addDays(today(), 4), addDays(today(), 5)])
  expect(first.first_brew).toBe(true)
  await page.reload()
  await expect(page.getByTestId(`gantt-step-${second.id}`)).toHaveAttribute('aria-label', /^Brew day - 2 of 2 ·/)
})

test('P30: drag a planned bar 3 days later: every step moves, no prompt; Undo', async ({ page }) => {
  const brand = await made.brand('Galactic')
  const tank = await made.tank('FV2')
  const batch = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 2), tank_ids: [tank.id] })
  await openGantt(page)
  await dragBy(page, page.getByTestId(`gantt-bar-${batch.id}-0`), 3, 0, { x: 30 })
  await expect(snack(page)).toContainText(`${batch.label}: every step 3 days later.`)
  await expect(page.getByTestId('move-prompt')).toHaveCount(0)
  let after = await batchOf(batch.id)
  for (const s of batch.steps) expect(after.steps.find((x) => x.id === s.id)!.due_on).toBe(addDays(s.due_on, 3))
  await undo(page)
  after = await batchOf(batch.id)
  for (const s of batch.steps) expect(after.steps.find((x) => x.id === s.id)!.due_on).toBe(s.due_on)
})

test('P31: drag a brewed bar 2 days: only unfinished steps move', async ({ page }) => {
  const brand = await made.brand('Crusher')
  const tank = await made.tank('FV4')
  const batch = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), -10), tank_ids: [tank.id] })
  const tag = `T${Date.now().toString(36).slice(-5)}`
  await made.checkOff(stepOf(batch, 'Brew day'), tag)
  await made.checkOff(stepOf(batch, 'PDH'))
  const open = (await batchOf(batch.id)).steps.filter((s) => !s.done_on).length
  await openGantt(page)
  await dragBy(page, page.getByTestId(`gantt-bar-${batch.id}-0`), 2, 0, { x: 30 })
  await expect(snack(page)).toHaveText(`${open} unfinished steps 2 days later (finished steps keep their dates).`)
  const after = await batchOf(batch.id)
  expect(stepOf(after, 'Brew day').due_on).toBe(addDays(today(), -10))
  expect(stepOf(after, 'FDH').due_on).toBe(addDays(stepOf(batch, 'FDH').due_on, 2))
})

test('P32 on DEV: a refetch in the middle of a drag (someone adds a tank) neither cancels it nor moves the drop', async ({ page }) => {
  const brand = await made.brand('Galactic')
  const [fv, target] = [await made.tank('FV'), await made.tank('Serving')]
  const batch = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 3), tank_ids: [fv.id] })
  await page.clock.install()
  await openGantt(page)
  // The rows can be below the grid's fold: the drag scrolls it (D48).
  await dragToLane(page, page.getByTestId(`gantt-bar-${batch.id}-0`), `gantt-lane-${target.id}`, 20, () => page.clock.runFor(48))
  await expect(page.getByTestId(`gantt-lane-${target.id}`)).toHaveAttribute('data-drop', 'true')

  // Another person adds a tank; the minute's refetch arrives mid-drag.
  const added = await made.tank('Brite')
  const refetched = page.waitForResponse((r) => r.url().includes('/api/production/schedule') && r.request().method() === 'GET')
  await page.clock.fastForward(61_000)
  await refetched
  await expect(page.getByTestId(`gantt-row-${added.id}`)).toBeVisible()
  await expect(page.getByTestId(`gantt-lane-${target.id}`)).toHaveAttribute('data-drop', 'true')
  await page.mouse.up()
  await expect(snack(page)).toHaveText(`${batch.label} → ${target.name}.`)
  expect((await batchOf(batch.id)).vessels).toEqual([{ vessel_index: 0, tank_id: target.id }])
})

test('minor 5: a bar dropped over the tank column, or a dot outside the chart, is not moved', async ({ page }) => {
  const brand = await made.brand('Enos')
  const fv = await made.tank('FV')
  const batch = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 5), tank_ids: [fv.id] })
  await openGantt(page)
  const bar = page.getByTestId(`gantt-bar-${batch.id}-0`)
  await bar.scrollIntoViewIfNeeded()
  const box = (await bar.boundingBox())!
  const column = (await page.getByTestId(`gantt-tank-name-${fv.id}`).boundingBox())!
  // Left, past the chart's edge, released over the tank names.
  await page.mouse.move(box.x + 10, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 3 })
  await page.mouse.move(column.x + 10, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  // A dot dragged down out of the chart.
  const dot = page.getByTestId(`gantt-step-${stepOf(batch, 'FDH').id}`)
  const d = (await dot.boundingBox())!
  const chart = (await page.getByTestId('gantt').boundingBox())!
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2)
  await page.mouse.down()
  await page.mouse.move(d.x + d.width / 2 + 40, d.y + 6, { steps: 3 })
  await page.mouse.move(d.x + d.width / 2 + 40, chart.y + chart.height + 40, { steps: 12 })
  await page.mouse.up()

  await expect(page.getByTestId('move-prompt')).toHaveCount(0)
  await expect(page.getByTestId('gantt-snack-text')).toHaveCount(0)
  const after = await batchOf(batch.id)
  for (const s of batch.steps) expect(after.steps.find((x) => x.id === s.id)!.due_on).toBe(s.due_on)
})

test('minor 4: double-clicking Apply in the move prompt doesn’t open the batch dialog underneath', async ({ page }) => {
  const brand = await made.brand('Crusher')
  const fv = await made.tank('FV')
  const batch = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 2), tank_ids: [fv.id] })
  await openGantt(page)
  await dragBy(page, page.getByTestId(`gantt-step-${stepOf(batch, 'FDH').id}`), 1)
  // The prompt is centred over the chart: the second click lands on a lane, a bar or a dot.
  await page.getByTestId('move-apply').dblclick()
  await expect(page.getByTestId('move-prompt')).toBeHidden()
  await expect(snack(page)).toContainText('FDH moved 1 day later')
  await page.waitForTimeout(300)
  for (const id of ['batch-dialog', 'step-dialog', 'gantt-spot-menu']) await expect(page.getByTestId(id)).toHaveCount(0)
})

test('P32, P33: drag the after-transfer part to another tank, then a part to Unassigned (No tank flag near its fill)', async ({ page }) => {
  const brand = await made.brand('Fest')
  const [fv7, s2, s1] = [await made.tank('FV7'), await made.tank('Serving 2', 30), await made.tank('Serving 1', 30)]
  const batch = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), -30), tank_ids: [fv7.id, s2.id] })
  await openGantt(page)
  await dragToLane(page, page.getByTestId(`gantt-bar-${batch.id}-1`), `gantt-lane-${s1.id}`)
  await page.mouse.up()
  await expect(snack(page)).toHaveText(`${batch.label} (after transfer) → ${s1.name}.`)
  expect((await batchOf(batch.id)).vessels).toEqual([
    { vessel_index: 0, tank_id: fv7.id },
    { vessel_index: 1, tank_id: s1.id },
  ])

  // P33: a batch filling in 2 days dragged to Unassigned gets the flag.
  const soon = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 2), tank_ids: [fv7.id] })
  await page.reload()
  await dragToLane(page, page.getByTestId(`gantt-bar-${soon.id}-0`), 'gantt-lane-unassigned')
  await page.mouse.up()
  await expect(snack(page)).toHaveText(`${soon.label} → Unassigned.`)
  await expect(page.getByTestId('gantt-row-unassigned').getByTestId(`gantt-bar-${soon.id}-0`)).toBeVisible()
  const flag = (await schedule()).flags.find((f) => f.kind === 'no_tank' && f.batch_ids.includes(soon.id))
  expect(flag?.message).toMatch(/has no tank and fills/)
  await expect(page.getByTestId(`gantt-badge-${soon.id}-0`)).toHaveText('!')
})

test('P36–P39: the brew-day number: suggestion, duplicates, a non-plain number; un-checking frees it', async ({ page }) => {
  const brand = await made.brand('Altruism')
  const a = await made.plan({ brand_id: brand.id, template: ALE, brew_on: today() })
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: today() })
  const next = (await schedule()).next_batch_number
  const taken = (await schedule()).batches.find((x) => x.batch_number && /^\d+$/.test(x.batch_number))!

  // P39: the API refuses a planned brew day without a number.
  const api = await apiAs('brewer1')
  const res = await api.post(`/api/production/steps/${stepOf(a, 'Brew day').id}/complete`, { data: { done_on: today() } })
  expect(res.status()).toBe(422)
  expect((await res.json()).error).toBe('batch_number_required')

  await openGantt(page)
  await page.getByTestId(`gantt-step-${stepOf(a, 'Brew day').id}`).click()
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('number-prompt')).toContainText(`Brew day for ${a.label}`)
  await expect(page.getByTestId('number-input')).toHaveValue(next)
  await page.getByTestId('number-input').fill(taken.batch_number!)
  await page.getByTestId('number-save').click()
  await expect(page.getByTestId('number-helper')).toHaveText(`#${taken.batch_number} is already ${taken.label}.`)
  await page.getByTestId('number-input').fill(`${next}b`)
  await expect(page.getByTestId('number-helper')).toHaveText(`Not a plain number; the next suggestion still counts from #${Number(next) - 1}.`)
  await page.getByTestId('number-save').click()
  await expect(page.getByTestId('number-prompt')).toBeHidden()
  await expect(snack(page)).toContainText(`is #${next}b.`)
  expect((await batchOf(a.id)).label).toMatch(new RegExp(`#${next}b$`))

  // P37: the suggestion is still `next`; "<next>B" is a duplicate.
  await page.getByTestId(`gantt-step-${stepOf(b, 'Brew day').id}`).click()
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('number-input')).toHaveValue(next)
  await page.getByTestId('number-input').fill(`${next}B`)
  await page.getByTestId('number-save').click()
  await expect(page.getByTestId('number-helper')).toHaveText(new RegExp(`^#${next}B is already .*#${next}b\\.$`))
  await page.getByTestId('number-cancel').click()
  expect((await batchOf(b.id)).status).toBe('planned')
  await page.getByTestId('step-dialog-close').click()

  // P38: Mark not done frees the number.
  await page.getByTestId(`gantt-step-${stepOf(a, 'Brew day').id}`).click()
  await page.getByTestId('step-uncheck').click()
  await expect(snack(page)).toContainText(`#${next}b is planned again; its number is freed.`)
  expect((await batchOf(a.id)).p_number).toMatch(/^P\d+$/)
})

test('P40: a brewed batch’s number changes in the batch dialog; a taken one is refused', async ({ page }) => {
  const brand = await made.brand('Crusher')
  const batch = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), -3) })
  const tag = `T${Date.now().toString(36).slice(-5)}`
  await made.checkOff(stepOf(batch, 'Brew day'), tag)
  const taken = (await schedule()).batches.find((x) => x.batch_number && /^\d+$/.test(x.batch_number))!
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${batch.id}-0`).click()
  await page.getByTestId('batch-number').fill(`${tag}x`)
  await page.getByTestId('batch-number-save').click()
  await expect(page.getByTestId('batch-dialog-title')).toHaveText(`${brand.name} #${tag}x`)
  await page.getByTestId('batch-number').fill(taken.batch_number!)
  await page.getByTestId('batch-number-save').click()
  await expect(page.getByTestId('batch-dialog-error')).toHaveText(`#${taken.batch_number} is already ${taken.label}.`)
})

test('P53, P54: planned into a tank before the last batch’s CIP: overlap and dirty fill (!2); bigger than the tank', async ({ page }) => {
  const brand = await made.brand('Galactic')
  const fv2 = await made.tank('FV2')
  const first = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 1), tank_ids: [fv2.id] })
  const cip = first.steps.find((s) => s.behavior === 'cip')!
  const second = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(cip.due_on, -1), tank_ids: [fv2.id] })
  const kinds = (await schedule()).flags.filter((f) => f.batch_ids.includes(second.id)).map((f) => f.kind).sort()
  expect(kinds).toEqual(['dirty_fill', 'tank_overlap'])
  await openGantt(page)
  await expect(page.getByTestId(`gantt-badge-${second.id}-0`)).toHaveText('!2')

  const fv5 = await made.tank('FV5')
  const big = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 40), volume: 30, tank_ids: [fv5.id] })
  const flag = (await schedule()).flags.find((f) => f.kind === 'too_big' && f.batch_ids.includes(big.id))!
  expect(flag.message).toBe(`${big.label} (30 bbl) is bigger than ${fv5.name} (20 bbl).`)
})

test('P60: Delete planned batch: gone, P-numbers renumber', async ({ page }) => {
  const brand = await made.brand('Enos')
  const doomed = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 1) })
  const before = await pNumbers()
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${doomed.id}-0`).click()
  await page.getByTestId('batch-delete').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('batch-dialog')).toBeHidden()
  await expect(snack(page)).toContainText(`${doomed.label} deleted.`)
  const after = await pNumbers()
  expect(after.has(doomed.id)).toBe(false)
  for (const [id, p] of after) {
    const was = Number(before.get(id)!.slice(1))
    expect(Number(p.slice(1))).toBe(was > Number(doomed.p_number!.slice(1)) ? was - 1 : was)
  }
  await page.reload()
  await expect(page.getByTestId(`gantt-bar-${doomed.id}-0`)).toHaveCount(0)
})

test('P109: planning copies a Split’s method: "Split - Filter" on the schedule', async ({ page }) => {
  const brand = await made.brand('Galactic')
  const types = Object.fromEntries((await stepTypes()).map((t) => [t.name, t.id]))
  const t = await createTemplate(tempTag('P109 split'))
  templatesMade.push(t.id)
  const full = await addTemplateStep(t.id, { step_type_id: types['Split'], day_offset: 20, split_method: 'filter' })
  expect(full.issues).toEqual([])
  const batch = await made.plan({ brand_id: brand.id, template: full.name, brew_on: addDays(today(), 3) })
  const split = batch.steps.find((s) => s.behavior === 'split')!
  expect(split.name).toBe('Split - Filter')
  await openGantt(page)
  await expect(page.getByTestId(`gantt-step-${split.id}`)).toHaveAttribute('aria-label', /^Split - Filter ·/)
})

test('P112: a partial Package done leaves the batch and the tank as they were', async ({ page }) => {
  const brand = await made.brand('Crusher')
  const fv4 = await made.tank('FV4')
  const batch = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), -30), tank_ids: [fv4.id] })
  await made.checkOff(stepOf(batch, 'Brew day'), `T${Date.now().toString(36).slice(-5)}`)
  const pkg = stepOf(batch, 'Package')

  // Switching an unfinished Package to Partial in the step dialog renames it.
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${batch.id}-0`).click()
  await page.getByTestId(`batch-step-note-${pkg.id}`).click()
  await page.getByTestId('step-package').click()
  await page.getByTestId('step-package-partial').click()
  await page.getByTestId('step-dialog-save').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()
  await expect(page.getByTestId(`batch-step-name-${pkg.id}`)).toHaveText('Package - Partial')
  await page.getByTestId('batch-dialog-close').click()

  await made.checkOff({ ...pkg, name: 'Package - Partial' })
  const after = await batchOf(batch.id)
  expect(after.status).toBe('fermenting')
  const sched = await schedule()
  const status = sched.statuses.find((s) => s.tank_id === fv4.id)!
  expect(status).toMatchObject({ state: 'in_use', batch_label: after.label })
  expect(sched.flags.filter((f) => f.tank_id === fv4.id && f.kind === 'dirty_no_cip')).toEqual([])
})
