import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { apiAs, tempTag } from '../scheduler/helpers'
import { createTempPerson, type TempPerson } from '../auth/helpers'
import type { PersonaKey } from '../../config/test-env'

// Shared helpers for the D37 Buy-a-Beer Board specs.

export interface Entry {
  id: number
  recipient_name: string
  purchaser_name: string
  beers_remaining: number
  imported_at: string | null
}

/** A `[TEST-TEMP]` board entry, added through the API as `as`. */
export async function addEntry(beers: number, label = 'entry', as: PersonaKey = 'bartender1'): Promise<Entry> {
  const api = await apiAs(as)
  const res = await api.post('/api/beer_board', {
    data: { recipient_name: tempTag(label), purchaser_name: 'Chris', beers },
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data
}

/** Delete `[TEST-TEMP]` entries still on the board (a spec's own leftovers). */
export async function cleanEntries(ids: number[]) {
  const api = await apiAs('owner')
  for (const id of ids) await api.delete(`/api/beer_board/${id}`)
}

/** A `[TEST-TEMP]` Taproom employee with a staff code (set by barMgr). */
export async function personWithCode(label: string): Promise<{ person: TempPerson; code: string }> {
  const person = await createTempPerson(label, { ready: false })
  const mgr = await apiAs('barMgr')
  const code = (await (await mgr.get('/api/staff_codes/suggest')).json()).data.code
  const res = await mgr.put(`/api/users/${person.id}/staff_code`, { data: { code } })
  expect(res.status(), await res.text()).toBe(200)
  return { person, code }
}

/** The newest History rows mentioning `q`, as barMgr sees them. */
export async function historyFor(q: string) {
  const res = await (await apiAs('barMgr')).get('/api/beer_board/history', { params: { q } })
  expect(res.status()).toBe(200)
  return (await res.json()).data as {
    action: string
    actor_name: string
    on_shared_device: boolean
    beers_before: number
    beers_after: number
  }[]
}

/** The open board entries, as barMgr sees them. */
export async function boardEntries(): Promise<(Entry & { moved_off_board_at: string })[]> {
  const res = await (await apiAs('barMgr')).get('/api/beer_board')
  expect(res.status()).toBe(200)
  return (await res.json()).data
}

/** Delete every open entry whose For name contains one of `tags` (case-insensitive). */
export async function cleanTagged(tags: string[]) {
  if (!tags.length) return
  const lower = tags.map((t) => t.toLowerCase())
  const ids = (await boardEntries())
    .filter((e) => lower.some((t) => e.recipient_name.toLowerCase().includes(t)))
    .map((e) => e.id)
  await cleanEntries(ids)
}

/** A CSV import file: the header plus `lines`. */
export const csvFile = (lines: string[], header = 'For,Bought by,Beers') =>
  Buffer.from([header, ...lines].join('\n') + '\n')

/**
 * Import `file` through the API as barMgr, answering every duplicate group
 * with Allow. Used to set up and to restore the board after a Replace spec.
 */
export async function importViaApi(file: Buffer, mode: 'add' | 'replace') {
  const api = await apiAs('barMgr')
  const pv = await api.post('/api/beer_board/import/preview', {
    multipart: { mode, file: { name: 'restore.csv', mimeType: 'text/csv', buffer: file } },
  })
  expect(pv.status(), await pv.text()).toBe(200)
  const preview = (await pv.json()).data
  expect(preview.errors).toEqual([])
  const resolutions = Object.fromEntries(preview.groups.map((g: { key: string }) => [g.key, { choice: 'allow' }]))
  const res = await api.post('/api/beer_board/import', {
    data: { mode, rows: preview.rows, resolutions, signature: preview.signature, file_name: 'restore.csv' },
  })
  expect(res.status(), await res.text()).toBe(200)
}

/** The board as an export CSV (a snapshot to restore after a Replace spec). */
export async function exportBoard(): Promise<Buffer> {
  const res = await (await apiAs('barMgr')).get('/api/beer_board/export.csv')
  expect(res.status()).toBe(200)
  return await res.body()
}

/** Today in Colorado as the board shows it: "Oct 5, 2026". */
export const today = () =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())

/** Add an entry through the API as `as` (exact names; the caller tags them). */
export async function addAs(as: PersonaKey, recipient: string, purchaser: string, beers: number) {
  const res = await (await apiAs(as)).post('/api/beer_board', {
    data: { recipient_name: recipient, purchaser_name: purchaser, beers },
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data as { id: number }
}

export async function openBoard(page: Page) {
  await page.goto('/taproom/beer-board')
  await expect(page.getByTestId('board-grid')).toBeVisible()
}

/** Board → Import CSV → choose the file (and mode) → Preview. */
export async function previewImport(page: Page, file: Buffer, mode: 'add' | 'replace' = 'add') {
  await openBoard(page)
  await page.getByTestId('board-import').click()
  await page.getByTestId('import-file').setInputFiles({ name: 'board.csv', mimeType: 'text/csv', buffer: file })
  if (mode === 'replace') await page.getByTestId('import-mode-replace').check()
  const done = page.waitForResponse((r) => r.url().endsWith('/api/beer_board/import/preview'))
  await page.getByTestId('import-preview').click()
  expect((await done).status()).toBe(200)
}

/** Press Confirm in the import dialog; resolves to the import response. */
export async function confirmImport(page: Page) {
  const done = page.waitForResponse((r) => r.url().endsWith('/api/beer_board/import'))
  await page.getByTestId('import-confirm').click()
  return done
}

/** Board → Export CSV; returns the downloaded file's name and text. */
export async function downloadBoard(page: Page) {
  const dl = page.waitForEvent('download')
  await page.getByTestId('board-export').click()
  const file = await dl
  return { name: file.suggestedFilename(), text: readFileSync((await file.path())!, 'utf8') }
}

/** The grid rows for `q` after a reload, as "For | Bought by | Beers | Moved off | Imported". */
export async function rowsAfterReload(page: Page, q: string) {
  await page.reload()
  await page.getByTestId('board-search').fill(q)
  const rows = page.locator('[role=row][data-id]')
  await expect(rows.first()).toBeVisible()
  return rows.evaluateAll((els) =>
    els.map((el) =>
      ['recipient_name', 'purchaser_name', 'beers_remaining', 'moved_off_board_at', 'imported_at']
        .map((f) => el.querySelector(`[data-field=${f}]`)?.textContent ?? '')
        .join(' | '),
    ),
  )
}
