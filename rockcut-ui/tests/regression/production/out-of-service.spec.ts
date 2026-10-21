import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, addOutage, createTank, denverToday, retireTanks, tanks, shortTag } from './helpers'

// D46 §3.2 out-of-service periods on the Tanks page (lead decision 1: the
// Gantt parts of P6–P10 come with D47). Each test uses its own [TEST-TEMP]
// tank, so seed periods (rebuilt on reseed) are never touched.

test.use({ storageState: authFile('brewer1') })

const made: number[] = []
test.afterAll(async () => {
  await retireTanks(made.splice(0))
})

const monthDay = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

async function openTank(page: Page, id: number) {
  await page.goto('/brewery/production/tanks')
  await page.getByTestId(`tank-edit-${id}`).click()
  await expect(page.getByTestId('tank-dialog')).toBeVisible()
}

test('P7: Mark out of service until further notice from today', async ({ page }) => {
  const tank = await createTank(shortTag('FV3'))
  made.push(tank.id)
  await openTank(page, tank.id)
  await page.getByTestId('tank-mark-out').click()
  await expect(page.getByTestId('outage-dialog')).toContainText(`Mark ${tank.name} out of service`)
  await expect(page.getByTestId('outage-from')).toHaveValue(denverToday())
  await page.getByTestId('outage-open').check()
  await expect(page.getByTestId('outage-to')).toBeDisabled()
  await page.getByTestId('outage-reason').fill('Valve repair')
  await page.getByTestId('outage-save').click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()

  await expect(page.getByTestId('tank-outages-now')).toContainText('until further notice')
  await expect(page.getByTestId('tank-outages-now')).toContainText('Valve repair')
  await page.getByTestId('tank-dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId(`tank-out-chip-${tank.id}`)).toHaveText(`Out from ${monthDay(denverToday())}`)

  await page.reload()
  await expect(page.getByTestId(`tank-out-chip-${tank.id}`)).toHaveText(`Out from ${monthDay(denverToday())}`)
  const [o] = (await tanks()).find((t) => t.id === tank.id)!.outages
  expect(o).toMatchObject({ starts_on: denverToday(), ends_on: null, reason: 'Valve repair', state: 'now' })
})

test('P8: Back in service today: yesterday becomes the last day out, under Past', async ({ page }) => {
  const tank = await createTank(shortTag('FV3 back'))
  made.push(tank.id)
  const today = denverToday()
  const o = await addOutage(tank.id, addDays(today, -3), null, 'Valve repair')
  await openTank(page, tank.id)
  await page.getByTestId(`tank-outage-change-${o.id}`).click()
  await page.getByTestId('outage-end-today').click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()
  await expect(page.getByTestId('tank-outages-past')).toContainText('Valve repair')
  await expect(page.getByTestId('tank-outages-now')).toHaveCount(0)
  await page.getByTestId('tank-dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId(`tank-out-chip-${tank.id}`)).toHaveCount(0)

  const [saved] = (await tanks()).find((t) => t.id === tank.id)!.outages
  expect(saved).toMatchObject({ starts_on: addDays(today, -3), ends_on: addDays(today, -1), state: 'past' })
})

test('P8: Back in service today on a period that started today deletes it; only current periods offer it', async ({ page }) => {
  const tank = await createTank(shortTag('FV3 today'))
  made.push(tank.id)
  const today = denverToday()
  const now = await addOutage(tank.id, today, addDays(today, 3))
  const later = await addOutage(tank.id, addDays(today, 10), addDays(today, 12))
  await openTank(page, tank.id)
  await page.getByTestId(`tank-outage-change-${later.id}`).click()
  await expect(page.getByTestId('outage-end-today')).toHaveCount(0)
  await page.getByTestId('outage-cancel').click()

  await page.getByTestId(`tank-outage-change-${now.id}`).click()
  await page.getByTestId('outage-end-today').click()
  await expect(page.getByTestId(`tank-outage-${now.id}`)).toHaveCount(0)
  expect((await tanks()).find((t) => t.id === tank.id)!.outages.map((o) => o.id)).toEqual([later.id])
})

test('P9: an overlapping period is refused, naming the other one; nothing is saved', async ({ page }) => {
  const tank = await createTank(shortTag('Serving 2'))
  made.push(tank.id)
  const today = denverToday()
  await addOutage(tank.id, addDays(today, 7), addDays(today, 13), 'Replace door gasket')
  const label = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')

  await openTank(page, tank.id)
  await page.getByTestId('tank-mark-out').click()
  await page.getByTestId('outage-from').fill(addDays(today, 10))
  await page.getByTestId('outage-reason').fill('Overlap')
  await page.getByTestId('outage-save').click()
  await expect(page.getByTestId('outage-error')).toHaveText(
    `That overlaps another period (${label(addDays(today, 7))} – ${label(addDays(today, 13))}). Change that one instead.`,
  )
  await expect(page.getByTestId('outage-dialog')).toBeVisible()
  expect((await tanks()).find((t) => t.id === tank.id)!.outages).toHaveLength(1)
})

test('Change a period; the first day carries the last along; checks before saving', async ({ page }) => {
  const tank = await createTank(shortTag('FV5'))
  made.push(tank.id)
  const today = denverToday()
  const o = await addOutage(tank.id, addDays(today, 5), addDays(today, 7))
  await openTank(page, tank.id)
  await page.getByTestId(`tank-outage-change-${o.id}`).click()
  await page.getByTestId('outage-from').fill(addDays(today, 20))
  await expect(page.getByTestId('outage-to')).toHaveValue(addDays(today, 22))
  await page.getByTestId('outage-to').fill(addDays(today, 19))
  await page.getByTestId('outage-save').click()
  await expect(page.getByTestId('outage-error')).toHaveText('The last day out can’t be before the first.')
  await page.getByTestId('outage-to').fill(addDays(today, 21))
  await page.getByTestId('outage-save').click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()
  const [saved] = (await tanks()).find((t) => t.id === tank.id)!.outages
  expect(saved).toMatchObject({ starts_on: addDays(today, 20), ends_on: addDays(today, 21) })
})

test('P10 (Tanks page): Delete a period', async ({ page }) => {
  const tank = await createTank(shortTag('FV6'))
  made.push(tank.id)
  const o = await addOutage(tank.id, addDays(denverToday(), 4), addDays(denverToday(), 6))
  await openTank(page, tank.id)
  await page.getByTestId(`tank-outage-change-${o.id}`).click()
  await page.getByTestId('outage-delete').click()
  // QA minor 2: it asks first.
  await page.getByRole('dialog').filter({ hasText: 'Delete the out-of-service period' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('outage-dialog')).toBeHidden()
  await expect(page.getByTestId('tank-outages')).toContainText('No out-of-service periods.')
  expect((await tanks()).find((t) => t.id === tank.id)!.outages).toEqual([])
})
