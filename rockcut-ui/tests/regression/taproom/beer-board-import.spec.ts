import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { boardEntries, cleanTagged, csvFile, exportBoard, historyFor, importViaApi } from './helpers'

// D37 §3.6: CSV import and export as barMgr (S20–S30).
//
// Replace (S25, S28) clears the whole shared board. This file runs serially,
// and each Replace spec snapshots the board (an export) first and restores it
// afterwards with a Replace import of that snapshot: the same names, counts
// and moved-off dates come back, with new ids and today's import date.

test.use({ storageState: authFile('barMgr') })
test.describe.configure({ mode: 'serial' })

const tags: string[] = []
const tag = (label: string) => {
  const t = tempTag(label)
  tags.push(t)
  return t
}
test.afterEach(async () => {
  await cleanTagged(tags.splice(0))
})

const today = () =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())

async function add(recipient: string, purchaser: string, beers: number) {
  const res = await (await apiAs('barMgr')).post('/api/beer_board', {
    data: { recipient_name: recipient, purchaser_name: purchaser, beers },
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data as { id: number }
}

async function openBoard(page: Page) {
  await page.goto('/taproom/beer-board')
  await expect(page.getByTestId('board-grid')).toBeVisible()
}

/** Board → Import CSV → choose the file (and mode) → Preview. */
async function preview(page: Page, file: Buffer, mode: 'add' | 'replace' = 'add') {
  await openBoard(page)
  await page.getByTestId('board-import').click()
  await page.getByTestId('import-file').setInputFiles({ name: 'board.csv', mimeType: 'text/csv', buffer: file })
  if (mode === 'replace') await page.getByTestId('import-mode-replace').check()
  const done = page.waitForResponse((r) => r.url().endsWith('/api/beer_board/import/preview'))
  await page.getByTestId('import-preview').click()
  expect((await done).status()).toBe(200)
}

async function confirm(page: Page) {
  const done = page.waitForResponse((r) => r.url().endsWith('/api/beer_board/import'))
  await page.getByTestId('import-confirm').click()
  return done
}

/** Board → Export CSV; returns the downloaded file's name and text. */
async function download(page: Page) {
  const dl = page.waitForEvent('download')
  await page.getByTestId('board-export').click()
  const file = await dl
  return { name: file.suggestedFilename(), text: readFileSync((await file.path())!, 'utf8') }
}

/** The grid rows for `q` after a reload, as "For | Bought by | Beers | Moved off | Imported". */
async function rowsAfterReload(page: Page, q: string) {
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

/** S21's board and file, under one tag. */
async function s21(page: Page) {
  const t = tag('S21')
  await add(`${t} Pat`, 'Chris', 2)
  await preview(
    page,
    csvFile([`${t.toLowerCase()} pat,Lee,3`, `${t} Sam,Jo,1`, `${t} Sam,Kim,2`, `${t} Ana,Bo,1`]),
  )
  return t
}

test('S20: Export CSV downloads the board; a name with a comma stays one cell', async ({ page }) => {
  const t = tag('S20')
  await add(`${t} Smith, Pat`, 'Chris', 2)
  await add(`${t} Ana`, 'Bo', 1)
  await add(`${t} Kim`, 'Lee', 3)
  await add(`${t} Ray`, 'Jo', 4)
  await openBoard(page)

  const { name, text } = await download(page)
  expect(name).toMatch(/^buy-a-beer-board-\d{4}-\d{2}-\d{2}\.csv$/)
  const lines = text.split('\r\n')
  expect(lines[0]).toBe('For,Bought by,Beers,Moved off board,Imported')
  const mine = lines.filter((l) => l.includes(t))
  expect(mine).toHaveLength(4)
  expect(mine).toContainEqual(expect.stringMatching(new RegExp(`^"\\[TEST-TEMP\\] S20 \\w+ Smith, Pat",Chris,2,\\d{4}-`)))
})

test('S20: History → Export CSV downloads the change log', async ({ page }) => {
  const t = tag('S20h')
  await add(`${t} Pat`, 'Chris', 2)
  await openBoard(page)
  await page.getByTestId('board-tab-history').click()
  const dl = page.waitForEvent('download')
  await page.getByTestId('board-history-export').click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/^buy-a-beer-board-history-\d{4}-\d{2}-\d{2}\.csv$/)
  const text = readFileSync((await file.path())!, 'utf8')
  expect(text.split('\r\n')[0]).toBe('When,Who,Shared device,Action,Source,For,Bought by,Before,After')
  expect(text).toContain(`,Casey Tap,no,created,,${t} Pat,Chris,0,2`)
})

test('S21: preview lists 1 New and 2 groups; Confirm waits for both choices', async ({ page }) => {
  const t = await s21(page)
  await expect(page.getByTestId('import-new-row')).toHaveCount(1)
  await expect(page.getByTestId('import-new')).toContainText(`${t} Ana`)
  await expect(page.getByTestId('import-group-0-item')).toHaveCount(2)
  await expect(page.getByTestId('import-group-0')).toContainText('On the board')
  await expect(page.getByTestId('import-group-0')).toContainText('From the file, row 2')
  await expect(page.getByTestId('import-group-1-item')).toHaveCount(2)
  await expect(page.getByTestId('import-group-1')).not.toContainText('On the board')

  await expect(page.getByTestId('import-confirm')).toBeDisabled()
  await page.getByTestId('import-group-1-allow').check()
  await expect(page.getByTestId('import-confirm')).toBeDisabled()
  await page.getByTestId('import-group-0-allow').check()
  await expect(page.getByTestId('import-confirm')).toBeEnabled()
})

test('S22: Combine Pat (Chris & Lee), Allow Sam; persists; History shows the import', async ({ page }) => {
  const t = await s21(page)
  await page.getByTestId('import-group-0-combine').check()
  await expect(page.getByTestId('import-group-0-purchaser')).toHaveValue('Chris & Lee')
  await page.getByTestId('import-group-1-allow').check()
  expect((await confirm(page)).status()).toBe(200)
  await expect(page.getByTestId('board-notice')).toHaveText('Imported 3, combined 1 group, deleted 0, skipped 0')

  const d = today()
  expect(await rowsAfterReload(page, t)).toEqual([
    `${t} Ana | Bo | 1 | ${d} | ${d}`,
    `${t} Pat | Chris & Lee | 5 | ${d} | `,
    `${t} Sam | Jo | 1 | ${d} | ${d}`,
    `${t} Sam | Kim | 2 | ${d} | ${d}`,
  ])

  const history = (await historyFor(t)) as { action: string; beers_before: number; beers_after: number; source?: string }[]
  const imported = history.filter((e) => e.source === 'import')
  expect(imported.filter((e) => e.action === 'created')).toHaveLength(3)
  expect(imported.filter((e) => e.action === 'edited').map((e) => [e.beers_before, e.beers_after])).toEqual([[2, 5]])
})

test('S23: Pick — uncheck the board entry, keep the file row', async ({ page }) => {
  const t = tag('S23')
  const board = await add(`${t} Pat`, 'Chris', 2)
  await preview(page, csvFile([`${t} Pat,Lee,3`]))
  await page.getByTestId('import-group-0-pick').check()
  await expect(page.getByTestId('import-group-0-warning')).toHaveCount(0)
  await page.getByTestId(`import-item-b:${board.id}`).uncheck()
  await expect(page.getByTestId('import-group-0-warning')).toHaveText('Deletes 1 entry on the board')
  expect((await confirm(page)).status()).toBe(200)
  await expect(page.getByTestId('board-notice')).toHaveText('Imported 1, combined 0 groups, deleted 1, skipped 0')

  expect(await rowsAfterReload(page, t)).toEqual([`${t} Pat | Lee | 3 | ${today()} | ${today()}`])
  const history = (await historyFor(t)) as { action: string; source?: string }[]
  expect(history.filter((e) => e.source === 'import').map((e) => e.action).sort()).toEqual(['created', 'deleted'])
})

test('S24: Combine is unavailable over 99; Allow and Pick still work', async ({ page }) => {
  const t = tag('S24')
  await add(`${t} Pat`, 'Chris', 60)
  await preview(page, csvFile([`${t} Pat,Lee,60`]))
  await expect(page.getByTestId('import-group-0-combine')).toBeDisabled()
  await expect(page.getByTestId('import-group-0')).toContainText('Combine (over 99)')
  await page.getByTestId('import-group-0-pick').check()
  await expect(page.getByTestId('import-confirm')).toBeEnabled()
  await page.getByTestId('import-group-0-allow').check()
  await expect(page.getByTestId('import-confirm')).toBeEnabled()
})

test('S26: row errors are listed by row; nothing can be imported', async ({ page }) => {
  const t = tag('S26')
  await preview(page, csvFile([`${t} Pat,Chris,2`, `,Lee,3`, `${t} Sam,Jo,1`, `${t} Ana,Bo,0`]))
  await expect(page.getByTestId('import-error-row')).toHaveText([
    'Row 3: For is blank',
    'Row 5: Beers must be a whole number from 1 to 99',
  ])
  await expect(page.getByTestId('import-confirm')).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel' }).click()
  expect((await boardEntries()).filter((e) => e.recipient_name.includes(t))).toEqual([])
})

test('S27: the board changes before Confirm → "changed since your preview"; Re-preview shows it', async ({ page }) => {
  const t = tag('S27')
  await preview(page, csvFile([`${t} Pat,Lee,3`]))
  await expect(page.getByTestId('import-new-row')).toHaveCount(1)

  // bartender1 adds "Pat" from the floor meanwhile.
  const res = await (await apiAs('bartender1')).post('/api/beer_board', {
    data: { recipient_name: `${t} Pat`, purchaser_name: 'Chris', beers: 1 },
  })
  expect(res.status()).toBe(201)

  expect((await confirm(page)).status()).toBe(409)
  await expect(page.getByTestId('import-stale')).toContainText('The board changed since your preview')
  // Nothing applied: only bartender1's entry.
  expect((await boardEntries()).filter((e) => e.recipient_name.includes(t))).toHaveLength(1)

  await page.getByTestId('import-repreview').click()
  await expect(page.getByTestId('import-group-0-item')).toHaveCount(2)
  await expect(page.getByTestId('import-group-0')).toContainText('On the board')
})

test('S29: a formula-like name is exported with a leading quote and re-imports intact', async ({ page }) => {
  const t = tag('S29')
  const name = `=HYPERLINK("x") ${t}`
  const entry = await add(name, 'Chris', 2)
  await openBoard(page)
  const { text } = await download(page)
  const line = text.split('\r\n').find((l) => l.includes(t))!
  expect(line.startsWith(`"'=HYPERLINK(""x"") ${t}",Chris,2,`)).toBe(true)

  // Remove it, then import the exported line: the original name comes back.
  await (await apiAs('barMgr')).delete(`/api/beer_board/${entry.id}`)
  await preview(page, csvFile([line], text.split('\r\n')[0]))
  await expect(page.getByTestId('import-new')).toContainText(name)
  expect((await confirm(page)).status()).toBe(200)
  expect((await boardEntries()).filter((e) => e.recipient_name.includes(t)).map((e) => e.recipient_name)).toEqual([name])
})

test('S30: no Moved off board column → import date; a filled date is kept', async ({ page }) => {
  const t = tag('S30')
  await preview(page, csvFile([`${t} A,Chris,1`]))
  expect((await confirm(page)).status()).toBe(200)

  await preview(page, csvFile([`${t} B,Lee,1,2026-09-01`, `${t} C,Jo,1,`], 'For,Bought by,Beers,Moved off board'))
  await expect(page.getByTestId('import-new')).toContainText('Sep 1, 2026')
  await expect(page.getByTestId('import-new')).toContainText('Import date')
  expect((await confirm(page)).status()).toBe(200)

  const d = today()
  expect(await rowsAfterReload(page, t)).toEqual([
    `${t} A | Chris | 1 | ${d} | ${d}`,
    `${t} B | Lee | 1 | Sep 1, 2026 | ${d}`,
    `${t} C | Jo | 1 | ${d} | ${d}`,
  ])
})

test.describe('Replace (clears the shared board; restored after)', () => {
  let snapshot: Buffer | null = null
  test.beforeEach(async () => {
    snapshot = await exportBoard()
  })
  test.afterEach(async () => {
    if (snapshot) await importViaApi(snapshot, 'replace')
    snapshot = null
  })

  test('S25: Replace warns with the count and beers, needs a choice and REPLACE', async ({ page }) => {
    const t = tag('S25')
    const before = await boardEntries()
    await preview(page, csvFile([`${t} Ana,Bo,1`, `${t} Ana,Cy,2`]), 'replace')

    const beers = before.reduce((n, e) => n + e.beers_remaining, 0)
    await expect(page.getByTestId('import-replace-summary')).toContainText(
      `This deletes all ${before.length} ${before.length === 1 ? 'entry' : 'entries'} on the board (total ${beers} ${beers === 1 ? 'beer' : 'beers'}) and imports 2.`,
    )
    await expect(page.getByTestId('import-export-first')).toBeVisible()

    await page.getByTestId('import-replace-text').fill('REPLACE')
    await expect(page.getByTestId('import-confirm')).toBeDisabled()
    await page.getByTestId('import-replace-text').fill('')
    await page.getByTestId('import-group-0-allow').check()
    await expect(page.getByTestId('import-confirm')).toBeDisabled()
    await page.getByTestId('import-replace-text').fill('REPLACE')
    expect((await confirm(page)).status()).toBe(200)
    await expect(page.getByTestId('board-notice')).toHaveText(`Replaced: ${before.length} removed, 2 imported`)

    await page.reload()
    await expect(page.locator('[role=row][data-id]')).toHaveCount(2)
    expect(await rowsAfterReload(page, t)).toEqual([
      `${t} Ana | Bo | 1 | ${today()} | ${today()}`,
      `${t} Ana | Cy | 2 | ${today()} | ${today()}`,
    ])
  })

  test('S28: Export, then Replace with that file: same lines and moved-off dates, imported today', async ({ page }) => {
    const t = tag('S28')
    await add(`${t} Pat`, 'Chris', 2)
    await add(`${t} Smith, Ana`, 'Bo', 4)
    const key = (e: { recipient_name: string; purchaser_name: string; beers_remaining: number; moved_off_board_at: string }) =>
      `${e.recipient_name}|${e.purchaser_name}|${e.beers_remaining}|${e.moved_off_board_at}`
    const before = (await boardEntries()).map(key).sort()

    await openBoard(page)
    const { text } = await download(page)
    await page.getByTestId('board-import').click()
    await page.getByTestId('import-file').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })
    await page.getByTestId('import-mode-replace').check()
    await page.getByTestId('import-preview').click()
    await expect(page.getByTestId('import-replace-summary')).toBeVisible()
    // Other For-name pairs on the shared board are kept as they are.
    for (const card of await page.locator('[data-testid$="-allow"]').all()) await card.check()
    await page.getByTestId('import-replace-text').fill('REPLACE')
    expect((await confirm(page)).status()).toBe(200)

    const after = await boardEntries()
    expect(after.map(key).sort()).toEqual(before)
    const d = today()
    expect(await rowsAfterReload(page, t)).toEqual([
      `${t} Pat | Chris | 2 | ${d} | ${d}`,
      `${t} Smith, Ana | Bo | 4 | ${d} | ${d}`,
    ])
  })
})
