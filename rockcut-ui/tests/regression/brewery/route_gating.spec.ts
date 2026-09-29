import { test, expect } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'

// D31 §3.9–3.10, scenarios S1–S3. Brewery pages are routed only for Brewery
// members (and owners). Anyone else who types one of these URLs lands on Home
// and never sees the page's "Add" button. Before D31 they got an empty table
// with a working-looking "Add" button while the API returned 403.

const ROUTES = [
  { path: '/brands', addButton: 'brands-add-button' },
  { path: '/ingredients', addButton: 'ingredients-add-button' },
  { path: '/batches', addButton: 'batches-add-button' },
  { path: '/settings', addButton: 'settings-add-button' },
]

const DENIED: PersonaKey[] = ['bartender1', 'barMgr'] // S1, S2
const ALLOWED: PersonaKey[] = ['brewer1', 'floater', 'splitRole'] // S3

for (const persona of DENIED) {
  test.describe(`${persona} (not in Brewery)`, () => {
    test.use({ storageState: authFile(persona) })

    for (const { path, addButton } of ROUTES) {
      test(`${path} redirects to Home without rendering the page`, async ({ page }) => {
        await page.goto(path)
        await expect(page).toHaveURL(/\/$/)
        await expect(page.getByTestId(addButton)).toHaveCount(0)
      })
    }
  })
}

for (const persona of ALLOWED) {
  test.describe(`${persona} (Brewery member)`, () => {
    test.use({ storageState: authFile(persona) })

    for (const { path, addButton } of ROUTES) {
      test(`${path} renders with its Add button`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByTestId(addButton)).toBeVisible()
        await expect(page).toHaveURL(new RegExp(`${path}$`))
      })
    }
  })
}
