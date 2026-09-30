import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, denverUtc, tempTag, weekMonday } from '../scheduler/helpers'

// D33 S6–S9 as the taproomDevice persona (a paired tablet, home: Taproom).
// Never signs the shared persona token out: other specs use it in parallel.

test.use({ storageState: authFile('taproomDevice') })

let tag = ''
let week = ''
test.afterEach(async () => {
  if (tag && week) await cleanupTemp(await apiAs('owner'), tag, week, addDays(week, 6))
  tag = ''
  week = ''
})

test('S6: the tablet’s nav and app bar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('device-chip')).toContainText('Shared device · Taproom')
  await expect(page.getByTestId('personal-signin')).toBeVisible()

  const nav = page.locator('.MuiDrawer-paper').filter({ visible: true })
  await expect(nav.getByRole('button', { name: 'Home' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'View Schedule' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Taproom' })).toBeVisible()
  await nav.getByRole('button', { name: 'Messages' }).click()
  await expect(nav.getByRole('button', { name: 'All-staff' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Taproom' }).nth(1)).toBeVisible()

  for (const name of ['Scheduler', 'Time off', 'Availability', 'Admin', 'Brewery', 'Managers', 'Office', 'Sales']) {
    await expect(nav.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
  await expect(page.getByRole('button', { name: 'Notifications' })).toHaveCount(0)
  await expect(page.getByTestId('logout-button')).toHaveCount(0)
})

test('S7: published shifts only, and no claiming', async ({ page }) => {
  tag = tempTag('S7 shift')
  week = weekMonday(11)
  const mgr = await apiAs('barMgr')
  const depts = (await (await mgr.get('/api/departments')).json()).data as { id: number; key: string }[]
  const bar = depts.find((d) => d.key === 'bar')!.id
  const positions = (await (await mgr.get('/api/positions')).json()).data as { id: number; department_id: number }[]
  const pos = positions.find((p) => p.department_id === bar)!.id
  const day = addDays(week, 2)

  const mk = async (hh: string) => {
    const res = await mgr.post('/api/shifts', {
      data: { position_id: pos, starts_at: denverUtc(day, hh), ends_at: denverUtc(day, `${Number(hh.slice(0, 2)) + 4}:00`), notes: tag },
    })
    expect(res.status(), await res.text()).toBe(201)
    return (await res.json()).data as { id: number }
  }
  const published = await mk('10:00')
  const draft = await mk('15:00')
  expect((await mgr.post(`/api/shifts/${published.id}/publish`)).status()).toBe(200)

  await page.goto('/schedule')
  await page.getByLabel('From').fill(week)
  await page.getByLabel('To').fill(addDays(week, 6))
  await expect(page.getByTestId(`agenda-shift-${published.id}`)).toBeVisible()
  await expect(page.getByTestId(`agenda-shift-${draft.id}`)).toHaveCount(0)
  // Open and published, in its home department: a person there could claim it; the tablet can't.
  await expect(page.getByTestId(`agenda-shift-${published.id}`).getByRole('button', { name: 'Claim' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Claim' })).toHaveCount(0)
  await expect(page.getByText('My shifts')).toHaveCount(0)

  const device = await apiAs('taproomDevice')
  const ids = ((await (await device.get('/api/shifts', { params: { from: week, to: addDays(week, 6) } })).json()).data as { id: number }[]).map(
    (s) => s.id,
  )
  expect(ids).toContain(published.id)
  expect(ids).not.toContain(draft.id)
  expect((await device.post(`/api/shifts/${published.id}/claim`)).status()).toBe(403)
})

test('S8: reads All-staff and Taproom; can’t post; no Managers', async ({ page }) => {
  for (const [key, name] of [
    ['all', 'All-staff'],
    ['dept:bar', 'Taproom'],
  ]) {
    await page.goto(`/messages/${key}`)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByTestId('read-only-notice')).toHaveText('Shared devices can read but not post.')
    await expect(page.getByRole('textbox')).toHaveCount(0)
  }

  const device = await apiAs('taproomDevice')
  expect((await device.post('/api/channels/all/messages', { data: { body: '[TEST-TEMP] anon' } })).status()).toBe(403)
  expect((await device.get('/api/channels/managers/messages')).status()).toBe(403)
  const keys = ((await (await device.get('/api/channels')).json()).data as { key: string }[]).map((c) => c.key)
  expect(keys).toEqual(['all', 'dept:bar'])
})

test('S9: typed URLs show "Not available on a shared device"; the API says 403', async ({ page }) => {
  for (const path of ['/scheduler', '/time_off', '/availability', '/users', '/brands', '/devices', '/activity']) {
    await page.goto(path)
    await expect(page.getByTestId('device-not-available'), path).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  }

  const device = await apiAs('taproomDevice')
  for (const path of ['/api/time_off', '/api/availability', '/api/users', '/api/brands', '/api/shift_templates']) {
    expect((await device.get(path)).status(), path).toBe(403)
  }
})
