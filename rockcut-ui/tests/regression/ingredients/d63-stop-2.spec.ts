import { test, expect, type Browser, type Locator, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import {
  addDays,
  adoptParty,
  adoptProduct,
  apiAs,
  categoryId,
  cleanupIngredients,
  denverToday,
  expectNoSidewaysScroll,
  expectPhoneDialogClosed,
  lotsOf,
  makeHopProduct,
  makeLot,
  makeOrder,
  makeProduct,
  movementsOf,
  openDialog,
  pick,
  saveProduct,
  setQuantityDisplay,
  tempTag,
  type ApiLot,
  type ApiProduct,
} from './helpers'

// D63 Stop 2 (spec §4, §12 "Use order"): which hop lot is used next. Every hop,
// product and lot is the test's own [TEST-TEMP] one.

test.use({ storageState: authFile('brewer1') })

async function setHide(persona: PersonaKey, hide: boolean) {
  expect((await (await apiAs(persona)).put('/api/me/board_settings/ingredients', { data: { hide_used_up_lots: hide } })).status()).toBe(200)
}

test.beforeEach(async () => {
  for (const who of ['brewer1', 'brewer2'] as const) {
    await setQuantityDisplay(who, 'packs')
    await setHide(who, true)
  }
})
test.afterAll(cleanupIngredients)

// ── The hop: two makers' T90 of one variety, and lots A, B (the other maker's), C, oldest first ──

interface Hop {
  id: number
  a: ApiProduct
  b: ApiProduct
  company: { id: number; name: string }
  other: { id: number; name: string }
  lots: ApiLot[]
}

async function hopProduct(hopId: number, makerId: number, form = 'T90 Pellet'): Promise<ApiProduct> {
  const res = await (await apiAs('brewer1')).post('/api/ingredient_products', { data: { ingredient_id: hopId, manufacturer_party_id: makerId, form } })
  expect(res.status(), await res.text()).toBe(201)
  const product = (await res.json()).data as ApiProduct
  adoptProduct(product.id)
  return product
}

async function lotOf(product: ApiProduct, label: string, daysAgo: number, lb = '11', supplier: number | null = null): Promise<ApiLot> {
  const res = await (await apiAs('brewer1')).post('/api/ingredient_lots', {
    data: {
      product_id: product.id,
      supplier_party_id: supplier,
      lot_number: tempTag(label),
      crop_year: 2025,
      received_date: addDays(denverToday(), -daysAgo),
      initial_kind: 'opening',
      initial_quantity: lb,
      features: { alpha_acid_pct: '12.5' },
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data as ApiLot
}

async function makeHop(label: string): Promise<Hop> {
  const a = await makeHopProduct(`D63 ${label}`)
  const id = a.ingredient!.id
  const party = await (await apiAs('owner')).post('/api/parties', { data: { name: tempTag(`D63 ${label} other co`), roles: ['manufacturer', 'supplier'] } })
  expect(party.status()).toBe(201)
  const other = (await party.json()).data as { id: number; name: string }
  adoptParty(other.id)
  const b = await hopProduct(id, other.id)
  const lots = [await lotOf(a, 'A', 30, '11', a.company.id), await lotOf(b, 'B', 20), await lotOf(a, 'C', 10, '11', a.company.id)]
  return { id, a, b, company: a.company, other, lots }
}

interface UseList {
  form: string
  version: string
  lots: { id: number; on_hand: string }[]
}
const listsOf = async (hopId: number): Promise<UseList[]> => {
  const res = await (await apiAs('brewer1')).get('/api/hop_use_lists', { params: { ingredient_id: hopId } })
  expect(res.status()).toBe(200)
  return (await res.json()).data
}
/** The shown lots' ids in the T90 list, as the API has them. */
const order = async (hopId: number) => (await listsOf(hopId)).find((l) => l.form === 'T90 Pellet')!.lots.filter((l) => Number(l.on_hand) > 0).map((l) => l.id)
async function putOrder(hopId: number, ids: number[], persona: PersonaKey = 'brewer2') {
  const [list] = await listsOf(hopId)
  const res = await (await apiAs(persona)).put('/api/hop_use_lists/order', { data: { ingredient_id: hopId, form: list.form, lot_ids: ids, version: list.version } })
  expect(res.status(), await res.text()).toBe(200)
}

const LIST = 'use-order-t90-pellet'
const rows = (page: Page) => page.locator(`[data-testid^="${LIST}-row-"]`)
const shown = (page: Page) => rows(page).evaluateAll((els, p) => els.map((e) => Number(e.getAttribute('data-testid')!.slice(p.length))), `${LIST}-row-`)
const row = (page: Page, id: number) => page.getByTestId(`${LIST}-row-${id}`)
const handle = (page: Page, id: number) => page.getByTestId(`${LIST}-handle-${id}`)
const inUse = (page: Page, id: number) => page.getByTestId(`use-order-in-use-${id}`)
const up = (page: Page, id: number) => page.getByTestId(`${LIST}-up-${id}`)
const down = (page: Page, id: number) => page.getByTestId(`${LIST}-down-${id}`)

async function open(page: Page, hop: Hop) {
  await page.goto(`/ingredients/${hop.id}`)
  await expect(page.getByTestId('use-order')).toBeVisible()
  await expect(page.getByTestId(`${LIST}-section`)).toBeVisible()
}

const expectShown = (page: Page, ids: number[]) => expect.poll(() => shown(page)).toEqual(ids)
const expectOrder = (hop: Hop, ids: number[]) => expect.poll(() => order(hop.id)).toEqual(ids)

/** Drag by the handle to the top half of `onto` (as tanks.spec). */
async function dragAbove(page: Page, id: number, onto: number) {
  await handle(page, id).scrollIntoViewIfNeeded()
  const from = (await handle(page, id).boundingBox())!
  const to = (await row(page, onto).boundingBox())!
  const x = from.x + from.width / 2
  await page.mouse.move(x, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, from.y + from.height / 2 - 15, { steps: 5 })
  await page.mouse.move(x, to.y + to.height / 4, { steps: 25 })
  await page.mouse.up()
}

/** Long-press the handle (the shared layer's 250 ms), then slide it onto `onto`. */
async function touchAbove(page: Page, id: number, onto: number) {
  await handle(page, id).scrollIntoViewIfNeeded()
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })) })
  const from = (await handle(page, id).boundingBox())!
  const to = (await row(page, onto).boundingBox())!
  const [x, y0, y1] = [from.x + from.width / 2, from.y + from.height / 2, to.y + to.height / 4]
  await touch('touchStart', [[x, y0]])
  await page.waitForTimeout(400)
  for (let i = 1; i <= 15; i++) await touch('touchMove', [[x, y0 + ((y1 - y0) * i) / 15]])
  await page.waitForTimeout(100)
  await touch('touchEnd', [])
}

