import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, succeeds } from './helpers'
import { addDays, addProcess, batchOf, dragBy, Made, openGantt, schedule, snack, stepOf, today, undo } from './schedule'

// D47 §3.9 flags and sign-off, §3.10 standalone CIPs, and two people at
// once: P52, P55–P59, P61.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const made = new Made()
const seedCips: number[] = []
test.afterAll(async () => {
  const api = await apiAs('brewer1')
  for (const id of seedCips) await succeeds(api.delete(`/api/production/cips/${id}`), `delete seed CIP ${id}`, [404])
  await made.cleanup()
})

const ALE = '[SEED] Standard ale'

test('P52: Add CIP & Sanitize, already done, on Serving 1: "Sani 0 days", the dirty flag clears; Undo puts it back', async ({ page }) => {
  const before = await schedule()
  const s1 = before.tanks.find((t) => t.name === 'Serving 1')!
  expect(before.statuses.find((s) => s.tank_id === s1.id)!.line).toMatch(/^Empty · dirty \d+ days · no CIP planned$/)
  await openGantt(page)
  await addProcess(page, 'cip')
  await page.getByTestId('cip-tank').click()
  await page.getByTestId(`cip-tank-${s1.id}`).click()
  await expect(page.getByTestId('cip-day')).toHaveValue(today())
  await page.getByTestId('cip-done').check()
  await page.getByTestId('cip-add-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('cip-add-dialog')).toBeHidden()
  await expect(snack(page)).toHaveText('CIP & Sanitize recorded in Serving 1.')
  const after = await schedule()
  seedCips.push(...after.cips.filter((c) => c.tank_id === s1.id && !before.cips.some((b) => b.id === c.id)).map((c) => c.id))
  await expect(page.getByTestId(`gantt-status-${s1.id}`)).toHaveText('Sani 0 days')
  expect(after.flags.some((f) => f.kind === 'dirty_no_cip' && f.tank_id === s1.id)).toBe(false)

  await undo(page)
  await expect(page.getByTestId(`gantt-status-${s1.id}`)).toHaveText(/no CIP planned$/)
  seedCips.splice(0)
})

test('P55–P57: sign off "No tank assigned" with a note; moving the batch reopens it; Remove sign-off', async ({ page }) => {
  const brand = await made.brand('Enos')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 2) })
  const key = `no_tank:${b.id}.0`
  await openGantt(page)
  const chipBefore = await page.getByTestId('gantt-flags').textContent()
  await page.getByTestId('gantt-flags').click()
  const row = page.getByTestId(`flag-${key}`)
  await expect(row).toContainText(`${b.label} has no tank and fills`)
  await row.getByTestId('flag-note').fill('Tank decided on brew morning.')
  await row.getByTestId('flag-ok').click()
  await expect(row.getByTestId('flag-signed-by')).toHaveText(/^Signed off by Jake Brewer · .* · “Tank decided on brew morning\.”$/)
  await page.getByTestId('flags-close').click()
  const signed = Number((chipBefore!.match(/(\d+) signed off/) ?? [0, 0])[1]) + 1
  await expect(page.getByTestId('gantt-flags')).toContainText(`${signed} signed off`)
  await expect(page.getByTestId(`gantt-badge-${b.id}-0`)).toHaveText('✓')

  // P56: brew day 1 day later: the flag is open again, saying so.
  await dragBy(page, page.getByTestId(`gantt-step-${stepOf(b, 'Brew day').id}`), 1)
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('move-prompt')).toBeHidden()
  await expect(page.getByTestId(`gantt-badge-${b.id}-0`)).toHaveText('!')
  await page.getByTestId('gantt-flags').click()
  await expect(row.getByTestId('flag-was-signed')).toHaveText('Was signed off by Jake Brewer, but something changed since.')

  // P57: signed off again, then Remove sign-off: open again.
  await row.getByTestId('flag-ok').click()
  await expect(row.getByTestId('flag-signed-by')).toBeVisible()
  await row.getByTestId('flag-remove-signoff').click()
  await expect(row.getByTestId('flag-ok')).toBeVisible()
  expect((await schedule()).flags.find((f) => f.key === key)).toMatchObject({ signed_off: false, was_signed_off: false })
})

