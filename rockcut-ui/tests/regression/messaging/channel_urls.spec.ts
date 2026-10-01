import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'

// 3939 (from the D31 DEV pass): a channel key the user can't see redirects to
// /messages (then its first channel) — never an empty channel with a message
// box, never polling into 403s, never a silent failed send. Every user.

/** Record every request the page makes for a channel's messages. */
function watchChannel(page: Page, key: string): string[] {
  const hits: string[] = []
  page.on('request', (r) => {
    if (r.url().includes(`/api/channels/${encodeURIComponent(key)}/`) || r.url().includes(`/api/channels/${key}/`)) hits.push(r.url())
  })
  return hits
}

test.describe('floater (no Managers channel)', () => {
  test.use({ storageState: authFile('floater') })

  test('3939: /messages/managers redirects; no composer; no 403 polling', async ({ page }) => {
    const hits = watchChannel(page, 'managers')
    const allLoaded = page.waitForResponse((r) => r.url().includes('/api/channels/all/messages') && r.status() === 200)
    await page.goto('/messages/managers')
    await expect(page).toHaveURL(/\/messages\/all$/)
    await expect(page.getByRole('heading', { name: 'All-staff' })).toBeVisible()
    await expect(page.getByPlaceholder('Message Managers')).toHaveCount(0)
    // The redirect target's messages have loaded, so any request for the bad key would have fired.
    await allLoaded
    expect(hits).toEqual([])
  })
})

test.describe('taproomDevice (shared tablet)', () => {
  test.use({ storageState: authFile('taproomDevice') })

  for (const key of ['managers', 'dept:brewery']) {
    test(`3939: /messages/${key} redirects to a channel it can read`, async ({ page }) => {
      const hits = watchChannel(page, key)
      await page.goto(`/messages/${key}`)
      await expect(page).toHaveURL(/\/messages\/all$/)
      await expect(page.getByTestId('read-only-notice')).toBeVisible()
      await expect(page.getByRole('textbox')).toHaveCount(0)
      expect(hits).toEqual([])
    })
  }
})

test.describe('bartender1 (can post)', () => {
  test.use({ storageState: authFile('bartender1') })

  test('3939: a refused send shows an error and keeps the draft', async ({ page }) => {
    await page.route('**/api/channels/all/messages', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Forbidden' }) })
        : route.continue(),
    )
    await page.goto('/messages/all')
    const box = page.getByPlaceholder('Message All-staff')
    await box.fill('this send will be refused')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByTestId('send-error')).toContainText("You can't post in this channel.")
    await expect(box).toHaveValue('this send will be refused')
  })

  test('a normal post still works and persists after reload', async ({ page }) => {
    // [TEST-TEMP] messages are removed by the synthetic setup (there's no delete API for messages).
    const body = tempTag('3939 hello')
    await page.goto('/messages/all')
    await page.getByPlaceholder('Message All-staff').fill(body)
    const posted = page.waitForResponse((r) => r.url().endsWith('/api/channels/all/messages') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Send message' }).click()
    expect((await posted).status()).toBe(201)
    await page.reload()
    await expect(page.getByText(body)).toBeVisible()

    const api = await apiAs('bartender1')
    const msgs = (await (await api.get('/api/channels/all/messages')).json()).data as { body: string }[]
    expect(msgs.some((m) => m.body === body)).toBe(true)
  })
})
