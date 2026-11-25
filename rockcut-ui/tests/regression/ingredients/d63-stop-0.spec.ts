import { test, expect, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptIngredient, adoptParty, adoptProduct, apiAs, categoryId, cleanupIngredients, denverToday, expectPhoneDialogClosed, makeD65Ingredient, makeOrder, openDialog, tempTag } from './helpers'
import { stepOf, type SBatch } from '../production/schedule'
import { addCount, fillHarvest, history, Yeast, yeastProduct } from '../production/yeast'

// D63 Stop 0, the D64 carry-ins: 6260 (phone Back on ConfirmDialog, at 360 px),
// 6261 (voided records with no entries in brink History) and 6262 (the order
// page's per-unit words). The Idea Board card's confirms are in
// regression/ideas/boards-scenarios.spec.ts. Lean; [TEST-TEMP] rows only.

test.use({ storageState: authFile('brewer1') })

const yeast = new Yeast({ lean: true })
test.afterEach(async () => {
  await yeast.cleanup()
  await cleanupIngredients()
})

async function post<T = { id: number }>(path: string, data: Record<string, unknown>, as: 'owner' | 'breweryMgr' | 'brewer1' = 'brewer1'): Promise<T> {
  const res = await (await apiAs(as)).post(path, { data })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data
}

async function harvest(b: SBatch, step: string, brinkId: number, lb: string, extra: Record<string, unknown> = {}) {
  const s = stepOf(b, step)
  const us05 = await yeastProduct('US-05')
  const res = await (await apiAs('brewer1')).post(`/api/production/steps/${s.id}/complete`, {
    data: { done_on: s.due_on, yeast_outcome: 'harvested', yeast_brink_id: brinkId, yeast_lb: lb, yeast_product_ids: [us05.id], yeast_generation: 1, ...extra },
  })
  expect(res.status(), await res.text()).toBe(200)
  return s
}

const uncheck = async (stepId: number) => expect((await (await apiAs('brewer1')).post(`/api/production/steps/${stepId}/uncomplete`)).status()).toBe(200)

/** From Home, so a Back that leaks out of the dialog really leaves the page. */
async function from(page: Page, path: string) {
  await page.goto('/')
  await page.goto(path)
}

async function action(page: Page, id: number, which: string, dialog: string) {
  await from(page, '/ingredients/brinks')
  await page.getByTestId(`brink-actions-${id}`).click()
  await page.getByTestId(`brink-action-${which}`).click()
  const d = page.getByTestId(dialog)
  await expect(d).toBeVisible()
  return d
}

async function backClosesIt(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.history.state?.rockcutBackCloses != null)).toBe(true)
  const url = page.url()
  await page.goBack()
  await expect(dialog).toHaveCount(0)
  expect(page.url()).toBe(url)
}

/** A [TEST-TEMP] yeast with `form`'s offer. */
async function tempYeast(form: 'Dry' | 'Liquid', labId: number) {
  const strain = await makeD65Ingredient(`D63 ${form}`, 'yeast')
  const product = await post('/api/ingredient_products', { ingredient_id: strain.id, manufacturer_party_id: labId, name: tempTag(form), form, unit: 'each', ...(form === 'Liquid' ? { features: { pitch_bbl: '7' } } : {}) })
  adoptProduct(product.id)
  const pack = form === 'Dry' ? 'brick' : 'pitchable'
  const offer = await post('/api/supplier_offers', { product_id: product.id, supplier_party_id: labId, pack_name: pack, pack_size: '1' })
  await post(`/api/supplier_offers/${offer.id}/prices`, { price_per_pack: '10.00', effective_on: '2020-01-01' })
  return { product, offer, pack }
}

async function tempLab() {
  const lab = await post<{ id: number; name: string }>('/api/parties', { name: tempTag('D63 Labs'), roles: ['manufacturer', 'supplier'] }, 'owner')
  adoptParty(lab.id)
  return lab
}

