import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('D12: Brand Form — Brewhouse & Process Profile Dropdowns', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Brand form shows Brewhouse and Process Profile dropdowns', async ({ page }) => {
    await page.goto('/brands');
    await expect(page.getByRole('heading', { name: 'Brands & Recipes' })).toBeVisible();

    // Open add brand dialog
    await page.getByRole('button', { name: 'Add Brand' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Scroll dialog to see all fields — Brewhouse and Process Profile are at the bottom
    const dialog = page.getByRole('dialog');

    // Verify Brewhouse select is present (use getByLabel to avoid strict mode on matching label + span)
    await expect(dialog.getByLabel('Brewhouse')).toBeVisible();
    // Verify Process Profile select is present
    await expect(dialog.getByLabel('Process Profile')).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
