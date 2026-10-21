import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addOutage } from './helpers'
import { addDays, batchOf, dayPx, Made, openGantt, schedule, snack, stepOf, today, type SBatch } from './schedule'

// D47 DEV QA fix cycle 1 (lead decisions 4): M1 typing a date, M2 a batch
// number with a leading #, M3 a full Package checked off early, and the
// minors that live in the UI (3, 9); `qa-fixes.spec.ts` is D46's fix cycle 2. Minors 4, 5 and the P32 refetch are in
// batches.spec.ts; 2 and 6 in gantt.spec.ts; 8 in followups-4650.spec.ts.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const made = new Made()
test.afterAll(() => made.cleanup())

const ALE = '[SEED] Standard ale'
const tag = () => `T${Date.now().toString(36).slice(-5)}`
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

async function ale(label: string, brewOffset: number, brewed = false): Promise<SBatch> {
  const brand = await made.brand(label)
  const tank = await made.tank('FV')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewOffset), tank_ids: [tank.id] })
  if (brewed) await made.checkOff(stepOf(b, 'Brew day'), tag())
  return batchOf(b.id)
}

test('M1: typing 12152026 into a step date opens one prompt, for Dec 15, once committed', async ({ page }) => {
  const b = await ale('Galactic', 1)
  const fdh = stepOf(b, 'FDH')
  const year = Number(fdh.due_on.slice(0, 4)) + (fdh.due_on.slice(5) < '12-15' ? 0 : 1)
  const target = `${year}-12-15`
  const moves: Record<string, unknown>[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/production/steps/move')) moves.push(r.postDataJSON())
  })
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  const input = page.getByTestId(`batch-step-date-${fdh.id}`)
  const box = (await input.boundingBox())!
  // The month part, then the keyboard: every keystroke makes a date ("1" is January).
  await page.mouse.click(box.x + 14, box.y + box.height / 2)
  await page.keyboard.type(`12${'15'}${year}`, { delay: 30 })
  await page.waitForTimeout(300)
  await expect(page.getByTestId('move-prompt')).toHaveCount(0)
  expect(moves).toEqual([])

  await page.keyboard.press('Enter')
  const n = days(fdh.due_on, target)
  await expect(page.getByTestId('move-prompt')).toContainText(`FDH moved ${n} days later`)
  expect(moves).toEqual([{ ids: [fdh.id], days: n, preview: true }])

  // Cancelled: the field shows the step's date again; nothing moved.
  await page.getByTestId('move-cancel').click()
  await expect(input).toHaveValue(fdh.due_on)
  expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(fdh.due_on)

  // Typed again and left by clicking elsewhere: one prompt, applied.
  await page.mouse.click(box.x + 14, box.y + box.height / 2)
  await page.keyboard.type(`12${'15'}${year}`, { delay: 30 })
  // Tab stays in the field (its picker button is next); clicking elsewhere leaves it.
  await page.getByTestId('batch-dialog-title').click()
  await expect(page.getByTestId('move-prompt')).toContainText(`FDH moved ${n} days later`)
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('move-prompt')).toBeHidden()
  await expect(input).toHaveValue(target)
  expect(moves).toHaveLength(3)
})

test('M2: "#40" is 40: refused as a duplicate at brew day and in the batch dialog; the field shows the saved number', async ({ page }) => {
  const brand = await made.brand('Altruism')
  const a = await made.plan({ brand_id: brand.id, template: ALE, brew_on: today() })
  const taken = (await schedule()).batches.find((x) => x.batch_number && /^\d+$/.test(x.batch_number))!
  await openGantt(page)
  await page.getByTestId(`gantt-step-${stepOf(a, 'Brew day').id}`).click()
  await page.getByTestId('step-check-off').click()
  await page.getByTestId('number-input').fill(`#${taken.batch_number}`)
  // A leading # is just how labels show it: a plain number.
  await expect(page.getByTestId('number-helper')).not.toContainText('Not a plain number')
  await page.getByTestId('number-save').click()
  await expect(page.getByTestId('number-helper')).toHaveText(`#${taken.batch_number} is already ${taken.label}.`)
  const n = tag()
  await page.getByTestId('number-input').fill(` #${n} `)
  await page.getByTestId('number-save').click()
  await expect(page.getByTestId('number-prompt')).toBeHidden()
  await expect(snack(page)).toContainText(`is #${n}.`)
  expect((await batchOf(a.id)).batch_number).toBe(n)

  // The batch dialog: "#taken" refused; " #new " saved as "new", and the field shows it.
  await page.getByTestId(`gantt-bar-${a.id}-0`).click()
  await page.getByTestId('batch-number').fill(`#${taken.batch_number}`)
  await page.getByTestId('batch-number-save').click()
  await expect(page.getByTestId('batch-dialog-error')).toHaveText(`#${taken.batch_number} is already ${taken.label}.`)
  await page.getByTestId('batch-number').fill(`  #${n}x  `)
  await page.getByTestId('batch-number-save').click()
  await expect(page.getByTestId('batch-dialog-title')).toHaveText(`${brand.name} #${n}x`)
  await expect(page.getByTestId('batch-number')).toHaveValue(`${n}x`)
  expect((await batchOf(a.id)).batch_number).toBe(`${n}x`)
})

