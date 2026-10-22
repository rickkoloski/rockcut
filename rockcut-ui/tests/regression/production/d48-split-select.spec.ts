import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, dragBy, Made, openGantt, schedule, snack, stepOf, today, undo, type SBatch } from './schedule'

// D48 task 4: splits and Undo split (P75–P82, P89, P110), multi-select and
// Shift-drag (P85, P86, P88, P113), clean / dirty marks (P114–P117). Each
// test works on its own [TEST-TEMP] brand, tanks and batches. P87 (the Pixel
// long-press selection) is checked by hand at the DEV gate.
//
// The [SEED] Standard ale, from brew day: PDH 7, FDH 13, Set temp 58/48/38/32°
// on 18–21, Carb 23, Package and CIP 25.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
test.afterAll(() => made.cleanup())

async function planned(label: string, tanks: (number | null)[] = [], brewIn = 2) {
  const brand = await made.brand(label)
  return made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewIn), tank_ids: tanks })
}

async function openBatch(page: Page, b: SBatch) {
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

async function pick(page: Page, select: string, option: string) {
  await page.getByTestId(select).click()
  await page.getByTestId(option).click()
}

/** Split… in the batch dialog: part 0 stays (or goes to `tanks[0]`), the others to their tanks. */
async function splitThroughDialog(page: Page, f: { day: string; method?: 'filter'; parts: { tank: number | 'stay'; volume: number }[] }) {
  await page.getByTestId('batch-split').click()
  await page.getByTestId('split-day').fill(f.day)
  if (f.method) await pick(page, 'split-method', `split-method-${f.method}`)
  for (const [i, p] of f.parts.entries()) {
    if (i >= 2) await page.getByTestId('split-add-part').click()
    await pick(page, `split-tank-${i}`, `split-tank-${i}-${p.tank}`)
    await page.getByTestId(`split-volume-${i}`).fill(String(p.volume))
  }
  await page.getByTestId('split-dialog-save').click()
}

const partsOf = async (b: SBatch) => (await schedule()).batches.filter((x) => x.split_parent_id === b.id).sort((x, y) => x.part_number! - y.part_number!)

test('P75, P110: Split - Filter, 12 bbl stays, 8 bbl to another tank: labels, own steps, gold arrows; Undo (P89)', async ({ page }) => {
  const [fv, s1] = [await made.tank('FV2'), await made.tank('Serving 1', 30)]
  const b = await planned('Galactic', [fv.id])
  const day = addDays(stepOf(b, 'FDH').due_on, 3)
  await openBatch(page, b)
  const rowHeight = async () => (await page.getByTestId(`gantt-row-${fv.id}`).boundingBox())!.height
  const before = await rowHeight()
  await splitThroughDialog(page, { day, method: 'filter', parts: [{ tank: 'stay', volume: 12 }, { tank: s1.id, volume: 8 }] })
  await expect(snack(page)).toContainText(`${b.label} split on`)
  await expect(snack(page)).toContainText(`${b.label}.1 (12 bbl) stays in ${fv.name}; ${b.label}.2 (8 bbl) → ${s1.name}.`)

  const parts = await partsOf(b)
  expect(parts.map((p) => p.label)).toEqual([`${b.label}.1`, `${b.label}.2`])
  expect(parts.map((p) => p.vessels[0].tank_id)).toEqual([fv.id, s1.id])
  expect(stepOf(await batchOf(b.id), 'Split - Filter').due_on).toBe(day)
  for (const p of parts) {
    expect(p.steps.map((s) => s.name)).toContain('Carb')
    await expect(page.getByTestId(`gantt-split-${b.id}-${p.id}`)).toBeAttached()
    await expect(page.getByTestId(`gantt-bar-${p.id}-0`)).toBeVisible()
  }
  // The part that stays shares its parent's lane: FV2's row doesn't grow (lead decisions 1).
  expect(await rowHeight()).toBe(before)
  // A part stays: no CIP for FV2 on the split day.
  expect((await batchOf(b.id)).steps.some((s) => s.name === 'CIP & Sanitize' && s.due_on === day)).toBe(false)

  await undo(page)
  expect(await partsOf(b)).toEqual([])
  expect((await batchOf(b.id)).steps.some((s) => s.name.startsWith('Split'))).toBe(false)
})

test('P76–P78: the volumes must add up, two parts can’t share a tank; no part staying adds a CIP', async ({ page }) => {
  const [fv, a, c] = [await made.tank('FV2'), await made.tank('FV6'), await made.tank('FV7')]
  const b = await planned('Fest', [fv.id])
  const day = addDays(stepOf(b, 'FDH').due_on, 3)
  await openBatch(page, b)
  await splitThroughDialog(page, { day, parts: [{ tank: 'stay', volume: 12 }, { tank: a.id, volume: 6 }] })
  await expect(page.getByTestId('split-total')).toHaveText('Total 18 of 20 bbl')
  await expect(page.getByTestId('split-dialog-error')).toContainText(`The parts add up to 18 bbl, but ${b.label} is 20 bbl.`)

  await pick(page, 'split-tank-0', `split-tank-0-${a.id}`)
  await page.getByTestId('split-volume-1').fill('8')
  await page.getByTestId('split-dialog-save').click()
  await expect(page.getByTestId('split-dialog-error')).toContainText('Two parts can’t go into the same tank.')

  await pick(page, 'split-tank-1', `split-tank-1-${c.id}`)
  await page.getByTestId('split-dialog-save').click()
  await expect(page.getByTestId('split-dialog')).toBeHidden()
  const after = await batchOf(b.id)
  expect(after.steps.filter((s) => s.name === 'CIP & Sanitize' && s.due_on === day && s.vessel_index === 0)).toHaveLength(1)
})

test('P79–P82: parts move on their own; planned parts take the number at brew day; Undo split, refused once a part step is done', async ({ page }) => {
  const [fv, s1] = [await made.tank('FV2'), await made.tank('Serving 1', 30)]
  const api = await apiAs('brewer1')
  // Brewed 20 days ago; split yesterday, part 1 stays.
  const b = await planned('Crusher', [fv.id], -20)
  await made.checkOff(stepOf(b, 'Brew day'), `T${Date.now() % 1_000_000}`)
  const res = await api.post(`${P}/batches/${b.id}/split`, {
    data: { due_on: addDays(today(), -1), parts: [{ stays: true, volume_bbl: 10 }, { tank_id: s1.id, volume_bbl: 10 }] },
  })
  expect(res.status()).toBe(201)
  let [p1, p2] = await partsOf(b)
  const number = (await batchOf(b.id)).batch_number
  expect([p1.label, p2.label].map((l) => l.endsWith(`#${number}.1`) || l.endsWith(`#${number}.2`))).toEqual([true, true])

  // P79: part 2's Carb a day later; part 1's stays.
  await openGantt(page)
  await dragBy(page, page.getByTestId(`gantt-step-${stepOf(p2, 'Carb').id}`), 1)
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toContainText('Carb moved 1 day later')
  ;[p1, p2] = await partsOf(b)
  expect(stepOf(p1, 'Carb').due_on).toBe(stepOf(b, 'Carb').due_on)
  expect(stepOf(p2, 'Carb').due_on).toBe(addDays(stepOf(b, 'Carb').due_on, 1))

  // P81: a part step done (today's Set temp in part 2): Undo split is refused.
  const due = p2.steps.find((s) => s.due_on <= today() && !s.done_on)!
  await made.checkOff(due)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await page.getByTestId('batch-undo-split').click()
  await page.getByRole('button', { name: 'Undo split' }).last().click()
  await expect(page.getByTestId('batch-dialog-error')).toContainText('Some steps on the parts are already done')
  await page.getByTestId('batch-dialog-close').click()

  // P80: done step undone, then Undo split merges back with part 1's schedule.
  await api.post(`${P}/steps/${due.id}/uncomplete`)
  await page.reload()
  await page.getByTestId(`gantt-bar-${p2.id}-0`).click()
  await page.getByTestId('batch-undo-split').click()
  await page.getByRole('button', { name: 'Undo split' }).last().click()
  await expect(snack(page)).toContainText(`Split undone: ${(await batchOf(b.id)).label} is one batch again`)
  expect(await partsOf(b)).toEqual([])
  const merged = await batchOf(b.id)
  expect(stepOf(merged, 'Carb').due_on).toBe(stepOf(p1, 'Carb').due_on)
  expect(merged.vessels).toEqual([{ vessel_index: 0, tank_id: fv.id }])

  // P82: a planned batch's parts are P-numbered, then take its number at brew day.
  const later = await planned('Altruism', [fv.id], 30)
  await api.post(`${P}/batches/${later.id}/split`, { data: { due_on: addDays(later.steps[0].due_on, 16), parts: [{ stays: true, volume_bbl: 10 }, { volume_bbl: 10 }] } })
  const pn = (await batchOf(later.id)).p_number
  expect((await partsOf(later)).map((x) => x.label.split(' ').at(-1))).toEqual([`${pn}.1`, `${pn}.2`])
})

test('P85, P86, P88: Ctrl-click selects, the drag moves them together; Assign to…; Shift-click selects a range', async ({ page }) => {
  const fv = await made.tank('FV4')
  const b = await planned('Enos', [fv.id])
  const dot = (name: string) => page.getByTestId(`gantt-step-${stepOf(b, name).id}`)
  await openGantt(page)
  await dot('PDH').scrollIntoViewIfNeeded()
  for (const n of ['PDH', 'FDH', 'Set temp - 58°']) await dot(n).click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByTestId('gantt-selection-count')).toHaveText('3 steps selected')
  await expect(dot('FDH')).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('step-dialog')).toHaveCount(0)

  // P85: drag one; all three move, and the prompt asks about what follows them.
  await dragBy(page, dot('FDH'), 1)
  await expect(page.getByTestId('move-prompt-sub')).toBeVisible()
  await expect(page.getByTestId('move-prompt')).toContainText('3 steps moved 1 day later')
  await page.getByTestId('move-only').check()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toHaveText('3 steps moved 1 day later.')
  const after = await batchOf(b.id)
  for (const n of ['PDH', 'FDH', 'Set temp - 58°']) expect(stepOf(after, n).due_on).toBe(addDays(stepOf(b, n).due_on, 1))
  expect(stepOf(after, 'Set temp - 48°').due_on).toBe(stepOf(b, 'Set temp - 48°').due_on)
  await page.getByTestId('gantt-selection-done').click()
  await expect(page.getByTestId('gantt-selection-bar')).toHaveCount(0)

  // P86: four ramp steps → Assign to Riley Wort.
  for (const n of ['Set temp - 58°', 'Set temp - 48°', 'Set temp - 38°', 'Set temp - 32°']) await dot(n).click({ modifiers: ['ControlOrMeta'] })
  await page.getByTestId('gantt-selection-assign').click()
  await page.getByRole('menuitem', { name: 'Riley Wort' }).click()
  await expect(snack(page)).toHaveText('4 steps assigned to Riley Wort.')
  const assigned = await batchOf(b.id)
  for (const n of ['Set temp - 58°', 'Set temp - 48°', 'Set temp - 38°', 'Set temp - 32°']) expect(stepOf(assigned, n).assignee_id).not.toBeNull()
  await page.getByTestId('gantt-selection-done').click()

  // P88: Shift-click two steps: everything between them in that tank.
  await dot('FDH').click({ modifiers: ['Shift'] })
  await dot('Carb').click({ modifiers: ['Shift'] })
  const fdh = stepOf(assigned, 'FDH').due_on
  const carb = stepOf(assigned, 'Carb').due_on
  const between = assigned.steps.filter((s) => !s.marker && s.due_on >= fdh && s.due_on <= carb).length
  await expect(page.getByTestId('gantt-selection-count')).toHaveText(`${between} steps selected`)
})

