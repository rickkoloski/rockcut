import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptIngredient, adoptParty, adoptProduct, apiAs, categoryId, cleanupIngredients, denverToday, tempTag } from './helpers'

// D63 fix cycle 1 (local QA gap 3): Back to the page of a row just deleted
// there says "not found", on every detail page that deletes its own row. An
// order is cancelled, never deleted. [TEST-TEMP] rows only.

test.afterEach(cleanupIngredients)

async function post<T = { id: number }>(path: string, data: Record<string, unknown>, as: 'owner' | 'breweryMgr' = 'breweryMgr'): Promise<T> {
  const res = await (await apiAs(as)).post(path, { data })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data
}

const WHATS = ['product', 'ingredient', 'batch', 'brand', 'recipe', 'category'] as const
type What = (typeof WHATS)[number]
interface Row {
  id: number
  list: string
  path: string
  api: string
  button: string
  lands: RegExp
  missing: string
}

/** A row of its own, its page and the list that page is opened from. */
async function make(what: What, undo: (() => Promise<unknown>)[]): Promise<Row> {
  const owner = await apiAs('owner')
  if (what === 'category') {
    const c = await post('/api/ingredient_categories', { name: tempTag('D63 cat') }, 'owner')
    undo.push(() => owner.delete(`/api/ingredient_categories/${c.id}`))
    return { id: c.id, list: '/ingredients/categories', path: `/ingredients/categories/${c.id}`, api: `/api/ingredient_categories/${c.id}`, button: 'Delete Category', lands: /\/ingredients\/categories$/, missing: 'category-not-found' }
  }
  if (what === 'ingredient' || what === 'product') {
    const ing = await post('/api/ingredients', { name: tempTag('D63 back'), category_id: await categoryId('yeast') })
    adoptIngredient(ing.id)
    const lands = /\/ingredients(\?category=.*)?$/
    if (what === 'ingredient')
      return { id: ing.id, list: '/ingredients', path: `/ingredients/${ing.id}`, api: `/api/ingredients/${ing.id}`, button: 'Delete Ingredient', lands, missing: 'ingredient-not-found' }
    const lab = await post('/api/parties', { name: tempTag('D63 Labs'), roles: ['manufacturer', 'supplier'] }, 'owner')
    adoptParty(lab.id)
    const p = await post('/api/ingredient_products', { ingredient_id: ing.id, manufacturer_party_id: lab.id, name: tempTag('D63 back'), form: 'Dry', unit: 'each' })
    adoptProduct(p.id)
    return { id: p.id, list: '/ingredients', path: `/ingredients/products/${p.id}`, api: `/api/ingredient_products/${p.id}`, button: 'Delete yeast product', lands, missing: 'product-not-found' }
  }
  const brand = await post('/api/brands', { name: tempTag(`D63 ${what}`) })
  undo.push(() => owner.delete(`/api/brands/${brand.id}`))
  if (what === 'brand')
    return { id: brand.id, list: '/brands', path: `/brands/${brand.id}`, api: `/api/brands/${brand.id}`, button: 'Delete Brand', lands: /\/brands$/, missing: 'brand-not-found' }
  if (what === 'recipe') {
    const r = await post('/api/recipes', { brand_id: brand.id, batch_size: 10, batch_size_unit: 'bbls' })
    return { id: r.id, list: `/brands/${brand.id}`, path: `/brands/${brand.id}/recipes/${r.id}`, api: `/api/recipes/${r.id}`, button: 'Delete Recipe', lands: new RegExp(`/brands/${brand.id}$`), missing: 'recipe-not-found' }
  }
  const b = await post('/api/batches', { brand_id: brand.id, batch_number: tempTag('b'), status: 'fermenting' })
  undo.unshift(() => owner.delete(`/api/batches/${b.id}`))
  return { id: b.id, list: '/batches', path: `/batches/${b.id}`, api: `/api/batches/${b.id}`, button: 'Delete Batch', lands: /\/batches$/, missing: 'batch-not-found' }
}

const entry = (page: Page) => page.evaluate(() => window.history.state?.rockcutBackCloses ?? null)

for (const [size, use] of [
  ['1366 px', { viewport: { width: 1366, height: 768 } }],
  ['360 px', { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true }],
] as const) {
  test.describe(size, () => {
    test.use({ storageState: authFile('breweryMgr'), ...use })
    test.beforeEach(() => test.slow())

    for (const what of WHATS) {
      test(`Back after deleting (${what}) says not found; the page isn't read again on its way out`, async ({ page }) => {
        const undo: (() => Promise<unknown>)[] = []
        try {
          const row = await make(what, undo)
          await page.goto(row.list)
          await page.goto(row.path)
          await page.getByRole('button', { name: row.button }).click()
          const confirm = page.getByRole('dialog')
          if (size === '360 px') await expect.poll(() => entry(page)).not.toBeNull()
          await page.waitForLoadState('networkidle')
          // Every read of the row from the press on, and any "not found" drawn before Back.
          const reads: string[] = []
          page.on('request', (r) => r.method() === 'GET' && new URL(r.url()).pathname === row.api && reads.push(r.url()))
          await page.evaluate((id) => {
            const w = window as unknown as { flashed: boolean }
            w.flashed = false
            new MutationObserver(() => {
              if (document.querySelector(`[data-testid="${id}"]`)) w.flashed = true
            }).observe(document.body, { childList: true, subtree: true })
          }, row.missing)
          const gone = page.waitForResponse((r) => r.request().method() === 'DELETE')
          await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
          expect((await gone).status()).toBe(204)
          await expect(page).toHaveURL(row.lands)
          await expect(confirm).toHaveCount(0)
          expect(await page.evaluate(() => (window as unknown as { flashed: boolean }).flashed)).toBe(false)

          await page.goBack()
          await expect(page).toHaveURL(new RegExp(`${row.path}$`))
          await expect(page.getByTestId(row.missing)).toBeVisible()
          await expect(page.getByRole('button', { name: row.button })).toHaveCount(0)
          // Back's own read, and none on the way out.
          expect(reads).toHaveLength(1)
        } finally {
          for (const f of undo) await f()
        }
      })
    }

    test('a product someone else deletes keeps the open form and what is typed in it', async ({ page }) => {
      const undo: (() => Promise<unknown>)[] = []
      const row = await make('product', undo)
      await page.clock.install()
      await page.goto(row.path)
      await page.getByRole('button', { name: /^Edit/ }).first().click()
      const d = page.getByRole('dialog')
      const notes = d.getByLabel('Notes')
      await notes.fill(`typed ${denverToday()}`)
      expect((await (await apiAs('owner')).delete(row.api)).status()).toBe(204)
      // The page reads it again behind the form (a reconnect, once it's stale) and gets a 404.
      const reread = page.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname === row.api)
      await page.clock.fastForward(31_000)
      await page.context().setOffline(true)
      await page.context().setOffline(false)
      expect((await reread).status()).toBe(404)
      await expect(notes).toHaveValue(`typed ${denverToday()}`)
      const read = page.waitForResponse((r) => r.request().method() === 'PUT')
      await d.getByRole('button', { name: /^(Save|Update)/ }).click()
      expect((await read).status()).toBe(404)
      await expect(d).toBeVisible()
      await expect(notes).toHaveValue(`typed ${denverToday()}`)
      await expect(page.getByTestId(row.missing)).toHaveCount(0)
    })
  })
}
