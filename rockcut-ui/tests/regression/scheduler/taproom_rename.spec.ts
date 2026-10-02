import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'

// D32 S10: the Bar department shows as "Taproom" everywhere; the key stays `bar`
// and position names are unchanged.

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S10: nav, channels, legend and Manage positions say Taproom', async ({ page }) => {
    const departments = (await (await (await apiAs('owner')).get('/api/departments')).json()).data as { key: string; name: string }[]
    expect(departments.find((d) => d.key === 'bar')?.name).toBe('Taproom')

    await page.goto('/scheduler')
    await expect(page.getByRole('button', { name: 'Taproom', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bar', exact: true })).toHaveCount(0)

    const channels = (await (await (await apiAs('owner')).get('/api/channels')).json()).data as { key: string; name: string }[]
    expect(channels.find((c) => c.key === 'dept:bar')?.name).toBe('Taproom')

    await page.getByRole('button', { name: 'Positions' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Taproom')
    for (const name of ['Bar-open', 'Bar-mid', 'Bar-close', 'Event-bar']) await expect(dialog).toContainText(name)
  })
})
