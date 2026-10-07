import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import {
  addAs,
  boardEntries,
  cleanTagged,
  confirmImport,
  csvFile,
  downloadBoard,
  historyFor,
  openBoard,
  previewImport,
  rowsAfterReload,
  today,
} from './helpers'

// D37 §3.6: CSV import and export as barMgr (S20–S24, S26, S27, S29, S30).
// Replace (S25, S28) clears the shared board, so it lives in
// beer-board-replace.spec.ts, in its own Playwright project that runs after
// this one, on one worker.

test.use({ storageState: authFile('barMgr') })

const tags: string[] = []
const tag = (label: string) => {
  const t = tempTag(label)
  tags.push(t)
  return t
}
test.afterEach(async () => {
  await cleanTagged(tags.splice(0))
})

const add = (recipient: string, purchaser: string, beers: number) => addAs('barMgr', recipient, purchaser, beers)

/** S21's board and file, under one tag. */
async function s21(page: Page) {
  const t = tag('S21')
  await add(`${t} Pat`, 'Chris', 2)
  await previewImport(
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

  const { name, text } = await downloadBoard(page)
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
  expect((await confirmImport(page)).status()).toBe(200)
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
  await previewImport(page, csvFile([`${t} Pat,Lee,3`]))
  await page.getByTestId('import-group-0-pick').check()
  await expect(page.getByTestId('import-group-0-warning')).toHaveCount(0)
  await page.getByTestId(`import-item-b:${board.id}`).uncheck()
  await expect(page.getByTestId('import-group-0-warning')).toHaveText('Deletes 1 entry on the board')
  expect((await confirmImport(page)).status()).toBe(200)
  await expect(page.getByTestId('board-notice')).toHaveText('Imported 1, combined 0 groups, deleted 1, skipped 0')

  expect(await rowsAfterReload(page, t)).toEqual([`${t} Pat | Lee | 3 | ${today()} | ${today()}`])
  const history = (await historyFor(t)) as { action: string; source?: string }[]
  expect(history.filter((e) => e.source === 'import').map((e) => e.action).sort()).toEqual(['created', 'deleted'])
})

test('S24: Combine is unavailable over 99; Allow and Pick still work', async ({ page }) => {
  const t = tag('S24')
  await add(`${t} Pat`, 'Chris', 60)
  await previewImport(page, csvFile([`${t} Pat,Lee,60`]))
  await expect(page.getByTestId('import-group-0-combine')).toBeDisabled()
  await expect(page.getByTestId('import-group-0')).toContainText('Combine (over 99)')
  await page.getByTestId('import-group-0-pick').check()
  await expect(page.getByTestId('import-confirm')).toBeEnabled()
  await page.getByTestId('import-group-0-allow').check()
  await expect(page.getByTestId('import-confirm')).toBeEnabled()
})

test('S26: row errors are listed by row; nothing can be imported', async ({ page }) => {
  const t = tag('S26')
  await previewImport(page, csvFile([`${t} Pat,Chris,2`, `,Lee,3`, `${t} Sam,Jo,1`, `${t} Ana,Bo,0`]))
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
  await previewImport(page, csvFile([`${t} Pat,Lee,3`]))
  await expect(page.getByTestId('import-new-row')).toHaveCount(1)

  // bartender1 adds "Pat" from the floor meanwhile.
  const res = await (await apiAs('bartender1')).post('/api/beer_board', {
    data: { recipient_name: `${t} Pat`, purchaser_name: 'Chris', beers: 1 },
  })
  expect(res.status()).toBe(201)

  expect((await confirmImport(page)).status()).toBe(409)
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
  const { text } = await downloadBoard(page)
  const line = text.split('\r\n').find((l) => l.includes(t))!
  expect(line.startsWith(`"'=HYPERLINK(""x"") ${t}",Chris,2,`)).toBe(true)

  // Remove it, then import the exported line: the original name comes back.
  await (await apiAs('barMgr')).delete(`/api/beer_board/${entry.id}`)
  await previewImport(page, csvFile([line], text.split('\r\n')[0]))
  await expect(page.getByTestId('import-new')).toContainText(name)
  expect((await confirmImport(page)).status()).toBe(200)
  expect((await boardEntries()).filter((e) => e.recipient_name.includes(t)).map((e) => e.recipient_name)).toEqual([name])
})

test('S30: no Moved off board column → import date; a filled date is kept', async ({ page }) => {
  const t = tag('S30')
  await previewImport(page, csvFile([`${t} A,Chris,1`]))
  expect((await confirmImport(page)).status()).toBe(200)

  await previewImport(page, csvFile([`${t} B,Lee,1,2026-09-01`, `${t} C,Jo,1,`], 'For,Bought by,Beers,Moved off board'))
  await expect(page.getByTestId('import-new')).toContainText('Sep 1, 2026')
  await expect(page.getByTestId('import-new')).toContainText('Import date')
  expect((await confirmImport(page)).status()).toBe(200)

  const d = today()
  expect(await rowsAfterReload(page, t)).toEqual([
    `${t} A | Chris | 1 | ${d} | ${d}`,
    `${t} B | Lee | 1 | Sep 1, 2026 | ${d}`,
    `${t} C | Jo | 1 | ${d} | ${d}`,
  ])
})

test('DEV pass 1 G5: a Notes column is ignored and listed; the import applies', async ({ page }) => {
  const t = tag('G5')
  await previewImport(page, csvFile([`${t} Pat,Chris,2,regular`, `${t} Ana,Lee,1,`], 'For,Bought by,Beers,Notes'))
  await expect(page.getByTestId('import-ignored-columns')).toHaveText('Ignored columns: Notes')
  await expect(page.getByTestId('import-errors')).toHaveCount(0)
  expect((await confirmImport(page)).status()).toBe(200)

  const d = today()
  expect(await rowsAfterReload(page, t)).toEqual([`${t} Ana | Lee | 1 | ${d} | ${d}`, `${t} Pat | Chris | 2 | ${d} | ${d}`])
})
