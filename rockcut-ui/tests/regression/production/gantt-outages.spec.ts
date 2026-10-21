import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addOutage } from './helpers'
import { addDays, Made, openGantt, schedule, snack, today, undo } from './schedule'

// D47 §3.6 out of service on the Gantt (D46 tested the Tanks page): P6–P10.
// The tank ⋯ panel, a tap on an empty spot, the band.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const made = new Made()
test.afterAll(() => made.cleanup())

const ALE = '[SEED] Standard ale'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const md = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8))}`

async function fillPeriod(page: Page, from: string, to: string | null, reason: string) {
  await page.getByTestId('outage-from').fill(from)
  if (to) await page.getByTestId('outage-to').fill(to)
  else await page.getByTestId('outage-open').check()
  await page.getByTestId('outage-reason').fill(reason)
}

const band = (page: Page, tankId: number) => page.getByTestId(`gantt-row-${tankId}`).locator('[data-testid^="gantt-band-"]')

test('P6, P9, P10: ⋯ → Mark out of service names the planned batch; band, tag, flag; an overlap is refused; Delete and Undo', async ({ page }) => {
  const brand = await made.brand('Galactic')
  const tank = await made.tank('Serving 2', 30)
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 5), tank_ids: [tank.id] })
  const [from, to] = [addDays(today(), 6), addDays(today(), 12)]
  await openGantt(page)
  await page.getByTestId(`gantt-tank-menu-${tank.id}`).click()
  await page.getByTestId('tank-panel-mark-out').click()
  await fillPeriod(page, from, to, 'Replace door gasket')
  await expect(page.getByTestId('outage-planned')).toContainText(b.label)
  await page.getByTestId('outage-save').click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()
  await page.getByTestId('tank-panel').getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(band(page, tank.id)).toHaveCount(1)
  await expect(band(page, tank.id)).toContainText('Out · Replace door gasket')
  await expect(page.getByTestId(`gantt-out-tag-${tank.id}`)).toHaveText(`Out ${md(from)}–${md(from).slice(0, 3) === md(to).slice(0, 3) ? Number(to.slice(8)) : md(to)}`)
  await expect(page.getByTestId(`gantt-badge-${b.id}-0`)).toHaveText('!')
  expect((await schedule()).flags.some((f) => f.kind === 'out_of_service' && f.batch_ids.includes(b.id))).toBe(true)

  // P9: an overlapping period is refused, naming the other; nothing saved.
  await page.getByTestId(`gantt-tank-menu-${tank.id}`).click()
  await page.getByTestId('tank-panel-mark-out').click()
  await fillPeriod(page, addDays(from, 2), addDays(to, 2), 'Again')
  await page.getByTestId('outage-save').click()
  await expect(page.getByTestId('outage-error')).toHaveText(/^That overlaps another period \(.+\)\. Change that one instead\.$/)
  await page.getByTestId('outage-cancel').click()
  await page.getByTestId('tank-panel').getByRole('button', { name: 'Close' }).click()
  await expect(band(page, tank.id)).toHaveCount(1)

  // P10: the band → Delete: the flag clears; Undo brings both back.
  await band(page, tank.id).click()
  await page.getByTestId('outage-delete').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()
  await expect(snack(page)).toHaveText('Out-of-service period deleted.')
  await expect(band(page, tank.id)).toHaveCount(0)
  await expect(page.getByTestId(`gantt-badge-${b.id}-0`)).toHaveCount(0)
  await undo(page)
  await expect(band(page, tank.id)).toHaveCount(1)
  await expect(page.getByTestId(`gantt-badge-${b.id}-0`)).toHaveText('!')
})

test('P7: an empty spot → Mark out of service until further notice from today', async ({ page }) => {
  const tank = await made.tank('FV3')
  await openGantt(page)
  await page.getByTestId(`gantt-tank-name-${tank.id}`).scrollIntoViewIfNeeded()
  const lane = (await page.getByTestId(`gantt-lane-${tank.id}`).boundingBox())!
  const line = (await page.getByTestId('gantt-today-line').boundingBox())!
  await page.mouse.click(line.x + 1, lane.y + lane.height - 4)
  await expect(page.getByTestId('gantt-spot-menu')).toContainText(tank.name)
  await page.getByTestId('spot-outage').click()
  await expect(page.getByTestId('outage-from')).toHaveValue(today())
  await page.getByTestId('outage-open').check()
  await page.getByTestId('outage-reason').fill('Valve repair')
  await page.getByTestId('outage-save').click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()
  await page.reload()
  await expect(page.getByTestId(`gantt-status-${tank.id}`)).toHaveText('Out of service · Valve repair')
  await expect(page.getByTestId(`gantt-out-tag-${tank.id}`)).toHaveText(`Out from ${md(today())}`)
  await expect(band(page, tank.id)).toContainText('Out · Valve repair')
})

test('P8: the band → Back in service today: the status returns; the period is under Past', async ({ page }) => {
  const tank = await made.tank('FV3')
  await addOutage(tank.id, addDays(today(), -3), null, 'Valve repair')
  await openGantt(page)
  await expect(page.getByTestId(`gantt-status-${tank.id}`)).toHaveText('Out of service · Valve repair')
  await band(page, tank.id).click()
  await page.getByTestId('outage-end-today').click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()
  await expect(snack(page)).toHaveText(`${tank.name} is back in service today.`)
  await expect(page.getByTestId(`gantt-status-${tank.id}`)).toHaveText('Empty · clean')
  await page.getByTestId(`gantt-tank-menu-${tank.id}`).click()
  await expect(page.getByTestId('tank-panel-past')).toContainText('Valve repair')
})
