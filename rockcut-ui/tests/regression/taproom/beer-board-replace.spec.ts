import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { tempTag } from '../scheduler/helpers'
import {
  addAs,
  boardEntries,
  cleanTagged,
  confirmImport,
  csvFile,
  downloadBoard,
  exportBoard,
  importViaApi,
  openBoard,
  previewImport,
  rowsAfterReload,
  today,
} from './helpers'

// D37 §3.6: Import → Replace as barMgr (S25, S28).
//
// Replace clears the whole shared board, so this file runs in its own
// Playwright project ("board-replace", playwright.config.ts): one worker,
// started only after every other spec has finished. Each test snapshots the
// board (an export) first and restores it afterwards with a Replace import of
// that snapshot: the same names, counts and moved-off dates come back, with
// new ids and today's import date.

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

const add = (recipient: string, purchaser: string, beers: number) => addAs('barMgr', recipient, purchaser, beers)

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
    await previewImport(page, csvFile([`${t} Ana,Bo,1`, `${t} Ana,Cy,2`]), 'replace')

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
    expect((await confirmImport(page)).status()).toBe(200)
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
    const { text } = await downloadBoard(page)
    await page.getByTestId('board-import').click()
    await page.getByTestId('import-file').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })
    await page.getByTestId('import-mode-replace').check()
    await page.getByTestId('import-preview').click()
    await expect(page.getByTestId('import-replace-summary')).toBeVisible()
    // Other For-name pairs on the shared board are kept as they are.
    for (const card of await page.locator('[data-testid$="-allow"]').all()) await card.check()
    await page.getByTestId('import-replace-text').fill('REPLACE')
    expect((await confirmImport(page)).status()).toBe(200)

    const after = await boardEntries()
    expect(after.map(key).sort()).toEqual(before)
    const d = today()
    expect(await rowsAfterReload(page, t)).toEqual([
      `${t} Pat | Chris | 2 | ${d} | ${d}`,
      `${t} Smith, Ana | Bo | 4 | ${d} | ${d}`,
    ])
  })
})