test('P58, P59: a CIP while beer is in the tank is flagged; dragging a standalone CIP moves it, no prompt; Undo', async ({ page }) => {
  const brand = await made.brand('Crusher')
  const tank = await made.tank('FV4')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), -5), tank_ids: [tank.id] })
  await made.checkOff(stepOf(b, 'Brew day'), `T${Date.now().toString(36).slice(-5)}`)
  await openGantt(page)
  await addProcess(page, 'cip')
  await page.getByTestId('cip-tank').click()
  await page.getByTestId(`cip-tank-${tank.id}`).click()
  await page.getByTestId('cip-day').fill(addDays(today(), 1))
  await page.getByTestId('cip-add-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('cip-add-dialog')).toBeHidden()
  const cip = (await schedule()).cips.find((c) => c.tank_id === tank.id)!
  made.cips.push(cip.id)
  const label = (await batchOf(b.id)).label
  const flag = (await schedule()).flags.find((f) => f.kind === 'cip_with_beer' && f.tank_id === tank.id)
  expect(flag?.message).toBe(`A CIP & Sanitize in ${tank.name} on ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${cip.due_on}T12:00:00Z`))} while ${label} is in it.`)

  await dragBy(page, page.getByTestId(`gantt-cip-${cip.id}`), 2)
  await expect(snack(page)).toHaveText('CIP & Sanitize moved 2 days later.')
  await expect(page.getByTestId('move-prompt')).toHaveCount(0)
  expect((await schedule()).cips.find((c) => c.id === cip.id)!.due_on).toBe(addDays(cip.due_on, 2))
  await undo(page)
  expect((await schedule()).cips.find((c) => c.id === cip.id)!.due_on).toBe(cip.due_on)
})

test('P61: brewer1 and brewer2 move steps in one batch at once: both succeed; both screens agree', async ({ page, browser }) => {
  const brand = await made.brand('Galactic')
  const tank = await made.tank('FV2')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 1), tank_ids: [tank.id] })
  const other = await browser.newContext({ storageState: authFile('brewer2'), viewport: { width: 1440, height: 1400 } })
  const page2 = await other.newPage()
  try {
    await openGantt(page)
    await openGantt(page2)
    // brewer1 moves PDH (nothing follows it: no prompt); brewer2 moves Carb with its prompt.
    await Promise.all([dragBy(page, page.getByTestId(`gantt-step-${stepOf(b, 'PDH').id}`), 1), dragBy(page2, page2.getByTestId(`gantt-step-${stepOf(b, 'Carb').id}`), 1)])
    await page2.getByTestId('move-apply').click()
    await expect(page2.getByTestId('move-prompt')).toBeHidden()
    await expect(snack(page)).toContainText('PDH moved 1 day later')
    const after = await batchOf(b.id)
    expect(stepOf(after, 'PDH').due_on).toBe(addDays(stepOf(b, 'PDH').due_on, 1))
    expect(stepOf(after, 'Carb').due_on).toBe(addDays(stepOf(b, 'Carb').due_on, 1))
    // Within a minute (a reload here): both show the same dates.
    await page.reload()
    await page2.reload()
    for (const p of [page, page2])
      for (const name of ['PDH', 'Carb'])
        await expect(p.getByTestId(`gantt-step-${stepOf(after, name).id}`)).toHaveAttribute('aria-label', new RegExp(`^${name} · `))
    const label = async (p: typeof page, name: string) => p.getByTestId(`gantt-step-${stepOf(after, name).id}`).getAttribute('aria-label')
    expect(await label(page, 'Carb')).toBe(await label(page2, 'Carb'))
    expect(await label(page, 'PDH')).toBe(await label(page2, 'PDH'))
  } finally {
    await other.close()
  }
})
