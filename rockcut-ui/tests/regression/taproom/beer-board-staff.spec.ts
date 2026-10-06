import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { addEntry, cleanEntries, historyFor } from './helpers'

// D37 §3.5: the Buy-a-Beer Board for people (S5, S6, S14, S15, S17, S18, S19, S31).

const created: number[] = []
test.afterEach(async () => {
  await cleanEntries(created.splice(0))
})

test.describe('as bartender1', () => {
  test.use({ storageState: authFile('bartender1') })

  test('S5/S31: Taproom → Buy-a-Beer Board; add with no code; persists; no History', async ({ page }) => {
    const name = tempTag('Pat')
    await page.goto('/')
    await page.getByRole('button', { name: 'Taproom' }).click()
    await page.getByRole('button', { name: 'Buy-a-Beer Board' }).click()
    await expect(page).toHaveURL(/\/taproom\/beer-board$/)
    await expect(page.getByTestId('board-tab-history')).toHaveCount(0)

    await page.getByTestId('board-add').click()
    await page.getByTestId('board-recipient').fill(name)
    await page.getByTestId('board-purchaser').fill('Chris')
    await page.getByTestId('board-beers').fill('3')
    await expect(page.getByTestId('board-staff-code')).toHaveCount(0)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/beer_board') && r.request().method() === 'POST')
    await page.getByTestId('board-dialog-submit').click()
    const entry = (await (await saved).json()).data
    created.push(entry.id)
    await expect(page.getByTestId('board-notice')).toHaveText('Added')

    await page.reload()
    await page.getByTestId('board-search').fill(name)
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toContainText('Chris')
    await expect(row).toContainText('3')
    // Moved off today; Imported blank for an entry added by hand (S31).
    const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())
    await expect(row.locator('[data-field=moved_off_board_at]')).toHaveText(today)
    await expect(row.locator('[data-field=imported_at]')).toHaveText('')
  })

  test('S18: one search box matches For or Bought by; columns sort', async ({ page }) => {
    const tag = tempTag('S18')
    const api = await apiAs('bartender1')
    for (const [r, p, n] of [[`${tag} Zed`, 'Chris', 2], [`${tag} Amy`, 'Lee', 5], [`${tag} Chris`, 'Bo', 1]] as const) {
      const res = await api.post('/api/beer_board', { data: { recipient_name: r, purchaser_name: p, beers: n } })
      created.push((await res.json()).data.id)
    }
    await page.goto('/taproom/beer-board')
    await page.getByTestId('board-search').fill(tag)
    await expect(page.getByRole('row')).toHaveCount(4)
    // For, A–Z by default.
    await expect(page.locator('[data-field=recipient_name][role=gridcell]').first()).toHaveText(`${tag} Amy`)

    // "chris" matches Zed (bought by Chris) and Chris (for Chris), not Amy.
    await page.getByTestId('board-search').fill(`${tag.toLowerCase()} `)
    await page.getByTestId('board-search').fill('chris')
    await expect(page.getByRole('gridcell', { name: `${tag} Zed`, exact: true })).toBeVisible()
    await expect(page.getByRole('gridcell', { name: `${tag} Chris`, exact: true })).toBeVisible()
    await expect(page.getByRole('gridcell', { name: `${tag} Amy`, exact: true })).toHaveCount(0)

    // Sort by Beers left, descending.
    await page.getByTestId('board-search').fill(tag)
    await page.getByRole('columnheader', { name: 'Beers left' }).click()
    await page.getByRole('columnheader', { name: 'Beers left' }).click()
    await expect(page.locator('[data-field=recipient_name][role=gridcell]').first()).toHaveText(`${tag} Amy`)
  })

  test('S19: edit the count; delete; both logged under the person', async ({ page }) => {
    const e = await addEntry(2, 'S19')
    created.push(e.id)
    await page.goto('/taproom/beer-board')
    await page.getByTestId('board-search').fill(e.recipient_name)
    await page.getByTestId(`board-menu-${e.id}`).click()
    await page.getByTestId('board-menu-edit').click()
    await expect(page.getByTestId('board-beers')).toHaveValue('2')
    await page.getByTestId('board-beers').fill('5')
    await page.getByTestId('board-dialog-submit').click()
    await expect(page.getByTestId('board-entry-dialog')).toBeHidden()
    await page.reload()
    await page.getByTestId('board-search').fill(e.recipient_name)
    await expect(page.getByRole('row').filter({ hasText: e.recipient_name })).toContainText('5')

    await page.getByTestId(`board-menu-${e.id}`).click()
    await page.getByTestId('board-menu-delete').click()
    await page.getByTestId('board-dialog-submit').click()
    await expect(page.getByTestId('board-delete-dialog')).toBeHidden()
    await page.reload()
    await page.getByTestId('board-search').fill(e.recipient_name)
    await expect(page.getByRole('gridcell', { name: e.recipient_name, exact: true })).toHaveCount(0)

    const h = await historyFor(e.recipient_name)
    expect(h.map((x) => [x.action, x.actor_name, x.on_shared_device])).toEqual([
      ['deleted', 'Sam Pour', false],
      ['edited', 'Sam Pour', false],
      ['created', 'Sam Pour', false],
    ])
  })

  test('S8: redeeming the last beer warns, then removes the entry', async ({ page }) => {
    const e = await addEntry(2, 'S8')
    created.push(e.id)
    await page.goto('/taproom/beer-board')
    await page.getByTestId('board-search').fill(e.recipient_name)
    await page.getByTestId(`board-redeem-${e.id}`).click()
    await expect(page.getByTestId('board-redeem-last')).toHaveCount(0)
    await page.getByTestId('board-redeem-plus').click()
    await expect(page.getByTestId('board-redeem-count')).toHaveText('2')
    await expect(page.getByTestId('board-redeem-plus')).toBeDisabled()
    await expect(page.getByTestId('board-redeem-last')).toContainText('removes the entry')
    await page.getByTestId('board-dialog-submit').click()
    await expect(page.getByTestId('board-notice')).toContainText('entry removed')
    await page.reload()
    await page.getByTestId('board-search').fill(e.recipient_name)
    await expect(page.getByRole('gridcell', { name: e.recipient_name, exact: true })).toHaveCount(0)
  })
})

