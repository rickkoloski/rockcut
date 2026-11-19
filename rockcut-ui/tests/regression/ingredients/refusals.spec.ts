import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, reference } from './helpers'

// D60 spec §9: `bartender1` (Taproom only) has no Ingredients in the nav,
// `/ingredients` isn't routed, and the API refuses; `breweryDevice` (the
// brewhouse tablet) gets 403 on every D60 route. Nothing here can write:
// reads use real ids; writes and deletes name an id that doesn't exist (the
// device gate answers before the id is looked up) or send an empty body.

test.describe('bartender1 (Taproom employee)', () => {
  test.use({ storageState: authFile('bartender1') })

  test('R1: no Ingredient Library in the nav; /ingredients goes Home; GET /api/ingredient_products is 403', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('.MuiDrawer-paper').first()
    await expect(nav.getByRole('button', { name: 'Home' })).toBeVisible()
    await expect(nav.getByText('Ingredient Library')).toHaveCount(0)

    for (const path of ['/ingredients', '/ingredients/companies', '/ingredients/products/1', '/ingredients/orders', '/ingredients/orders/1', '/ingredients/contracts', '/ingredients/to-order', '/ingredients/totals']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByTestId('ingredients-add-button')).toHaveCount(0)
      await expect(page.getByTestId('companies-add')).toHaveCount(0)
      await expect(page.getByTestId('product-on-hand')).toHaveCount(0)
    }

    const api = await apiAs('bartender1')
    // D61: purchasing, contracts, totals and To order too.
    for (const path of ['/api/ingredient_products', '/api/parties', '/api/inventory_movements', '/api/supplier_offers', '/api/purchase_orders', '/api/contracts', '/api/ingredient_totals/inventory', '/api/ingredient_reorder']) {
      expect((await api.get(path)).status(), path).toBe(403)
    }
  })
})

test('R2: breweryDevice gets 403 on every D60 and D61 route', async () => {
  const brewer = await apiAs('brewer1')
  const products = (await (await brewer.get('/api/ingredient_products')).json()).data as { id: number; display_name: string; offers: { id: number }[] }[]
  const rahr = products.find((p) => p.display_name === 'Rahr 2-Row')!
  const offer = rahr.offers[0].id
  const { rahr: party } = await reference()
  const lots = (await (await brewer.get(`/api/ingredient_lots?product_id=${rahr.id}`)).json()).data as { id: number }[]

  const NONE = 987654
  const device = await apiAs('breweryDevice')
  const calls: [string, string][] = [
    ['GET', '/api/ingredient_products'],
    ['GET', `/api/ingredient_products/${rahr.id}`],
    ['POST', '/api/ingredient_products'],
    ['PUT', `/api/ingredient_products/${NONE}`],
    ['DELETE', `/api/ingredient_products/${NONE}`],
    ['POST', `/api/ingredient_products/${NONE}/count`],
    ['GET', '/api/feature_types'],
    ['GET', '/api/parties'],
    ['GET', `/api/parties/${party}`],
    ['POST', '/api/parties'],
    ['PUT', `/api/parties/${NONE}`],
    ['DELETE', `/api/parties/${NONE}`],
    ['GET', '/api/supplier_offers'],
    ['GET', `/api/supplier_offers/${offer}`],
    ['POST', '/api/supplier_offers'],
    ['PUT', `/api/supplier_offers/${NONE}`],
    ['DELETE', `/api/supplier_offers/${NONE}`],
    ['GET', `/api/supplier_offers/${offer}/prices`],
    ['POST', `/api/supplier_offers/${NONE}/prices`],
    ['GET', '/api/inventory_movements'],
    ['POST', '/api/inventory_movements'],
    ['GET', '/api/ingredient_lots'],
    ['GET', `/api/ingredient_lots/${lots[0].id}`],
    ['POST', '/api/ingredient_lots'],
    ['PUT', `/api/ingredient_lots/${NONE}`],
    ['DELETE', `/api/ingredient_lots/${NONE}`],
    // D61 (decision 26): nothing in purchasing, contracts, totals or To order.
    ['GET', '/api/purchase_orders'],
    ['GET', `/api/purchase_orders/${NONE}`],
    ['POST', '/api/purchase_orders'],
    ['PUT', `/api/purchase_orders/${NONE}`],
    ['POST', `/api/purchase_orders/${NONE}/cancel`],
    ['POST', `/api/purchase_orders/${NONE}/receive`],
    ['GET', '/api/contracts'],
    ['GET', '/api/contracts/shortfall'],
    ['POST', '/api/contracts'],
    ['GET', '/api/ingredient_totals/inventory'],
    ['GET', '/api/ingredient_totals/orders'],
    ['GET', '/api/ingredient_reorder'],
  ]
  for (const [method, path] of calls) {
    const res = await device.fetch(path, { method, data: method === 'GET' || method === 'DELETE' ? undefined : {} })
    expect(res.status(), `${method} ${path}`).toBe(403)
  }
})
