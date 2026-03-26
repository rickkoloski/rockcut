import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('D12: Process Profiles', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Process Profiles list loads with seed data', async ({ page }) => {
    await page.goto('/settings/process-profiles');
    // Page heading
    await expect(page.getByRole('heading', { name: 'Process Profiles' })).toBeVisible();
    // Add button
    await expect(page.getByRole('button', { name: 'Add Profile' })).toBeVisible();
    // Seed profiles: RC Ale, RC Hazy, RC Lager
    await expect(page.getByRole('gridcell', { name: 'RC Ale' })).toBeVisible();
    await expect(page.getByRole('gridcell', { name: 'RC Hazy' })).toBeVisible();
    await expect(page.getByRole('gridcell', { name: 'RC Lager' })).toBeVisible();
    // Column headers
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Mash Type' })).toBeVisible();
  });

  test('Process Profile detail shows all 6 phase sections', async ({ page }) => {
    await page.goto('/settings/process-profiles');
    // Click RC Ale
    await page.getByRole('gridcell', { name: 'RC Ale' }).click();
    // Wait for detail page
    await expect(page.getByRole('heading', { level: 4 })).toContainText('RC Ale');

    // Check all 7 sections (General + 6 phases)
    await expect(page.getByText('General', { exact: false })).toBeVisible();
    await expect(page.getByText('Mash', { exact: true })).toBeVisible();
    await expect(page.getByText('Lauter', { exact: true })).toBeVisible();
    await expect(page.getByText('Boil & Post-Boil')).toBeVisible();
    await expect(page.getByText('Fermentation', { exact: true })).toBeVisible();
    await expect(page.getByText('Cold Crash')).toBeVisible();
    await expect(page.getByText('Packaging', { exact: true })).toBeVisible();
  });
});