test('S17: two bartenders on the last beer — the second hears it is gone', async ({ browser }) => {
  const e = await addEntry(1, 'S17')
  created.push(e.id)
  const open = async (persona: 'bartender1' | 'bartender2') => {
    const context = await browser.newContext({ storageState: authFile(persona) })
    const page = await context.newPage()
    await page.goto('/taproom/beer-board')
    await page.getByTestId('board-search').fill(e.recipient_name)
    await page.getByTestId(`board-redeem-${e.id}`).click()
    return { context, page }
  }
  const a = await open('bartender1')
  const b = await open('bartender2')
  await a.page.getByTestId('board-dialog-submit').click()
  await expect(a.page.getByTestId('board-notice')).toContainText('entry removed')
  await b.page.getByTestId('board-dialog-submit').click()
  await expect(b.page.getByTestId('board-dialog-error')).toHaveText('This entry was already removed')
  // The list behind the dialog refreshed.
  await b.page.getByRole('button', { name: 'Cancel' }).click()
  await expect(b.page.getByRole('gridcell', { name: e.recipient_name, exact: true })).toHaveCount(0)
  await a.context.close()
  await b.context.close()
})

test.describe('as barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  test('S6: History names the person and is searchable', async ({ page }) => {
    const e = await addEntry(3, 'S6')
    created.push(e.id)
    await page.goto('/taproom/beer-board')
    await page.getByTestId('board-tab-history').click()
    await page.getByTestId('board-history-search').fill(e.recipient_name)
    const row = page.getByTestId('board-history').getByRole('row').filter({ hasText: e.recipient_name })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Sam Pour')
    await expect(row).toContainText('Added')
  })
})

test.describe('as floater', () => {
  test.use({ storageState: authFile('floater') })

  test('S14: a Taproom + Brewery member has the board', async ({ page }) => {
    await page.goto('/taproom/beer-board')
    await expect(page.getByTestId('board-grid')).toBeVisible()
    await expect(page.getByTestId('board-tab-history')).toHaveCount(0)
  })
})

test.describe('as office1', () => {
  test.use({ storageState: authFile('office1') })

  test('S15: no Taproom nav; the URL goes Home; the API refuses', async ({ page }) => {
    await page.goto('/taproom/beer-board')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Buy-a-Beer Board' })).toHaveCount(0)
    expect((await (await apiAs('office1')).get('/api/beer_board')).status()).toBe(403)
  })
})
