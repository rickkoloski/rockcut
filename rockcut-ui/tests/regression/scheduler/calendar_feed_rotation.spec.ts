import { test, expect as baseExpect, type APIRequestContext } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { anonApi, createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'

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
    await expect(notice).toContainText(`The link for ${before.label}`)
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