test('P113: Shift-drag moves only that step, with no prompt; Undo puts it back', async ({ page }) => {
  const fv = await made.tank('FV5')
  const b = await planned('Galactic', [fv.id])
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await page.keyboard.down('Shift')
  await dragBy(page, page.getByTestId(`gantt-step-${fdh.id}`), 1)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('move-prompt')).toHaveCount(0)
  await expect(snack(page)).toHaveText('FDH moved 1 day later (only this step).')
  let after = await batchOf(b.id)
  expect(stepOf(after, 'FDH').due_on).toBe(addDays(fdh.due_on, 1))
  expect(stepOf(after, 'Set temp - 58°').due_on).toBe(stepOf(b, 'Set temp - 58°').due_on)
  await undo(page)
  after = await batchOf(b.id)
  expect(stepOf(after, 'FDH').due_on).toBe(fdh.due_on)
})

test('P115, P114, P117: Mark dirty, a fill flags it; Mark clean with a note clears it; Remove from History; Undo', async ({ page }) => {
  const tank = await made.tank('Serving 3', 30)
  const status = page.getByTestId(`gantt-status-${tank.id}`)
  await openGantt(page)
  await page.getByTestId(`gantt-tank-menu-${tank.id}`).click()
  await expect(page.getByTestId('tank-panel-mark-clean')).toHaveCount(0)
  await page.getByTestId('tank-panel-mark-dirty').click()
  await page.getByTestId('mark-day').fill(addDays(today(), -1))
  await page.getByTestId('mark-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toContainText(`${tank.name} marked dirty`)
  await expect(status).toHaveText('Empty · dirty 1 day · no CIP planned')
  await page.keyboard.press('Escape')

  // A batch planned into it next week: "Filling a dirty tank".
  const b = await planned('Fest', [tank.id], 7)
  await page.reload()
  const flags = async () => (await schedule()).flags.filter((f) => f.tank_id === tank.id && !f.signed_off).map((f) => f.kind)
  expect(await flags()).toEqual(expect.arrayContaining(['dirty_fill', 'dirty_no_cip']))
  await expect(page.getByTestId(`gantt-badge-${b.id}-0`)).toBeVisible()

  // P114: Mark clean today, with a note.
  await page.getByTestId(`gantt-tank-menu-${tank.id}`).click()
  await expect(page.getByTestId('tank-panel-mark-dirty')).toHaveCount(0)
  await page.getByTestId('tank-panel-mark-clean').click()
  await page.getByTestId('mark-note').fill('Hosed and sanitized after the gasket job')
  await page.getByTestId('mark-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(status).toHaveText('Sani 0 days')
  expect(await flags()).toEqual([])
  const marks = (await (await apiAs('brewer1')).get(`${P}/schedule`).then((r) => r.json())).data.condition_marks.filter((m: { tank_id: number }) => m.tank_id === tank.id)
  const clean = marks.find((m: { state: string }) => m.state === 'clean')
  await expect(page.getByTestId(`tank-panel-mark-${clean.id}`)).toContainText('Hosed and sanitized after the gasket job')
  await page.keyboard.press('Escape')
  const marker = page.getByTestId(`gantt-mark-${clean.id}`)
  await expect(marker).toHaveAttribute('data-state', 'clean')
  await marker.hover()
  await expect(page.getByRole('tooltip')).toHaveText(/^Marked clean by Jake Brewer · .* · “Hosed and sanitized after the gasket job”$/)

  // P117: Remove it from History: back to dirty; Undo brings it back.
  await page.getByTestId(`gantt-tank-menu-${tank.id}`).click()
  await page.getByTestId(`tank-panel-mark-remove-${clean.id}`).click()
  await expect(status).toHaveText('Empty · dirty 1 day · no CIP planned')
  // Close, not Escape: Escape also dismisses the message with Undo.
  await page.getByTestId('tank-panel').getByRole('button', { name: 'Close' }).click()
  await undo(page)
  await expect(status).toHaveText('Sani 0 days')
})

test('P116: a tank with beer in it offers no Mark clean / Mark dirty', async ({ page }) => {
  const fv = await made.tank('FV8')
  const b = await planned('Altruism', [fv.id], -3)
  await made.checkOff(stepOf(b, 'Brew day'), `T${Date.now() % 1_000_000}`)
  await openGantt(page)
  await page.getByTestId(`gantt-tank-menu-${fv.id}`).click()
  await expect(page.getByTestId('tank-panel')).toBeVisible()
  await expect(page.getByTestId('tank-panel-mark-clean')).toHaveCount(0)
  await expect(page.getByTestId('tank-panel-mark-dirty')).toHaveCount(0)
  const res = await (await apiAs('brewer1')).post(`${P}/tanks/${fv.id}/condition`, { data: { state: 'clean' } })
  expect(res.status()).toBe(422)
  expect((await res.json()).error).toBe('tank_in_use')
})
