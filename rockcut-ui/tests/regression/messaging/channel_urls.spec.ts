import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'

// 3939 (from the D31 DEV pass): a channel key the user can't see never shows an
// empty channel with a message box, never polls into 403s, and a send never
// fails silently. D36-B (task 4001): instead of a silent redirect, a person sees
// "Channel not found" and a shared tablet "Not available on a shared device".

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

  test('3939/4001: /messages/managers says "Channel not found"; no composer; no 403 polling', async ({ page }) => {
    const hits = watchChannel(page, 'managers')
    await page.goto('/messages/managers')
    await expect(page.getByTestId('channel-not-found')).toBeVisible()
    await expect(page).toHaveURL(/\/messages\/managers$/)
    await expect(page.getByRole('textbox')).toHaveCount(0)
    expect(hits).toEqual([])
    // The way out opens a channel they can read.
    await page.getByRole('button', { name: 'Go to Messages' }).click()
    await expect(page).toHaveURL(/\/messages\/all$/)
    await expect(page.getByRole('heading', { name: 'All-staff' })).toBeVisible()
  })
})

test.describe('taproomDevice (shared tablet)', () => {
  test.use({ storageState: authFile('taproomDevice') })

  for (const key of ['managers', 'dept:brewery']) {
    test(`3939/4001: /messages/${key} is "Not available on a shared device"`, async ({ page }) => {
      const hits = watchChannel(page, key)
      await page.goto(`/messages/${key}`)
      await expect(page.getByTestId('device-not-available')).toBeVisible()
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
