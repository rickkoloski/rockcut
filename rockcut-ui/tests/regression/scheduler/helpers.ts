import { readFileSync } from 'node:fs'
import { expect, request, type APIRequestContext, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { activeProfile } from '../../config/targets'

// Shared helpers for the D32 scheduler specs.

/** An API client acting as `persona`, using the token the auth setup already minted. */
export async function apiAs(persona: PersonaKey): Promise<APIRequestContext> {
  const state = JSON.parse(readFileSync(authFile(persona), 'utf8'))
  const token = state.origins[0].localStorage.find((e: { name: string }) => e.name === 'rockcut_token').value
  return request.newContext({
    baseURL: activeProfile().apiUrl,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
}

/** A unique `[TEST-TEMP]` title/notes tag for one test run (specs run in parallel). */
export function tempTag(label: string): string {
  return `[TEST-TEMP] ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Today in Denver as "YYYY-MM-DD". */
export function denverToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The Monday of the week containing `key`. */
export function mondayOf(key: string): string {
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay()
  return addDays(key, dow === 0 ? -6 : 1 - dow)
}

/** Open the Scheduler and move `weeks` weeks ahead; resolves when the grid is showing. */
export async function openScheduler(page: Page, weeks = 0) {
  await page.goto('/scheduler')
  await expect(page.getByTestId('events-row')).toBeVisible()
  for (let i = 0; i < weeks; i++) {
    const monday = addDays(mondayOf(denverToday()), 7 * (i + 1))
    await page.getByRole('button').filter({ has: page.locator('[data-testid="ChevronRightIcon"]') }).first().click()
    await expect(page.getByTestId(`events-cell-${monday}`)).toBeVisible()
  }
}

/**
 * Delete the events (whole series from each one) and shifts this test created:
 * titles or notes starting with `prefix`, which must begin with `[TEST-TEMP]`.
 * Specs run in parallel, so each test cleans up only its own prefix.
 */
export async function cleanupTemp(api: APIRequestContext, prefix: string, from: string, to: string) {
  if (!prefix.startsWith('[TEST-TEMP]')) throw new Error(`cleanup prefix must start with [TEST-TEMP]: ${prefix}`)
  const events = (await (await api.get('/api/schedule_events', { params: { from, to } })).json()).data as { id: number; title: string }[]
  for (const e of events.filter((x) => x.title.startsWith(prefix))) {
    await api.delete(`/api/schedule_events/${e.id}`, { params: { scope: 'following' } })
  }
  const shifts = (await (await api.get('/api/shifts', { params: { from, to } })).json()).data as { id: number; notes: string | null }[]
  for (const s of shifts.filter((x) => x.notes?.startsWith(prefix))) {
    await api.delete(`/api/shifts/${s.id}`)
  }
}
