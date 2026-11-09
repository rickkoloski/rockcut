import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { activeProfile } from '../../config/targets'
import { apiAs, tempTag } from '../scheduler/helpers'

// D55 §2.3 (task 4985), T7: malformed JSON and an oversize body, sent from the
// UI's origin straight to the API (cross-origin, as on DEV and prod), come back
// readable with the server's status, not as "Failed to fetch".
// D55 §2.4 (task 4983), T8: malformed `memberships` on a new person is a 422.
test.use({ storageState: authFile('bartender1') })

const { apiUrl } = activeProfile()

test('T7: malformed JSON from the UI origin shows the server error, not "Failed to fetch"', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    try {
      const res = await fetch(`${url}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      })
      return { status: res.status, body: await res.text() }
    } catch (e) {
      return { failed: String(e) }
    }
  }, apiUrl)
  expect(result).toMatchObject({ status: 400 })
  expect((result as { body: string }).body).toContain('Bad Request')
})

test('T7: an oversize body from the UI origin is a readable 413', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    try {
      const body = JSON.stringify({ email: 'x'.repeat(9_000_000) })
      const res = await fetch(`${url}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      return { status: res.status }
    } catch (e) {
      return { failed: String(e) }
    }
  }, apiUrl)
  expect(result).toEqual({ status: 413 })
})

test('T8: malformed memberships on a new person is a 422 and saves nothing', async () => {
  const owner = await apiAs('owner')
  for (const memberships of [{ department: 'bar', role: 'employee' }, 'bar', [null]]) {
    const email = `d55-t8-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@rockcut-test.com`
    const res = await owner.post('/api/users', { data: { email, name: tempTag('D55 T8'), memberships } })
    expect(res.status(), await res.text()).toBe(422)
    expect((await res.json()).errors.memberships).toHaveLength(1)
    const users = (await (await owner.get('/api/users')).json()).data as { email: string }[]
    expect(users.map((u) => u.email)).not.toContain(email)
  }
})
