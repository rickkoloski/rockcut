import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, dragBy, gantt, Made, openGantt, snack, stepOf, today, type SBatch } from './schedule'

// D48 DEV gate fix cycle 1 (lead decisions 2): days outside the beer's stay
// (M1), split parents and parts (M2, minors 6 and 8), the current tank (M3),
// the template-change message (7a), the zoom tooltip (9), two-batch moves
// (10), keyboard selection (11) and auto-scroll on a phone (Matt, Pixel).

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())

async function planned(label: string, tanks: (number | null)[] = [], brewIn = 21) {
  const brand = await made.brand(label)
  return made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewIn), tank_ids: tanks })
}

async function openBatch(page: Page, b: SBatch) {
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

test('M1, M3: the dialogs default to a day the beer is there; Into leaves out its own tank; days outside are refused', async ({ page }) => {
  const [fv, s1] = [await made.tank('FV2'), await made.tank('Serving 1', 30)]
  const b = await planned('Galactic', [fv.id])
  const brew = stepOf(b, 'Brew day').due_on
  await openGantt(page)
  await openBatch(page, b)

  // Add step and Add a ramp: the day after brew day, three weeks out.
  await page.getByTestId('batch-add-step').click()
  await expect(page.getByTestId('add-step-day')).toHaveValue(addDays(brew, 1))
  await page.getByTestId('add-step-dialog-cancel').click()
  await page.getByTestId('batch-add-ramp').click()
  await expect(page.getByTestId('add-ramp-first-on')).toHaveValue(addDays(brew, 1))
  await page.getByTestId('add-ramp-dialog-cancel').click()

  // Add transfer: the day after brew day; its own tank isn't offered; before brew day is refused.
  await page.getByTestId('batch-add-transfer').click()
  await expect(page.getByTestId('add-transfer-day')).toHaveValue(addDays(brew, 1))
  await page.getByTestId('add-transfer-tank').click()
  await expect(page.getByTestId(`add-transfer-tank-${fv.id}`)).toHaveCount(0)
  await page.getByTestId(`add-transfer-tank-${s1.id}`).click()
  await page.getByTestId('add-transfer-day').fill(today())
  await expect(page.getByTestId('add-transfer-preview')).toHaveText('The beer isn’t in that tank on that day.')
  await page.getByTestId('add-transfer-dialog-save').click()
  await expect(page.getByTestId('add-transfer-dialog-error')).toContainText('The beer isn\'t in that tank on that day.')
  await page.getByTestId('add-transfer-dialog-cancel').click()

  // The API: the same tank, and a step before brew day.
  const api = await apiAs('brewer1')
  const same = await api.post(`${P}/batches/${b.id}/transfers`, { data: { due_on: addDays(brew, 5), tank_id: fv.id } })
  expect(await same.json()).toEqual({ error: 'same_tank', message: `The beer is already in ${fv.name}.` })
  const early = await api.post(`${P}/batches/${b.id}/steps`, { data: { name: 'Early', due_on: addDays(brew, -1) } })
  expect((await early.json()).message).toBe("A step can't come before brew day.")
})

test('M2, minors 6 and 8: a split parent can’t be deleted or resized; a part shows its number and has no Delete', async ({ page }) => {
  const [fv, s1] = [await made.tank('FV2'), await made.tank('Serving 1', 30)]
  const b = await planned('Fest', [fv.id], 2)
  const api = await apiAs('brewer1')
  const res = await api.post(`${P}/batches/${b.id}/split`, {
    data: { due_on: addDays(stepOf(b, 'FDH').due_on, 3), parts: [{ stays: true, volume_bbl: 10 }, { tank_id: s1.id, volume_bbl: 10 }] },
  })
  expect(res.status()).toBe(201)
  const [, p2] = (await res.json()).data.part_ids as number[]
  await openGantt(page)
  await openBatch(page, b)
  await expect(page.getByTestId('batch-delete')).toHaveCount(0)
  await expect(page.getByTestId('batch-delete-split-note')).toHaveText('Undo the split first to delete it.')
  await expect(page.getByTestId('batch-volume')).toHaveAttribute('readonly', '')
  await expect(page.getByTestId('batch-dialog')).toContainText('Undo the split first to change it')
  await page.getByTestId('batch-dialog-close').click()

  await page.getByTestId(`gantt-bar-${p2}-0`).click()
  const pn = (await batchOf(b.id)).p_number
  await expect(page.getByTestId('batch-dialog-pnumber')).toHaveText(`${pn}.2 · the real number is set when the parent’s brew day is checked off`)
  await expect(page.getByTestId('batch-delete')).toHaveCount(0)
  await page.getByTestId('batch-dialog-close').click()

  // The API refuses too.
  expect((await (await api.delete(`${P}/batches/${b.id}`)).json()).error).toBe('split')
  await api.delete(`${P}/batches/${b.id}/split`)
})

test('minor 7a: a template change names the added transfer it dropped', async ({ page }) => {
  const [fv, q] = [await made.tank('FV2'), await made.tank('Q1D')]
  const b = await planned('Enos', [fv.id], 2)
  const api = await apiAs('brewer1')
  expect((await api.post(`${P}/batches/${b.id}/transfers`, { data: { due_on: addDays(stepOf(b, 'FDH').due_on, 3), tank_id: q.id } })).status()).toBe(201)
  await openGantt(page)
  await openBatch(page, b)
  await page.getByTestId('batch-template').click()
  await page.getByRole('option', { name: '[SEED] Lager with transfer', exact: true }).click()
  await page.getByRole('button', { name: 'Change template' }).click()
  await expect(snack(page)).toHaveText(`${ALE} → [SEED] Lager with transfer. Dropped the added transfer into ${q.name}.`)
})

test('minors 9, 10, 11: the zoom tooltip; a two-batch move names both; Ctrl+Space selects and Escape clears', async ({ page }) => {
  const [fv, fw] = [await made.tank('FV4'), await made.tank('FV5')]
  const a = await planned('Altruism', [fv.id], 2)
  const c = await planned('Crusher', [fw.id], 4)
  await openGantt(page)
  await page.getByTestId('gantt-zoom').hover()
  await expect(page.getByRole('tooltip')).toHaveText('Weeks on screen')

  // Keyboard: Ctrl+Space on focused steps, then Escape.
  const dot = (b: SBatch, name: string) => page.getByTestId(`gantt-step-${stepOf(b, name).id}`)
  await dot(a, 'PDH').focus()
  await page.keyboard.press('Control+Space')
  await dot(a, 'FDH').focus()
  await page.keyboard.press('Control+Space')
  await expect(page.getByTestId('gantt-selection-count')).toHaveText('2 steps selected')
  await expect(page.getByTestId('step-dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('gantt-selection-bar')).toHaveCount(0)

  // Two batches: FDH of each, dragged a day.
  await dot(a, 'FDH').click({ modifiers: ['ControlOrMeta'] })
  const cFdh = dot(c, 'FDH')
  await cFdh.click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByTestId('gantt-selection-count')).toHaveText('2 steps selected')
  await dragBy(page, cFdh, 1)
  await expect(page.getByTestId('move-prompt-sub')).toHaveText('2 batches · 2 steps moved 1 day later')
  await expect(page.getByTestId(`move-following-batch-${a.id}`)).toContainText(a.label)
  await expect(page.getByTestId(`move-following-batch-${c.id}`)).toContainText(c.label)
  await page.getByTestId('move-cancel').click()
})

test.describe('a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('a drag toward the bottom of the screen scrolls the grid down, though the grid runs on below the screen (Matt, Pixel)', async ({ page }) => {
    const fv = await made.tank('FV')
    const b = await planned('Galactic', [fv.id], 2)
    // More rows, so there's somewhere to scroll to.
    for (const n of ['A', 'B', 'C', 'D']) await made.tank(`Row ${n}`)
    await openGantt(page)
    const grid = gantt(page)
    const box = (await grid.boundingBox())!
    expect(box.y + box.height).toBeGreaterThan(915)
    const bar = page.getByTestId(`gantt-bar-${b.id}-0`)
    await bar.scrollIntoViewIfNeeded()
    // Room to scroll: the grid a little up from its end, the bar still on screen.
    await grid.evaluate((e) => (e.scrollTop = Math.max(0, e.scrollHeight - e.clientHeight - 150)))
    const at = (await bar.boundingBox())!
    expect(at.y + at.height).toBeLessThan(915 - 60)
    const top = await grid.evaluate((e) => e.scrollTop)
    // The middle of the bar: its start is under the sticky tank column at this width.
    const [x, y] = [at.x + at.width / 2, at.y + at.height / 2]
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 6, { steps: 3 })
    // Inside the edge zone of the part of the grid on screen, but more than
    // 40 px above the grid's real bottom (off screen): the old zone missed it.
    const target = 915 - 25
    const g = (await grid.boundingBox())!
    expect(g.y + g.height - target).toBeGreaterThanOrEqual(40)
    await page.mouse.move(x, target, { steps: 10 })
    // The grid scrolls down to its end, then the page takes over.
    await expect.poll(() => grid.evaluate((e) => e.scrollTop), { timeout: 5000 }).toBeGreaterThan(top + 20)
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await page.mouse.up()
  })
})
