import { test, expect } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { apiAs, openBreweryNav } from './helpers'

// D46 §3.13 / P19: production setup is Brewery members' and owners'. Others
// have no nav entry, a typed URL goes Home and the API says 403. The tablet
// (read-only setup pages) comes with D49; until then it is refused too.

const PAGES = ['/brewery/production', '/brewery/production/tanks', '/brewery/production/lists', '/brewery/production/templates']

for (const persona of ['bartender1', 'barMgr'] as PersonaKey[]) {
  test.describe(`P19: ${persona}`, () => {
    test.use({ storageState: authFile(persona) })

    test('no Production nav entry; typed URLs go Home; the API is 403', async ({ page }) => {
      for (const path of PAGES) {
        await page.goto(path)
        await expect(page).toHaveURL(/\/$/)
        await expect(page.getByTestId('production-hub')).toHaveCount(0)
        await expect(page.getByTestId('templates-list')).toHaveCount(0)
      }
      await expect(page.locator('.MuiDrawer-paper:visible').getByText('Production', { exact: true })).toHaveCount(0)
      const api = await apiAs(persona)
      for (const path of ['tanks', 'phases', 'step_types', 'templates'])
        expect((await api.get(`/api/production/${path}`)).status(), path).toBe(403)
      expect((await api.post('/api/production/templates', { data: { name: 'nope' } })).status()).toBe(403)
    })
  })
}

for (const persona of ['owner', 'floater'] as PersonaKey[]) {
  test.describe(`${persona} (owner / Bar + Brewery)`, () => {
    test.use({ storageState: authFile(persona) })

    test('the nav entry and every setup page open', async ({ page }) => {
      await openBreweryNav(page, 'Production')
      await expect(page).toHaveURL(/\/brewery\/production$/)
      await page.goto('/brewery/production/templates')
      await expect(page.getByTestId('template-new')).toBeVisible()
      await page.goto('/brewery/production/tanks')
      await expect(page.getByTestId('tank-add')).toBeVisible()
      await page.goto('/brewery/production/lists')
      await expect(page.getByTestId('step-type-add')).toBeVisible()
    })
  })
}

test.describe('P19: breweryDevice (until D49)', () => {
  test('the API refuses the shared tablet', async () => {
    const api = await apiAs('breweryDevice')
    const res = await api.get('/api/production/templates')
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toBe('Not available on a shared device')
  })
})