async function as(browser: Browser, persona: PersonaKey, viewport?: { width: number; height: number }): Promise<Page> {
  return (await browser.newContext({ storageState: authFile(persona), ...(viewport ? { viewport } : {}) })).newPage()
}

const ids = (hop: Hop) => hop.lots.map((l) => l.id)
const useLot = async (lot: ApiLot, lb: string) =>
  expect((await (await apiAs('brewer1')).post('/api/inventory_movements', { data: { kind: 'used', quantity: lb, occurred_on: denverToday(), lot_id: lot.id } })).status()).toBe(201)
const expire = async (lot: ApiLot) => expect((await (await apiAs('brewer1')).put(`/api/ingredient_lots/${lot.id}`, { data: { status: 'expired' } })).status()).toBe(200)
const save = (d: Locator) => d.getByRole('button', { name: /^Save/ }).click()

test.describe('the list', () => {
  test('in order across makers; drag the third to the top, reload: still first and In use; brewer2 sees the same', async ({ page, browser }) => {
    const hop = await makeHop('drag')
    const [a, b, c] = ids(hop)
    await open(page, hop)
    await expectShown(page, [a, b, c])
    await expect(page.getByTestId('use-order')).toContainText('Brewing takes the first lot with stock. New lots go to the end.')
    await expect(row(page, a)).toContainText(hop.company.name)
    await expect(row(page, b)).toContainText(hop.other.name)
    await expect(row(page, a)).toContainText('2025 · 12.50% AA · 1 box')
    await expect(page.getByTestId(`use-order-place-${c}`)).toHaveText('3')
    await expect(inUse(page, a)).toBeVisible()

    await dragAbove(page, c, a)
    await expectShown(page, [c, a, b])
    await expect(inUse(page, c)).toBeVisible()
    await expect(page.getByTestId(`use-order-place-${c}`)).toHaveText('1')
    await expectOrder(hop, [c, a, b])
    await page.reload()
    await expectShown(page, [c, a, b])
    await expect(page.locator('[data-testid^="use-order-in-use-"]')).toHaveCount(1)
    await expect(inUse(page, c)).toBeVisible()

    const second = await as(browser, 'brewer2')
    await open(second, hop)
    await expectShown(second, [c, a, b])
    await second.context().close()

    // The lot # goes to its product; the total display is the person's.
    await page.getByTestId('use-order').getByTestId('quantity-toggle-lb').click()
    await expect(row(page, a)).toContainText('11 lb')
    await row(page, b).getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/ingredients/products/${hop.b.id}$`))
  })

  test('the keyboard and the arrows each save a move; the ends are disabled', async ({ page }) => {
    const hop = await makeHop('keys')
    const [a, b, c] = ids(hop)
    await open(page, hop)
    await expect(up(page, a)).toBeDisabled()
    await expect(down(page, c)).toBeDisabled()
    await up(page, c).click()
    await expectShown(page, [a, c, b])
    await expectOrder(hop, [a, c, b])
    await down(page, a).click()
    await expectOrder(hop, [c, a, b])

    await handle(page, b).focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(250)
    await page.keyboard.press('Space')
    await expectShown(page, [c, b, a])
    await expectOrder(hop, [c, b, a])
  })

  test('T90 and Cryo are two lists; moving one leaves the other', async ({ page }) => {
    const hop = await makeHop('forms')
    const [a, b, c] = ids(hop)
    const cryo = await hopProduct(hop.id, hop.company.id, 'Cryo')
    const [x, y] = [await lotOf(cryo, 'X', 5), await lotOf(cryo, 'Y', 4)]
    await open(page, hop)
    await expect(page.getByTestId('use-order').getByRole('heading', { level: 6 })).toHaveCount(3)
    await page.getByTestId(`use-order-cryo-up-${y.id}`).click()
    await expect.poll(async () => (await listsOf(hop.id)).map((l) => [l.form, ...l.lots.map((z) => z.id)])).toEqual([
      ['T90 Pellet', a, b, c],
      ['Cryo', y.id, x.id],
    ])
    await expectShown(page, [a, b, c])
  })

  test('a lot added goes to the end; receiving into an existing lot moves nothing', async ({ page }) => {
    const hop = await makeHop('add')
    const [a, b, c] = ids(hop)
    await putOrder(hop.id, [c, b, a])
    await page.goto(`/ingredients/products/${hop.a.id}`)
    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await d.getByTestId('lot-number').fill(tempTag('NEW'))
    await d.getByTestId('lot-crop-year').fill('2026')
    await d.getByLabel(/Alpha/).first().fill('12')
    await d.getByTestId('lot-quantity-packs').fill('1')
    await save(d)
    await expect(d).toHaveCount(0)
    const added = (await lotsOf(hop.a.id)).find((l) => l.lot_number?.includes('NEW'))!
    await expectOrder(hop, [c, b, a, added.id])

    const offer = hop.a.offers[0]
    const api = await apiAs('brewer1')
    expect((await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_pack: '100', effective_on: '2020-01-01' } })).status()).toBe(201)
    const o = await makeOrder(hop.company.id, [{ offerId: offer.id, packs: 1 }])
    const received = await api.post(`/api/purchase_orders/${o.id}/receive`, {
      data: { received_on: denverToday(), lines: [{ id: o.lines[0].id, packs_received: 1, allocations: [{ lot_id: a, packs: 1 }] }] },
    })
    expect(received.status(), await received.text()).toBe(200)
    await open(page, hop)
    await expectShown(page, [c, b, a, added.id])
    await expect(row(page, a)).toContainText('2 boxes')
  })

  test("a product moved to another hop takes its lots to that hop's list", async ({ page }) => {
    const hop = await makeHop('from')
    const to = await makeHop('to')
    const third = await hopProduct(hop.id, (await makeHop('third')).company.id)
    const lot = await lotOf(third, 'T', 1)
    expect((await saveProduct(third.id, { ingredient_id: to.id })).status()).toBe(200)
    await open(page, to)
    await expectShown(page, [...ids(to), lot.id])
    await expectOrder(hop, ids(hop))
  })
})

test.describe('using and counting', () => {
  test('Record movement: In use order by default, from this maker, spilling to its next lot; a lot by hand still works', async ({ page }) => {
    const hop = await makeHop('use')
    const [a, b, c] = ids(hop)
    await putOrder(hop.id, [b, c, a])
    await page.goto(`/ingredients/products/${hop.a.id}`)
    let d = await openDialog(page, page.getByTestId('product-record-movement'), 'movement-dialog')
    await expect(d.getByTestId('movement-lot')).toContainText('In use order')
    await expect(d).toContainText("From this product's lots in use order, skipping expired lots")
    await expect(d).not.toContainText(/oldest/i)
    await d.getByRole('combobox', { name: 'Lot' }).click()
    const options = await page.getByRole('option').allTextContents()
    expect(options[0]).toBe('In use order')
    expect(options[1]).toContain(hop.lots[2].lot_number!)
    expect(options[2]).toContain(hop.lots[0].lot_number!)
    expect(options).toHaveLength(3)
    await page.keyboard.press('Escape')
    await d.getByTestId('movement-quantity-packs').fill('1')
    await d.getByTestId('movement-quantity-lb').fill('3')
    await save(d)
    await expect(d).toHaveCount(0)
    const used = (await movementsOf(hop.a.id)).filter((m) => m.kind === 'used')
    expect(used.map((m) => [m.lot_id, Number(m.quantity)]).sort()).toEqual([[a, -3], [c, -11]].sort())

    d = await openDialog(page, page.getByTestId('product-record-movement'), 'movement-dialog')
    await pick(page, d, 'Lot', new RegExp(hop.lots[0].lot_number!.replace(/[[\]]/g, '\\$&')))
    await d.getByTestId('movement-quantity-lb').fill('2')
    await save(d)
    await expect(d).toHaveCount(0)
    expect(Number((await lotsOf(hop.a.id)).find((l) => l.id === a)!.on_hand)).toBe(6)
  })

  test('Count: 1 lb short comes off the first in use order; 1 lb over goes onto the newest, which is first too', async ({ page }) => {
    const hop = await makeHop('count')
    const [a, b, c] = ids(hop)
    await putOrder(hop.id, [c, b, a])
    await setQuantityDisplay('brewer1', 'lb')
    await page.goto(`/ingredients/products/${hop.a.id}`)
    const lb = async (id: number) => Number((await lotsOf(hop.a.id)).find((l) => l.id === id)!.on_hand)
    for (const [counted, left] of [['21', [11, 10]], ['9', [9, 0]]] as const) {
      const d = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
      await expect(d).toContainText("Short: off this product's lots in use order, skipping expired lots. Over: onto the newest lot.")
      await d.getByTestId('count-total-lb').fill(counted)
      await save(d)
      await expect(d).toHaveCount(0)
      expect([await lb(a), await lb(c)]).toEqual(left)
    }
    await putOrder(hop.id, [b, a])
    // C (the newest) is empty and first in the list; the extra goes onto it.
    const d = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
    await d.getByTestId('count-total-lb').fill('10')
    await save(d)
    await expect(d).toHaveCount(0)
    expect([await lb(a), await lb(c)]).toEqual([9, 1])
  })

  test('Expire the first: Expired chip, and the next reads In use; the lot dialog says the use order skips it', async ({ page }) => {
    const hop = await makeHop('expire')
    const [a, b, c] = ids(hop)
    await page.goto(`/ingredients/products/${hop.a.id}`)
    const d = await openDialog(page, page.getByTestId('product-lots').getByText(hop.lots[0].lot_number!), 'grain-lot-dialog')
    await expect(d).toContainText('the use order skips it')
    await d.getByTestId('lot-expired').click()
    await save(d)
    await expect(d).toHaveCount(0)
    await open(page, hop)
    await expectShown(page, [a, b, c])
    await expect(row(page, a)).toContainText('Expired')
    await expect(inUse(page, a)).toHaveCount(0)
    await expect(inUse(page, b)).toBeVisible()
  })

  test('a grain still says Oldest first, and takes the oldest', async ({ page }) => {
    const grain = await makeProduct('D63 grain')
    const newer = await makeLot(grain, 2, 2)
    const older = await makeLot(grain, 2, 20)
    await page.goto(`/ingredients/products/${grain.id}`)
    let d = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
    await expect(d).toContainText("Short: off the oldest lots that aren't expired. Over: onto the newest lot.")
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expect(d).toHaveCount(0)
    d = await openDialog(page, page.getByTestId('product-record-movement'), 'movement-dialog')
    await expect(d.getByTestId('movement-lot')).toContainText('Oldest first')
    await expect(d).toContainText('From the oldest lots first, skipping expired lots')
    await d.getByTestId('movement-quantity-packs').fill('3')
    await save(d)
    await expect(d).toHaveCount(0)
    const left = await lotsOf(grain.id)
    expect([older, newer].map((l) => Number(left.find((x) => x.id === l.id)!.on_hand))).toEqual([0, 55])
  })
})

test.describe('Hide used-up lots', () => {
  test('hidden by default; off shows Used up, kept after a reload and on the Hops list; brewer2 still hides; stock back is in its old place', async ({ page, browser }) => {
    const hop = await makeHop('hide')
    const [a, b, c] = ids(hop)
    await useLot(hop.lots[1], '11')
    await open(page, hop)
    await expectShown(page, [a, c])
    await expect(page.getByTestId(`${LIST}-used-up`)).toHaveCount(0)

    await page.getByTestId('hide-used-up').click()
    const usedUp = page.getByTestId(`${LIST}-used-up-${b}`)
    await expect(usedUp).toContainText(hop.lots[1].lot_number!)
    await expect(page.getByTestId(`${LIST}-used-up`)).toContainText('Used up')
    await expect(usedUp.getByRole('button')).toHaveCount(0)
    await page.reload()
    await expect(usedUp).toBeVisible()

    const second = await as(browser, 'brewer2')
    await open(second, hop)
    await expectShown(second, [a, c])
    await expect(second.getByTestId(`${LIST}-used-up`)).toHaveCount(0)
    await second.context().close()

    // The same setting beside the toggle on the Hops list; not on Grains.
    await page.goto(`/ingredients?category=${await categoryId('hops')}`)
    await expect(page.getByTestId('hide-used-up')).not.toBeChecked()
    await page.goto(`/ingredients?category=${await categoryId('grains')}`)
    await expect(page.getByTestId('quantity-toggle')).toBeVisible()
    await expect(page.getByTestId('hide-used-up')).toHaveCount(0)

    // The order moves around it, then stock comes back.
    await putOrder(hop.id, [c, a])
    const res = await (await apiAs('brewer1')).post(`/api/ingredient_products/${hop.b.id}/count`, {
      data: { mode: 'by_lot', counted_on: denverToday(), lots: [{ lot_id: b, counted: '4' }] },
    })
    expect(res.status()).toBe(201)
    await open(page, hop)
    await expectShown(page, [c, b, a])
  })

  test("a failed save keeps the choice for the page and says so", async ({ page }) => {
    const hop = await makeHop('hide fail')
    await useLot(hop.lots[1], '11')
    await open(page, hop)
    await page.route('**/api/me/board_settings/ingredients', (r) => r.abort())
    await page.getByTestId('hide-used-up').click()
    await expect(page.getByTestId('hide-used-up-not-saved')).toHaveText('Not saved to your account')
    await expect(page.getByTestId(`${LIST}-used-up-${hop.lots[1].id}`)).toBeVisible()
  })
})

test.describe('two brewers, and a slow or broken network', () => {
  test('brewer2 moves from a stale list: a sentence, the new order, nothing lost; the next move saves', async ({ page, browser }) => {
    const hop = await makeHop('two')
    const [a, b, c] = ids(hop)
    const second = await as(browser, 'brewer2')
    await open(second, hop)
    await expectShown(second, [a, b, c])
    await open(page, hop)
    await up(page, c).click()
    await expectOrder(hop, [a, c, b])

    await down(second, a).click()
    await expect(second.getByTestId(`${LIST}-error`)).toContainText('The use order changed since you opened it. This is the order now; move the lot again.')
    await expectShown(second, [a, c, b])
    await expectOrder(hop, [a, c, b])
    await down(second, a).click()
    await expect(second.getByTestId(`${LIST}-error`)).toHaveCount(0)
    await expectShown(second, [c, a, b])
    await expectOrder(hop, [c, a, b])
    await second.context().close()
  })

  for (const [what, change] of [
    ['added', async (hop: Hop) => void (await lotOf(hop.b, 'LATE', 0))],
    ['used up', async (hop: Hop) => useLot(hop.lots[1], '11')],
  ] as const) {
    test(`a lot ${what} meanwhile is the same: refused with the sentence, then shown`, async ({ page }) => {
      const hop = await makeHop(`meanwhile ${what}`)
      const [a, b, c] = ids(hop)
      await open(page, hop)
      await expectShown(page, [a, b, c])
      await change(hop)
      const now = await order(hop.id)
      await up(page, c).click()
      await expect(page.getByTestId(`${LIST}-error`)).toContainText('The use order changed')
      await expectShown(page, now)
      await expectOrder(hop, now)
    })
  }

  test('a second move before the first save answers loses neither', async ({ page }) => {
    const hop = await makeHop('slow')
    const [a, b, c] = ids(hop)
    await open(page, hop)
    const sent: number[][] = []
    await page.route('**/api/hop_use_lists/order', async (r) => {
      sent.push(r.request().postDataJSON().lot_ids)
      await new Promise((done) => setTimeout(done, 1500))
      await r.continue()
    })
    await up(page, c).click()
    await expectShown(page, [a, c, b])
    await up(page, c).click()
    await expectShown(page, [c, a, b])
    expect(sent).toEqual([[a, c, b]])
    // Neither answer puts the list back on the way.
    const seen = new Set<string>()
    const until = Date.now() + 4000
    while (Date.now() < until) {
      seen.add((await shown(page)).join())
      await page.waitForTimeout(50)
    }
    expect([...seen]).toEqual([[c, a, b].join()])
    expect(sent).toEqual([[a, c, b], [c, a, b]])
    await expectOrder(hop, [c, a, b])
    await expect(page.getByTestId(`${LIST}-error`)).toHaveCount(0)
    // And it still works after.
    await down(page, c).click()
    await expectOrder(hop, [a, c, b])
  })

  test('a failed save puts the old order back and says so; two waiting both go back; then it works', async ({ page }) => {
    const hop = await makeHop('fail')
    const [a, b, c] = ids(hop)
    await open(page, hop)
    await page.route('**/api/hop_use_lists/order', async (r) => {
      await new Promise((done) => setTimeout(done, 800))
      await r.abort()
    })
    await up(page, c).click()
    await expectShown(page, [a, c, b])
    await up(page, c).click()
    await expectShown(page, [c, a, b])
    await expect(page.getByTestId(`${LIST}-error`)).toContainText("The new order wasn't saved, so the old one is back")
    await expectShown(page, [a, b, c])
    await expectOrder(hop, [a, b, c])
    await page.unroute('**/api/hop_use_lists/order')
    await up(page, c).click()
    await expectOrder(hop, [a, c, b])
    await expectShown(page, [a, c, b])
  })
})

test('office1 and the brewhouse device: 403 reading and reordering, through the API', async () => {
  const hop = await makeHop('who')
  const [list] = await listsOf(hop.id)
  for (const who of ['office1', 'breweryDevice', 'taproomDevice'] as PersonaKey[]) {
    const api = await apiAs(who)
    expect((await api.get('/api/hop_use_lists', { params: { ingredient_id: hop.id } })).status(), who).toBe(403)
    expect((await api.put('/api/hop_use_lists/order', { data: { ingredient_id: hop.id, form: list.form, lot_ids: ids(hop), version: list.version } })).status(), who).toBe(403)
  }
  for (const who of ['breweryMgr', 'owner'] as PersonaKey[]) await putOrder(hop.id, [...ids(hop)].reverse(), who)
})

test.describe('at 360 px, with touch', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })

  test('full-width rows, no sideways scroll, long names wrap; the arrows and a long-press move a lot', async ({ page }) => {
    const hop = await makeHop('phone')
    const [a, b, c] = ids(hop)
    await expire(hop.lots[0])
    await useLot(hop.lots[1], '2')
    await setHide('brewer1', false)
    await open(page, hop)
    await expectNoSidewaysScroll(page)
    for (const id of [a, b, c]) {
      const box = (await row(page, id).boundingBox())!
      expect(box.width).toBeGreaterThan(300)
      for (const arrow of [up(page, id), down(page, id)]) {
        const at = (await arrow.boundingBox())!
        expect(at.x + at.width).toBeLessThanOrEqual(360)
      }
    }
    await up(page, c).tap()
    await expectOrder(hop, [a, c, b])
    await expectShown(page, [a, c, b])
    await touchAbove(page, b, a)
    await expectShown(page, [b, a, c])
    await expectOrder(hop, [b, a, c])
    await expectNoSidewaysScroll(page)

    // Record movement and the Hops list fit too.
    await page.goto(`/ingredients/products/${hop.a.id}`)
    const d = await openDialog(page, page.getByTestId('product-record-movement'), 'movement-dialog')
    await expect(d).toContainText('In use order')
    await expectNoSidewaysScroll(page)
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expectPhoneDialogClosed(page, d)
    await page.goto(`/ingredients?category=${await categoryId('hops')}`)
    await expect(page.getByTestId('hide-used-up')).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})
