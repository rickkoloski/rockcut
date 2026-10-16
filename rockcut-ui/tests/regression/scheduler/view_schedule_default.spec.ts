import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, denverToday, denverUtc, openScheduler, tempTag } from './helpers'

// D45 §3.2, S179–S183: View Schedule opens on today through today + 6
// (Colorado), not remembered; clearing both dates shows everything; the
// Scheduler is unchanged.

let tag = ''
let today = ''
const ids: Record<'past' | 'first' | 'last' | 'after', number> = { past: 0, first: 0, last: 0, after: 0 }

test.beforeAll(async () => {
  tag = tempTag('D45 range')
  today = denverToday()
  const mgr = await apiAs('breweryMgr')
  const depts = (await (await mgr.get('/api/departments')).json()).data as { id: number; key: string }[]
  const brewery = depts.find((d) => d.key === 'brewery')!.id
  const positions = (await (await mgr.get('/api/positions')).json()).data as { id: number; department_id: number }[]
  const pos = positions.find((p) => p.department_id === brewery)!.id

  // One published shift each: before today, today, today + 6, today + 7.
  const days = { past: -3, first: 0, last: 6, after: 7 } as const
  for (const [k, n] of Object.entries(days) as [keyof typeof ids, number][]) {
    const day = addDays(today, n)
    const res = await mgr.post('/api/shifts', {
      data: { position_id: pos, starts_at: denverUtc(day, '06:00'), ends_at: denverUtc(day, '10:00'), notes: tag },
    })
    expect(res.status(), await res.text()).toBe(201)
    ids[k] = ((await res.json()).data as { id: number }).id
    expect((await mgr.post(`/api/shifts/${ids[k]}/publish`)).status()).toBe(200)
  }
})

test.afterAll(async () => {
  if (tag) await cleanupTemp(await apiAs('owner'), tag, addDays(today, -3), addDays(today, 7))
})

const shift = (page: Page, k: keyof typeof ids) => page.getByTestId(`agenda-shift-${ids[k]}`)

async function expectDefaultRange(page: Page) {
  await expect(page.getByLabel('From')).toHaveValue(today)
  await expect(page.getByLabel('To')).toHaveValue(addDays(today, 6))
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S179: opens on today through today + 6; only those days listed', async ({ page }) => {
    await page.goto('/schedule')
    await expectDefaultRange(page)
    await expect(shift(page, 'first')).toBeVisible()
    await expect(shift(page, 'last')).toBeVisible()
    await expect(shift(page, 'past')).toHaveCount(0)
    await expect(shift(page, 'after')).toHaveCount(0)
  })

  test('S180: a changed range is not remembered', async ({ page }) => {
    await page.goto('/schedule')
    await page.getByLabel('To').fill(addDays(today, 30))
    await expect(shift(page, 'after')).toBeVisible()
    await page.goto('/')
    await page.goto('/schedule')
    await expectDefaultRange(page)
    await expect(shift(page, 'after')).toHaveCount(0)
  })

  test('S181: clearing From and To shows everything', async ({ page }) => {
    await page.goto('/schedule')
    await expect(shift(page, 'first')).toBeVisible()
    await page.getByLabel('From').fill('')
    await page.getByLabel('To').fill('')
    for (const k of ['past', 'first', 'last', 'after'] as const) await expect(shift(page, k)).toBeVisible()
  })
})

test.describe('S182: taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('same 7-day default', async ({ page }) => {
    await page.goto('/schedule')
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await expectDefaultRange(page)
    await expect(shift(page, 'last')).toBeVisible()
    await expect(shift(page, 'after')).toHaveCount(0)
  })
})

test.describe('S183: owner', () => {
  test.use({ storageState: authFile('owner') })

  test('Scheduler unchanged: the week grid, no From / To', async ({ page }) => {
    await openScheduler(page)
    await expect(page.getByLabel('From')).toHaveCount(0)
    await expect(page.getByLabel('To')).toHaveCount(0)
  })
})
