import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { activeProfile } from '../../config/targets'

// Shared helpers for the D33 shared-device specs.

export interface ApiDevice {
  id: number
  name: string
  active: boolean
  tokens: { id: number; name: string; last_seen_at: string | null; revoked_at: string | null }[]
}

/** Create a `[TEST-TEMP]` device account through the API (owner only). */
export async function createDevice(ownerApi: APIRequestContext, name: string, homeKey = 'bar'): Promise<ApiDevice> {
  if (!name.startsWith('[TEST-TEMP]')) throw new Error(`device name must start with [TEST-TEMP]: ${name}`)
  const depts = (await (await ownerApi.get('/api/departments')).json()).data as { id: number; key: string }[]
  const res = await ownerApi.post('/api/devices', { data: { name, home_department_id: depts.find((d) => d.key === homeKey)!.id } })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data
}

/** Delete the `[TEST-TEMP]` devices whose name starts with `prefix` (tokens cascade). */
export async function deleteDevices(ownerApi: APIRequestContext, prefix: string) {
  if (!prefix.startsWith('[TEST-TEMP]')) throw new Error(`cleanup prefix must start with [TEST-TEMP]: ${prefix}`)
  const devices = (await (await ownerApi.get('/api/devices')).json()).data as ApiDevice[]
  for (const d of devices.filter((x) => x.name.startsWith(prefix))) await ownerApi.delete(`/api/devices/${d.id}`)
}

export async function getDevice(api: APIRequestContext, id: number): Promise<ApiDevice | undefined> {
  const devices = (await (await api.get('/api/devices')).json()).data as ApiDevice[]
  return devices.find((d) => d.id === id)
}

/** A fresh pairing code for a device, as `api`'s persona. */
export async function pairingCode(api: APIRequestContext, deviceId: number): Promise<string> {
  const res = await api.post(`/api/devices/${deviceId}/pairing_code`)
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).code
}

/**
 * A new browser context with no signed-in user — a tablet out of the box.
 * No request header touches the wrong-code limiter (review item 5): locally the
 * dev server's per-client limit is raised in config/dev.exs, because every
 * local run pairs from 127.0.0.1.
 */
export async function blankTablet(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  // An explicit empty storageState: inside a test, browser.newContext() otherwise
  // inherits the describe block's `use({ storageState })` (a signed-in persona).
  const context = await browser.newContext({ baseURL: activeProfile().uiUrl, storageState: { cookies: [], origins: [] } })
  return { context, page: await context.newPage() }
}

/** On a blank tablet: "Set up as a shared device" with `code` and `name`; resolves when signed in. */
export async function setUpTablet(page: Page, code: string, name: string) {
  await page.goto('/')
  await page.getByTestId('device-setup-link').click()
  await page.getByTestId('device-code').fill(code)
  await page.getByTestId('device-name').fill(name)
  await page.getByTestId('device-submit').click()
  await expect(page.getByTestId('device-chip')).toBeVisible()
}