test('M3: a full Package done 5 days early: the bar ends there; Carb left after it is red and flagged out of order', async ({ page }) => {
  const b = await ale('Crusher', -20, true)
  const pkg = stepOf(b, 'Package')
  const carb = stepOf(b, 'Carb')
  expect(pkg.due_on).toBe(addDays(today(), 5))
  await openGantt(page)
  await page.getByTestId(`gantt-step-${pkg.id}`).click()
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('move-prompt')).toContainText('Package done 5 days early')
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()

  const after = await batchOf(b.id)
  expect(after.status).toBe('completed')
  const flags = (await schedule()).flags.filter((f) => f.kind === 'out_of_order' && f.batch_ids.includes(b.id))
  expect(flags.map((f) => f.message)).toContain(`${after.label}: Package is before Carb, the step it follows.`)
  await expect(page.getByTestId(`gantt-step-${carb.id}`)).toHaveAttribute('data-state', 'stranded')
  await expect(page.getByTestId(`gantt-step-${carb.id}`)).toHaveAttribute('aria-label', /after the tank was emptied/)
  await expect(page.getByTestId(`gantt-badge-${b.id}-0`)).toHaveText(/^!/)
  // The bar stops at today (the Package, its CIP moved with it); Carb's dot is past its end.
  const bar = (await page.getByTestId(`gantt-bar-${b.id}-0`).boundingBox())!
  const dot = (await page.getByTestId(`gantt-step-${carb.id}`).boundingBox())!
  expect(dot.x).toBeGreaterThan(bar.x + bar.width)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId(`batch-step-stranded-${carb.id}`)).toHaveText('after the tank was emptied')
})

test('minor 3: an empty spot → Mark out of service starts and ends on the tapped day', async ({ page }) => {
  const tank = await made.tank('FV3')
  await openGantt(page)
  await page.getByTestId(`gantt-tank-name-${tank.id}`).scrollIntoViewIfNeeded()
  const lane = (await page.getByTestId(`gantt-lane-${tank.id}`).boundingBox())!
  const line = (await page.getByTestId('gantt-today-line').boundingBox())!
  const px = await dayPx(page)
  const day = addDays(today(), 3)
  await page.mouse.click(line.x + 1 + 3 * px, lane.y + lane.height - 4)
  await page.getByTestId('spot-outage').click()
  await expect(page.getByTestId('outage-from')).toHaveValue(day)
  await expect(page.getByTestId('outage-to')).toHaveValue(day)
  await page.getByTestId('outage-cancel').click()
})

test('minor 9: a check-off that moves the following steps says so', async ({ page }) => {
  const b = await ale('Galactic', -15, true)
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await page.getByTestId(`gantt-step-${fdh.id}`).click()
  await page.getByTestId('step-check-off').click()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toContainText('FDH done · 8 following steps moved 2 days later.')
})

test('drag hint: a sideways drag shows the day; a row change names the tank, red when it’s out; outside the chart says so', async ({ page }) => {
  const brand = await made.brand('Fest')
  const [fv, out] = [await made.tank('FV'), await made.tank('Brite')]
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 3), tank_ids: [fv.id] })
  const [from, to] = [addDays(today(), 1), addDays(today(), 40)]
  await addOutage(out.id, from, to, 'Gasket')
  const label = (key: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${key}T12:00:00Z`)).replace(',', '')
  const period = (a: string, z: string) => {
    const md = (k: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${k}T12:00:00Z`))
    return a.slice(5, 7) === z.slice(5, 7) ? `${md(a)}–${Number(z.slice(8))}` : `${md(a)}–${md(z)}`
  }
  await openGantt(page)
  const bar = page.getByTestId(`gantt-bar-${b.id}-0`)
  await bar.scrollIntoViewIfNeeded()
  const box = (await bar.boundingBox())!
  const lane = (await page.getByTestId(`gantt-lane-${out.id}`).boundingBox())!
  const px = await dayPx(page)
  const hint = page.getByTestId('gantt-drag-hint')
  const [x, y] = [box.x + 20, box.y + box.height / 2]

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 6, y, { steps: 3 })
  await page.mouse.move(x + 2 * px, y, { steps: 8 })
  await expect(hint).toHaveText(`${label(addDays(today(), 5))} · +2 days`)
  await expect(hint).not.toHaveAttribute('data-warn', 'true')

  await page.mouse.move(x, lane.y + lane.height / 2, { steps: 8 })
  await expect(hint).toHaveText(`→ ${out.name} · ${out.name} is out of service ${period(from, to)}`)
  await expect(hint).toHaveAttribute('data-warn', 'true')

  const chart = (await page.getByTestId('gantt').boundingBox())!
  await page.mouse.move(chart.x + 10, y, { steps: 8 })
  await expect(hint).toHaveText('Release over the chart to move')
  await page.mouse.up()
  await expect(hint).toHaveCount(0)
  expect((await batchOf(b.id)).vessels).toEqual([{ vessel_index: 0, tank_id: fv.id }])
})
