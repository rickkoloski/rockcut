import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, Made, openGantt, snack, stepOf, today, type SBatch } from './schedule'
import { dayLabel } from '../../../src/lib/gantt'

// D48 DEV gate fix cycle 2 (lead decisions 3): no transfer into the tank the
// beer goes into next (N1), a brewed part's number line (N2), a part's
// volume (N3), the split dialog's stale refusal (N5), and a brewed split's
// part 2 opening on a click (QA's unconfirmed note).

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const LAGER = '[SEED] Lager with transfer'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())
const tag = () => `T${Date.now().toString(36).slice(-5)}`

async function openBatch(page: Page, b: SBatch, vessel = 0) {
  await page.getByTestId(`gantt-bar-${b.id}-${vessel}`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

test('N1: Into leaves out the next tank; the preview refuses it and doesn’t count the old exit’s CIP; the CIP goes on with that exit', async ({ page }) => {
  const [a, b, c, d] = [await made.tank('FV2'), await made.tank('Q1RB'), await made.tank('Q1RC'), await made.tank('Q1RD')]
  const brand = await made.brand('Lager')
  const planned = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), 7), tank_ids: [a.id, b.id] })
  const transfer = planned.steps.find((s) => s.behavior === 'transfer' && s.vessel_index === 1)!.due_on
  // A third tank (c) later on, so b is the next tank after a and c is the last.
  const api = await apiAs('brewer1')
  expect((await api.post(`${P}/batches/${planned.id}/transfers`, { data: { due_on: addDays(transfer, 2), tank_id: c.id } })).status()).toBe(201)
  await openGantt(page)
  await openBatch(page, planned)
  await page.getByTestId('batch-add-transfer').click()

  // The day before the template's transfer: neither a (here) nor b (next) is offered.
  await page.getByTestId('add-transfer-day').fill(addDays(transfer, -1))
  await page.getByTestId('add-transfer-tank').click()
  await expect(page.getByTestId(`add-transfer-tank-${a.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`add-transfer-tank-${b.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`add-transfer-tank-${c.id}`)).toHaveCount(1)
  await page.keyboard.press('Escape')

  // Picked on a later day (in c, b is fine), then the day changes: the preview refuses before saving.
  await page.getByTestId('add-transfer-day').fill(addDays(transfer, 3))
  await page.getByTestId('add-transfer-tank').click()
  await page.getByTestId(`add-transfer-tank-${b.id}`).click()
  await page.getByTestId('add-transfer-day').fill(addDays(transfer, -1))
  const next = `The beer goes into ${b.name} next, on ${dayLabel(transfer)}.`
  await expect(page.getByTestId('add-transfer-preview')).toHaveText(next)
  await page.getByTestId('add-transfer-dialog-save').click()
  await expect(page.getByTestId('add-transfer-dialog-error')).toContainText(next)
  expect((await batchOf(planned.id)).vessels.map((v) => v.tank_id)).toEqual([a.id, b.id, c.id])

  // Into d: the old exit's CIP (a, on the transfer day) isn't listed as moving.
  await page.getByTestId('add-transfer-tank').click()
  await page.getByTestId(`add-transfer-tank-${d.id}`).click()
  const preview = (await page.getByTestId('add-transfer-preview').textContent())!
  const [, count, names] = preview.match(/^(\d+) steps? from that day \(([^)]*)\) move to /)!
  expect(names).not.toContain('CIP')
  expect(preview).toContain(`${a.name} gets a CIP & Sanitize that day.`)
  await page.getByTestId('add-transfer-dialog-save').click()
  await expect(snack(page)).toContainText(`${count} step${count === '1' ? '' : 's'} of ${planned.label} move to ${d.name}`)

  // The actual move: a → d → b → c, and the CIP on the template transfer's day now cleans d, the tank that transfer leaves.
  const after = await batchOf(planned.id)
  expect(after.vessels.map((v) => v.tank_id)).toEqual([a.id, d.id, b.id, c.id])
  const cips = after.steps.filter((s) => s.behavior === 'cip' && s.due_on === transfer)
  expect(cips.map((s) => s.vessel_index)).toEqual([1])
})

test('N2, N3, and a brewed split’s part 2 opens on a click; N5: the split dialog clears a stale refusal', async ({ page }) => {
  const [fv, s1] = [await made.tank('FV2'), await made.tank('Q1RD', 30)]
  const brand = await made.brand('Pils')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: today(), tank_ids: [fv.id] })
  const number = tag()
  await made.checkOff(stepOf(b, 'Brew day'), number)
  const api = await apiAs('brewer1')
  const res = await api.post(`${P}/batches/${b.id}/split`, {
    data: { due_on: addDays(today(), 1), parts: [{ stays: true, volume_bbl: 12 }, { tank_id: s1.id, volume_bbl: 8 }] },
  })
  expect(res.status()).toBe(201)
  const [, p2] = (await res.json()).data.part_ids as number[]
  // For N5: a batch that isn't split.
  const other = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 14), tank_ids: [(await made.tank('FV3')).id] })
  await openGantt(page)

  // Part 2, in its own tank, after brew day is checked off.
  await page.getByTestId(`gantt-bar-${p2}-0`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
  await expect(page.getByTestId('batch-dialog-pnumber')).toHaveText(`#${number}.2 · the parent’s number`)
  await expect(page.getByTestId('batch-volume')).toHaveAttribute('readonly', '')
  await expect(page.getByTestId('batch-dialog')).toContainText('Undo the split first to change it')
  await expect(page.getByTestId('batch-volume-save')).toBeDisabled()
  await page.getByTestId('batch-dialog-close').click()
  expect((await (await api.patch(`${P}/batches/${p2}`, { data: { volume_bbl: 9 } })).json()).error).toBe('split')

  // N5.
  await openBatch(page, other)
  await page.getByTestId('batch-split').click()
  await page.getByTestId('split-day').fill(stepOf(other, 'Brew day').due_on)
  await page.getByTestId('split-dialog-save').click()
  await expect(page.getByTestId('split-dialog-error')).toContainText('The split has to be after brew day.')
  await page.getByTestId('split-day').fill(addDays(stepOf(other, 'Brew day').due_on, 2))
  await expect(page.getByTestId('split-dialog-error')).toHaveCount(0)
})
