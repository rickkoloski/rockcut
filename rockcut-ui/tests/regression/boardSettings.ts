import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { authFile, type PersonaKey } from '../config/test-env'
import { activeProfile } from '../config/targets'

/**
 * D58: task board settings live on the server, per account (`/api/me`'s
 * `board_settings`), so a choice one test makes is still there for the next
 * test and the next run. The `setup` project starts each run with none (the
 * token mint clears them); these helpers put a persona's boards back to the
 * defaults between tests.
 *
 * The API has no "forget": a reset saves the defaults, so the board then has
 * an entry and the browser carry-over won't run for it. A spec about the
 * carry-over uses a `[TEST-TEMP]` person instead (`auth/helpers.ts`).
 */

export type Span = 7 | 14
export interface BoardSettings {
  span: Span
  hide_completed: boolean
  hide_shifts: boolean
  first_day: 'today' | 'sunday' | 'monday'
  view: 'all' | 'mine' | 'unassigned'
  phone_view: 'vertical' | 'day'
}

/** As the UI's `BOARD_DEFAULTS` (src/lib/tasks.ts) and `BoardSettings.defaults/0`. */
export const BOARD_DEFAULTS: BoardSettings = {
  span: 14,
  hide_completed: false,
  hide_shifts: false,
  first_day: 'today',
  view: 'all',
  phone_view: 'vertical',
}

const clients = new Map<string, Promise<APIRequestContext>>()

function client(token: string): Promise<APIRequestContext> {
  let c = clients.get(token)
  if (!c) {
    c = request.newContext({ baseURL: activeProfile().apiUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` }, timeout: 20_000 })
    clients.set(token, c)
  }
  return c
}

type State = string | { origins?: { localStorage?: { name: string; value: string }[] }[] } | undefined

function tokenIn(state: State): string | null {
  const parsed = typeof state === 'string' ? JSON.parse(readFileSync(state, 'utf8')) : state
  const entry = parsed?.origins?.[0]?.localStorage?.find((e: { name: string }) => e.name === 'rockcut_token')
  return entry?.value ?? null
}

const tokenOf = (key: PersonaKey) => tokenIn(authFile(key))!

/** The account's stored settings, per board (only what was changed). */
export async function storedBoardSettings(key: PersonaKey): Promise<Record<string, Partial<BoardSettings>>> {
  const res = await (await client(tokenOf(key))).get('/api/me')
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).board_settings ?? {}
}

/** `PUT /api/me/board_settings/:board` as `key`; answers the status and the board's full settings. */
export async function putBoardSettings(key: PersonaKey, board: string, settings: Partial<BoardSettings>) {
  const res = await (await client(tokenOf(key))).put(`/api/me/board_settings/${board}`, { data: settings })
  return { status: res.status(), body: res.ok() ? ((await res.json()) as BoardSettings) : null }
}

/** Every board of the account behind `token` back to the defaults (the `setup` project, and the helpers below). */
export async function resetToken(token: string) {
  const api = await client(token)
  const me = await api.get('/api/me')
  if (!me.ok()) return
  const stored: Record<string, Record<string, unknown>> = (await me.json()).board_settings ?? {}
  for (const [board, values] of Object.entries(stored)) {
    const back = Object.fromEntries(
      Object.entries(values)
        .filter(([k, v]) => k in BOARD_DEFAULTS && v !== BOARD_DEFAULTS[k as keyof BoardSettings])
        .map(([k]) => [k, BOARD_DEFAULTS[k as keyof BoardSettings]]),
    )
    // A board the account can't read any more answers 403: nothing to show it.
    if (Object.keys(back).length > 0) await api.put(`/api/me/board_settings/${board}`, { data: back })
  }
}

/** Every board of these personas back to the defaults. */
export async function resetBoardSettings(...keys: PersonaKey[]) {
  for (const key of keys) await resetToken(tokenOf(key))
}

/**
 * Reset the board settings of the persona the test signs in as (its
 * `storageState`), and of `others` the test also opens, before and after each
 * test in the file (or describe) that calls it.
 */
export function resetBoardSettingsAroundEach(others: PersonaKey[] = []) {
  const reset = async (state: State) => {
    const token = tokenIn(state)
    if (token) await resetToken(token)
    await resetBoardSettings(...others)
  }
  test.beforeEach(async ({ storageState }) => reset(storageState as State))
  test.afterEach(async ({ storageState }) => reset(storageState as State))
}
