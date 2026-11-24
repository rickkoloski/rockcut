import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, expectNoSidewaysScroll, openDialog, tempTag } from './helpers'

// D64 Stop 2 (spec §6.3, §6.5, A7): the Brinks tab beside Strains, and Yeast
// settings → Brinks (managers add, edit, retire, restore and delete; brewers
// read). Harvests have no screen until Stop 3, so the stock actions are the
// API's tests (`d64_stop2_test.exs`) and the Stop 2 browser check. A brink a
// test adds is `[TEST-TEMP]` and deleted by id; the seeded YB1–YB4 are only read.

test.use({ storageState: authFile('brewer1') })

const made = new Set<number>()
test.afterAll(async () => {
  const mgr = await apiAs('breweryMgr')
  for (const id of made) await mgr.delete(`/api/yeast/brinks/${id}`).catch(() => null)
})

async function yeastId(): Promise<number> {
  const cats = (await (await (await apiAs('brewer1')).get('/api/ingredient_categories')).json()).data as { id: number; key: string | null }[]
  return cats.find((c) => c.key === 'yeast')!.id
}

test('the Brinks tab sits beside Strains and lists YB1–YB4 with their state and actions', async ({ page }) => {
  await page.goto(`/ingredients?category=${await yeastId()}`)
  await page.getByTestId('yeast-tab-brinks').click()
  await expect(page).toHaveURL(/\/ingredients\/brinks$/)
  const table = page.getByTestId('brinks-table')
  for (const name of ['YB1', 'YB2', 'YB3', 'YB4']) await expect(table).toContainText(name)

  // An empty brink offers History; Pitch, Add count, Adjust weight and Dump need yeast.
  const brinks = (await (await (await apiAs('brewer1')).get('/api/yeast/brinks')).json()).data as { id: number; name: string; yeast: unknown; dirty: boolean }[]
  const empty = brinks.find((b) => !b.yeast && !b.dirty)
  if (empty) {
    await page.getByTestId(`brink-actions-${empty.id}`).click()
    await expect(page.getByTestId('brink-action-pitch')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('brink-action-clean')).toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('brink-action-history').click()
    const history = page.getByTestId('brink-history-dialog')
    await expect(history).toBeVisible()
    await history.getByRole('button', { name: 'Close' }).click()
    await expect(history).toHaveCount(0)
  }

  await page.getByTestId('yeast-tab-strains').click()
  await expect(page.getByTestId('products-table')).toContainText('US-05')
})

test('Yeast settings → Brinks: a manager adds one with an empty weight, edits, retires, restores and deletes it', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('breweryMgr') })
  const page = await ctx.newPage()
  await page.goto('/ingredients/brinks')
  await page.getByTestId('brinks-settings').click()
  await page.getByTestId('brinks-settings-yeast').click()
  const s = page.getByTestId('brink-settings')
  await expect(s).toContainText('YB2')

  const name = tempTag('YB')
  const add = await openDialog(page, s.getByTestId('brink-add'), 'brink-setting-dialog')
  await add.getByTestId('brink-setting-name').fill(name)
  await add.getByTestId('brink-setting-weight').fill('150')
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/yeast/brinks'))
  await add.getByRole('button', { name: 'Save' }).click()
  const brink = (await (await created).json()).data as { id: number }
  made.add(brink.id)
  const row = s.getByTestId(`brink-setting-${brink.id}`)
  await expect(row).toContainText('150 lb')

  // The same name in another case is refused.
  const dup = await openDialog(page, s.getByTestId('brink-add'), 'brink-setting-dialog')
  await dup.getByTestId('brink-setting-name').fill(name.toLowerCase())
  await dup.getByRole('button', { name: 'Save' }).click()
  await expect(dup).toContainText("There's already a brink with that name")
  await dup.getByRole('button', { name: 'Cancel' }).click()

  const edit = await openDialog(page, s.getByTestId(`brink-setting-${brink.id}-edit`), 'brink-setting-dialog')
  await edit.getByTestId('brink-setting-weight').fill('148.5')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('148.5 lb')

  await s.getByTestId(`brink-setting-${brink.id}-active`).click()
  await expect(row).toContainText('Retired')
  await s.getByTestId(`brink-setting-${brink.id}-active`).click()
  await expect(row).not.toContainText('Retired')

  // YB2 and the others with history can't be deleted.
  await s.getByTestId(`brink-setting-${brink.id}-delete`).click()
  await page.getByRole('dialog', { name: 'Delete brink' }).getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)
  made.delete(brink.id)
  await ctx.close()
})

test('a brewer sees the brink settings read-only', async ({ page }) => {
  await page.goto('/ingredients/brinks')
  await page.getByTestId('brinks-settings').click()
  await page.getByTestId('brinks-settings-yeast').click()
  await expect(page.getByTestId('brinks-read-only')).toHaveText('Only Brewery managers and owners change these.')
  await expect(page.getByTestId('brink-add')).toHaveCount(0)
  await expect(page.getByTestId('brink-settings').getByRole('button', { name: /^Edit|^Delete/ })).toHaveCount(0)
})

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test('the Brinks tab is cards with no sideways scroll', async ({ page }) => {
    await page.goto('/ingredients/brinks')
    await expect(page.getByTestId('brinks-cards')).toContainText('YB2')
    await expectNoSidewaysScroll(page)
  })
})