test.describe('6260: phone Back at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })
  test.beforeEach(() => test.slow())

  test('Dump brink and Mark clean close; nothing is saved and the next Back leaves', async ({ page }) => {
    const tb = await yeast.brink('YB-back')
    const a = await yeast.brewed('Galactic')
    await harvest(a, 'Yeast harvest', tb.id, '20')
    await backClosesIt(page, await action(page, tb.id, 'dump', 'brink-dump-dialog'))
    expect((await history(tb.id))[0].entries.map((e) => e.kind)).toEqual(['harvested'])
    // Nothing left behind: one more Back leaves.
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)

    expect((await (await apiAs('brewer1')).post(`/api/yeast/brinks/${tb.id}/dump`, { data: { occurred_on: denverToday() } })).ok()).toBe(true)
    await backClosesIt(page, await action(page, tb.id, 'clean', 'brink-clean-dialog'))
    await expect(page.getByTestId(`brink-actions-${tb.id}`)).toBeVisible()
  })

  test('from Brink History, Back closes Remove and Delete count only; the next closes History', async ({ page }) => {
    const tb = await yeast.brink('YB-nest')
    const [a, b] = [await yeast.brewed('Galactic'), await yeast.brewed('Enos')]
    await harvest(a, 'Yeast harvest', tb.id, '20')
    await addCount(tb.id)
    const count = (await history(tb.id))[0].counts[0].id
    const h = await action(page, tb.id, 'history', 'brink-history-dialog')
    await h.getByTestId(`brink-history-count-delete-${count}`).click()
    await backClosesIt(page, page.getByTestId('brink-history-count-confirm'))
    await expect(h).toBeVisible()

    expect((await (await apiAs('brewer1')).post(`/api/yeast/brinks/${tb.id}/pitch`, { data: { occurred_on: denverToday(), lb: '1', batch_id: b.id } })).ok()).toBe(true)
    const pitch = (await history(tb.id))[0].entries.find((e) => e.kind === 'pitched')!
    const again = await action(page, tb.id, 'history', 'brink-history-dialog')
    await again.getByTestId(`brink-history-remove-${pitch.id}`).click()
    await backClosesIt(page, page.getByTestId('brink-history-remove-confirm'))
    await expect(again).toBeVisible()
    await backClosesIt(page, again)
    expect((await history(tb.id))[0].entries.map((e) => e.kind)).toContain('pitched')
  })

  test('while Remove is in flight Back does nothing; it still closes when the answer comes, and History closes next', async ({ page }) => {
    const tb = await yeast.brink('YB-busy')
    const [a, b] = [await yeast.brewed('Galactic'), await yeast.brewed('Enos')]
    await harvest(a, 'Yeast harvest', tb.id, '20')
    expect((await (await apiAs('brewer1')).post(`/api/yeast/brinks/${tb.id}/pitch`, { data: { occurred_on: denverToday(), lb: '1', batch_id: b.id } })).ok()).toBe(true)
    const pitch = (await history(tb.id))[0].entries.find((e) => e.kind === 'pitched')!
    const h = await action(page, tb.id, 'history', 'brink-history-dialog')
    await h.getByTestId(`brink-history-remove-${pitch.id}`).click()
    const confirm = page.getByTestId('brink-history-remove-confirm')
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(`**/api/yeast/entries/${pitch.id}`, async (route) => {
      await held
      await route.continue()
    })
    await confirm.getByRole('button', { name: 'Remove' }).click()
    await expect(confirm.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-busy', 'true')
    for (let i = 0; i < 2; i++) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.addEventListener('popstate', () => resolve(), { once: true })
            window.history.back()
          }),
      )
      await expect(confirm).toBeVisible()
      await expect(h).toBeVisible()
    }
    release()
    await expect(confirm).toHaveCount(0)
    await expect(h).toBeVisible()
    await expect(h.getByTestId(`brink-history-entry-${pitch.id}`)).toHaveCount(0)
    await backClosesIt(page, h)
    await expectPhoneDialogClosed(page, h)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })

  test('Remove pitch on the batch page closes; the pitch stays', async ({ page }) => {
    const lab = await tempLab()
    const { product } = await tempYeast('Dry', lab.id)
    await post('/api/ingredient_lots', { product_id: product.id, supplier_party_id: lab.id, pack_name: 'brick', pack_size: '1', lot_number: tempTag('lot'), received_date: denverToday(), initial_kind: 'opening', initial_quantity: '6' })
    const a = await yeast.brewed('Galactic')
    const [pitch] = await post<{ id: number }[]>(`/api/ingredient_products/${product.id}/pitch`, { batch_id: a.id, quantity: '2', occurred_on: denverToday() })
    await from(page, `/batches/${a.id}`)
    await page.getByTestId(`batch-yeast-remove-${pitch.id}`).click()
    await backClosesIt(page, page.getByTestId('remove-pitch-confirm'))
    await expect(page.getByTestId(`batch-yeast-remove-${pitch.id}`)).toBeVisible()
    expect((await (await apiAs('brewer1')).delete(`/api/yeast/pitches/${pitch.id}`)).ok()).toBe(true)
  })

  test('the second answer ("This brink is empty") is never run by Back', async ({ page }) => {
    const tb = await yeast.brink('YB-answer')
    const a = await yeast.brewed('Galactic')
    await harvest(a, 'Yeast harvest', tb.id, '20')
    const s = stepOf(a, 'Yeast harvest - #2')
    const sent: string[] = []
    page.on('request', (r) => r.url().endsWith(`/steps/${s.id}/complete`) && sent.push(r.url()))
    await from(page, `/brewery/production?step=${s.id}&day=${s.due_on}`)
    await page.getByTestId('step-done-on').fill(s.due_on)
    await page.getByTestId('step-check-off').click()
    const d = page.getByTestId('harvest-dialog')
    const picked = (await d.getByTestId('harvest-strains').innerText()).includes('US-05')
    await fillHarvest(page, { brinkId: tb.id, lb: '5', ...(picked ? {} : { strainId: (await yeastProduct('US-05')).id }) })
    await d.getByTestId('harvest-generation').fill('1')
    await d.getByRole('button', { name: 'Save' }).click()
    const question = page.getByTestId('harvest-question-has-yeast')
    await expect(question).toBeVisible()
    const before = sent.length
    await backClosesIt(page, question)
    await expect(d).toBeVisible()
    expect(sent.length).toBe(before)
    expect((await history(tb.id))[0].entries).toHaveLength(1)
  })

  // Every confirm on a page of its own that deletes it and goes to the list.
  const NAV = ['batch', 'brand', 'recipe', 'ingredient', 'product', 'category'] as const
  for (const what of NAV) {
    test(`as breweryMgr: deleting (${what}) lands where it should and stays there`, async ({ browser }) => {
      const brands: number[] = []
      const categories: number[] = []
      const owner = await apiAs('owner')
      const ctx = await browser.newContext({ storageState: authFile('breweryMgr'), viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })
      const page = await ctx.newPage()
      try {
        let path = ''
        let button = ''
        let lands = /./
        if (what === 'batch' || what === 'brand' || what === 'recipe') {
          const brand = await post('/api/brands', { name: tempTag(`D63 ${what}`) }, 'breweryMgr')
          brands.push(brand.id)
          if (what === 'brand') [path, button, lands] = [`/brands/${brand.id}`, 'Delete Brand', /\/brands$/]
          else if (what === 'recipe') {
            const r = await post('/api/recipes', { brand_id: brand.id, batch_size: 10, batch_size_unit: 'bbls' }, 'breweryMgr')
            ;[path, button, lands] = [`/brands/${brand.id}/recipes/${r.id}`, 'Delete Recipe', new RegExp(`/brands/${brand.id}$`)]
          } else {
            const b = await post('/api/batches', { brand_id: brand.id, batch_number: tempTag('b'), status: 'fermenting' }, 'breweryMgr')
            ;[path, button, lands] = [`/batches/${b.id}`, 'Delete Batch', /\/batches$/]
          }
        } else if (what === 'category') {
          const c = await post('/api/ingredient_categories', { name: tempTag('D63 cat') }, 'owner')
          categories.push(c.id)
          ;[path, button, lands] = [`/ingredients/categories/${c.id}`, 'Delete Category', /\/ingredients\/categories$/]
        } else {
          const ing = await post('/api/ingredients', { name: tempTag('D63 nav'), category_id: await categoryId('yeast') })
          adoptIngredient(ing.id)
          if (what === 'ingredient') [path, button, lands] = [`/ingredients/${ing.id}`, 'Delete Ingredient', /\/ingredients(\?category=.*)?$/]
          else {
            const lab = await tempLab()
            const p = await post('/api/ingredient_products', { ingredient_id: ing.id, manufacturer_party_id: lab.id, name: tempTag('D63 nav'), form: 'Dry', unit: 'each' })
            adoptProduct(p.id)
            ;[path, button, lands] = [`/ingredients/products/${p.id}`, 'Delete yeast product', /\/ingredients(\?category=.*)?$/]
          }
        }
        await from(page, path)
        await page.getByRole('button', { name: button }).click()
        const confirm = page.getByRole('dialog')
        await backClosesIt(page, confirm)
        await page.getByRole('button', { name: button }).click()
        await expect.poll(() => page.evaluate(() => window.history.state?.rockcutBackCloses != null)).toBe(true)
        const gone = page.waitForResponse((r) => r.request().method() === 'DELETE')
        await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
        expect((await gone).status()).toBe(204)
        await expect(page).toHaveURL(lands)
        await expect(confirm).toHaveCount(0)
        // Still there once any late history.back() would have landed.
        await page.waitForLoadState('networkidle')
        await expect(page).toHaveURL(lands)
        expect(await page.evaluate(() => window.history.state?.rockcutBackCloses ?? null)).toBeNull()
      } finally {
        await ctx.close()
        for (const id of brands) await owner.delete(`/api/brands/${id}`)
        for (const id of categories) await owner.delete(`/api/ingredient_categories/${id}`)
      }
    })
  }
})

test('6261: an undone harvest leaves no empty Voided row in History', async ({ page }) => {
  const tb = await yeast.brink('YB-void')
  const a = await yeast.brewed('Galactic')
  const s = await harvest(a, 'Yeast harvest', tb.id, '20')
  await uncheck(s.id)
  const h = await action(page, tb.id, 'history', 'brink-history-dialog')
  await expect(h.getByText('Nothing yet')).toBeVisible()
  await expect(h.getByText('Voided')).toHaveCount(0)
})

test('6262: the order page and New order say "20 bricks" and "12 pitchables"', async ({ page }) => {
  const lab = await tempLab()
  const dry = await tempYeast('Dry', lab.id)
  const liquid = await tempYeast('Liquid', lab.id)
  const order = await makeOrder(lab.id, [{ offerId: dry.offer.id, packs: 20 }, { offerId: liquid.offer.id, packs: 12 }])
  await page.goto(`/ingredients/orders/${order.id}`)
  const words = '32 packs · 20 bricks · 12 pitchables · $320.00'
  await expect(page.getByTestId('order-totals')).toHaveText(words)
  // The same words as the order dialog's running total.
  const d = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
  await expect(d.getByText(words)).toBeVisible()
})
