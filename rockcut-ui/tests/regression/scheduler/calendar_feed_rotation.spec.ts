import { test, expect as baseExpect, type APIRequestContext } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { anonApi, createTempPerson, retireTempPerson, throwawayPassword, type TempPerson } from '../auth/helpers'

// D35: when someone who could see a shared calendar feed leaves, its link is
// reset and everyone still using it is told to re-subscribe (S2, S10, Q3).
// The person who leaves is a throwaway [TEST-TEMP] Taproom manager.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000, mode: 'default' })

interface Feed {
  subject_type: string
  subject_id: number | null
  label: string
  token: string
}

async function feeds(api: APIRequestContext): Promise<Feed[]> {
  return (await (await api.get('/api/calendar_feeds')).json()).data as Feed[]
}

async function deptId(api: APIRequestContext, key: string): Promise<number> {
  const departments = (await (await api.get('/api/departments')).json()).data as { id: number; key: string }[]
  return departments.find((d) => d.key === key)!.id
}

/** Ids of the persona's calendar_feed_rotated notifications. */
async function rotatedNoticeIds(api: APIRequestContext): Promise<number[]> {
  const items = (await (await api.get('/api/notifications')).json()).data as { id: number; event: string }[]
  return items.filter((n) => n.event === 'calendar_feed_rotated').map((n) => n.id)
}

async function taproomFeed(api: APIRequestContext): Promise<Feed> {
  const departments = (await (await api.get('/api/departments')).json()).data as { id: number; key: string }[]
  const bar = departments.find((d) => d.key === 'bar')!
  const feeds = (await (await api.get('/api/calendar_feeds')).json()).data as Feed[]
  return feeds.find((f) => f.subject_type === 'department' && f.subject_id === bar.id)!
}

test.describe('a Taproom manager leaves', () => {
  test.use({ storageState: authFile('barMgr') })

  let leaver: TempPerson | null = null
  test.afterAll(async () => {
    await retireTempPerson(leaver)
  })

  test('S2/S10: the Taproom link is reset and barMgr is told to re-subscribe', async ({ page }) => {
    const barMgr = await apiAs('barMgr')
    const before = await taproomFeed(barMgr)

    leaver = await createTempPerson('D35 leaver', { ready: false, memberships: [{ department: 'bar', role: 'manager' }] })
    const owner = await apiAs('owner')
    const res = await owner.patch(`/api/users/${leaver.id}`, { data: { active: false } })
    expect(res.status(), await res.text()).toBe(200)

    // The old link is dead, and barMgr's Calendar sync has a new one.
    const anon = await anonApi()
    expect((await anon.get(`/api/calendar/${before.token}`)).status()).toBe(404)
    const after = await taproomFeed(barMgr)
    expect(after.token).not.toBe(before.token)
    expect((await anon.get(`/api/calendar/${after.token}`)).status()).toBe(200)
    await anon.dispose()

    // The bell has the notice; opening it lands in Calendar sync.
    await page.goto('/')
    await page.getByRole('button', { name: 'Notifications' }).click()
    const notice = page.getByTestId('notification-calendar_feed_rotated').first()
    await expect(notice).toContainText('Re-subscribe to your Rockcut calendar')
    await expect(notice).toContainText(`The ${before.label} calendar link changed`)
    await notice.click()
    await expect(page).toHaveURL(/\/schedule$/)
    const dialog = page.getByRole('dialog', { name: 'Calendar sync' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator(`input[value$="${after.token}.ics"], input[value*="${after.token}"]`)).toHaveCount(1)
  })

  test('Q3: "Calendar link changed" is in-app and push, not email, by default', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: 'Preferences' }).click()
    const row = page.getByRole('row', { name: /Calendar link changed/ })
    const [inApp, email, push] = [0, 1, 2].map((i) => row.locator('input[type="checkbox"]').nth(i))
    await expect(inApp).toBeChecked()
    await expect(email).not.toBeChecked()
    await expect(push).toBeChecked()
  })
})

test.describe('Calendar sync links (DEV pass G1)', () => {
  test.use({ storageState: authFile('barMgr') })

  // The shown link must serve the calendar itself. On DEV and prod the UI and
  // API are separate hosts, and the UI host only serves the app's HTML.
  test('the link shown in Calendar sync serves an ICS calendar', async ({ page, request }) => {
    await page.goto('/schedule?calendar_sync=1')
    const dialog = page.getByRole('dialog', { name: 'Calendar sync' })
    const link = await dialog.locator('input').first().inputValue()
    const res = await request.get(link)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/calendar')
    expect((await res.text()).startsWith('BEGIN:VCALENDAR')).toBe(true)
  })
})

test.describe('one Users & Roles save that changes the owner flag and departments (DEV pass G2/G3)', () => {
  test.use({ storageState: authFile('owner') })

  let personId: number | null = null
  test.afterAll(async () => {
    if (personId) await (await apiAs('owner')).patch(`/api/users/${personId}`, { data: { active: false } })
  })

  test('resets each lost link once, and not the one the person keeps', async ({ page }) => {
    const owner = await apiAs('owner')
    const owner2 = await apiAs('owner2')
    const dualMgr = await apiAs('dualMgr')
    const bar = await deptId(owner, 'bar')
    const office = await deptId(owner, 'office')

    // A throwaway owner who also manages Office. The email sorts first in the grid.
    const suffix = Math.random().toString(36).slice(2, 8)
    const created = await owner.post('/api/users', {
      data: {
        email: `a-d35-${suffix}@rockcut-test.com`,
        name: `[TEST-TEMP] D35 combined ${suffix}`,
        password: throwawayPassword(),
        memberships: [{ department: 'office', role: 'manager' }],
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const person = (await created.json()).data as { id: number; email: string }
    personId = person.id
    expect((await owner.patch(`/api/users/${person.id}`, { data: { is_owner: true } })).status()).toBe(200)

    const tokenOf = (fs: Feed[], type: string, id: number | null) =>
      fs.find((f) => f.subject_type === type && f.subject_id === id)!.token
    const before = await feeds(owner)
    const owner2Before = await rotatedNoticeIds(owner2)
    const dualBefore = await rotatedNoticeIds(dualMgr)

    // One save: owner off, Office → none, Taproom → manager.
    await page.goto('/users')
    await page.getByRole('gridcell', { name: person.email }).click()
    await page.getByLabel('Owner (full access to all departments)').uncheck()
    await page.getByRole('combobox', { name: 'Office' }).click()
    await page.getByRole('option', { name: '— None —' }).click()
    await page.getByRole('combobox', { name: 'Taproom' }).click()
    await page.getByRole('option', { name: 'Manager' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const after = await feeds(owner)
    // Taproom is kept through the new role: not reset (G3).
    expect(tokenOf(after, 'department', bar)).toBe(tokenOf(before, 'department', bar))
    expect(tokenOf(after, 'department', office)).not.toBe(tokenOf(before, 'department', office))
    expect(tokenOf(after, 'all', null)).not.toBe(tokenOf(before, 'all', null))
    // One notification each, not one per call (G2).
    await expect.poll(async () => (await rotatedNoticeIds(owner2)).filter((id) => !owner2Before.includes(id)).length).toBe(1)
    expect((await rotatedNoticeIds(dualMgr)).filter((id) => !dualBefore.includes(id)).length).toBe(1)
  })
})
