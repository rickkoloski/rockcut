import { test, expect } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { PREVIEW_URL, buildBoth, buildOld, serve, startPreview, stopPreview } from './helpers'

// D55 §2.9, T11: the app is called "Rock Cut Brewing": the built manifest and
// the page title. An installed app reads the manifest it's served after the
// update, so serving the old release and then this one shows the name change.
test.describe.configure({ timeout: 120_000 })

let server: ChildProcess | undefined
test.beforeAll(async () => {
  test.setTimeout(300_000)
  buildBoth()
  buildOld()
  serve('A')
  server = await startPreview()
})
test.afterAll(() => stopPreview(server))

const manifest = async () => (await fetch(`${PREVIEW_URL}/manifest.webmanifest`)).json()

test('T11: the manifest and the browser tab say Rock Cut Brewing', async ({ page }) => {
  serve('A')
  expect(await manifest()).toMatchObject({
    name: 'Rock Cut Brewing',
    short_name: 'Rock Cut',
    description: 'Rock Cut Brewing Co — brewery and staff app',
  })
  await page.goto('/')
  await expect(page).toHaveTitle('Rock Cut Brewing')
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Rock Cut')
})

test('T11: after the update, the manifest an installed app reads has the new name', async () => {
  serve('OLD')
  expect((await manifest()).name).toBe('Rockcut Scheduler')
  serve('A')
  expect((await manifest()).name).toBe('Rock Cut Brewing')
})
