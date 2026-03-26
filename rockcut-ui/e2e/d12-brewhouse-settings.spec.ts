import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('D12: Brewhouse Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Settings page has Brewhouses navigation button', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: /Brewhouses/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Process Profiles/i })).toBeVisible();
  });

  test('Brewhouses list loads with seed data', async ({ page }) => {
    await page.goto('/settings/brewhouses');
    // Wait for page heading
    await expect(page.getByRole('heading', { name: 'Brewhouses' })).toBeVisible();
    // Add button visible
    await expect(page.getByRole('button', { name: 'Add Brewhouse' })).toBeVisible();
    // Seed data: "Production" brewhouse exists
    await expect(page.getByRole('gridcell', { name: 'Production' })).toBeVisible();
    // Column headers present
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Default' })).toBeVisible();
  });

  test('Brewhouse detail shows all sections', async ({ page }) => {
    await page.goto('/settings/brewhouses');
    // Click the Production row
    await page.getByRole('gridcell', { name: 'Production' }).click();
    // Wait for detail page
    await expect(page.getByRole('heading', { level: 4 })).toContainText('Production');
    // Check sections
    await expect(page.getByText('General')).toBeVisible();
    await expect(page.getByText('UOM Preferences')).toBeVisible();
    await expect(page.getByText('Equipment Values')).toBeVisible();
    // Check specific fields
    await expect(page.getByText('Temperature Unit')).toBeVisible();
    await expect(page.getByText('Liquid Volume Unit')).toBeVisible();
    await expect(page.getByText('Kettle Turn Size')).toBeVisible();
    await expect(page.getByText('Evaporation Rate')).toBeVisible();
  });

  test('Create and delete brewhouse', async ({ page }) => {
    await page.goto('/settings/brewhouses');
    await expect(page.getByRole('heading', { name: 'Brewhouses' })).toBeVisible();

    // Open add dialog
    await page.getByRole('button', { name: 'Add Brewhouse' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add Brewhouse' })).toBeVisible();

    // Fill name
    await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('PW Test Brewhouse');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify dialog closes and new row appears
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('gridcell', { name: 'PW Test Brewhouse' })).toBeVisible();

    // Cleanup: navigate to detail and delete
    await page.getByRole('gridcell', { name: 'PW Test Brewhouse' }).click();
    await expect(page.getByRole('heading', { level: 4 })).toContainText('PW Test Brewhouse');

    // Click delete button (has tooltip "Delete")
    await page.getByRole('button', { name: 'Delete' }).click();
    // Confirm delete dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    // Should navigate back to list
    await expect(page.getByRole('heading', { name: 'Brewhouses' })).toBeVisible({ timeout: 5_000 });
    // Verify test brewhouse is gone
    await expect(page.getByRole('gridcell', { name: 'PW Test Brewhouse' })).not.toBeVisible();
  });
});
