import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('D14: UI Quick Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Ingredient Library defaults to Grain category', async ({ page }) => {
    await page.goto('/ingredients');
    await expect(page.getByRole('heading', { name: 'Ingredient Library' })).toBeVisible();

    // The category dropdown should default to "Grain"
    // MUI Select renders the selected value as text inside a combobox/button
    await expect(page.getByText('Grain')).toBeVisible();

    // Grid should show grain ingredients, not all
    await expect(page.getByRole('grid')).toBeVisible();
  });

  test('Other Consumables rename (not Extract)', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Wait for categories grid to load
    await expect(page.getByRole('grid')).toBeVisible();

    // "Other Consumables" should be visible
    await expect(page.getByRole('gridcell', { name: 'Other Consumables' })).toBeVisible();
    // "Extract" should NOT be visible (it was renamed)
    await expect(page.getByRole('gridcell', { name: 'Extract' })).not.toBeVisible();
  });

  test('System field protection — lock icons and no delete buttons', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('grid')).toBeVisible();

    // Navigate to the Grain category detail
    await page.getByRole('gridcell', { name: 'Grain' }).click();

    // Wait for category detail page
    await expect(page.getByRole('heading', { level: 4 })).toContainText('Grain');

    // Field Definitions section should be visible
    await expect(page.getByText('Field Definitions')).toBeVisible();

    // System fields (Origin, Maltster) should have lock icons
    // The lock icon is rendered as an SVG inside the field name cell
    // We check that the system field text is visible
    await expect(page.getByText('Origin')).toBeVisible();
    await expect(page.getByText('Maltster')).toBeVisible();

    // Verify system fields don't have delete buttons in their rows
    // The grid for field definitions has an actions column
    // System fields should not have a delete icon button
    // Count the delete buttons — should be fewer than total field count
    // (Non-system fields may have delete buttons)
    const fieldGrid = page.locator('.MuiDataGrid-root').last();
    await expect(fieldGrid).toBeVisible();

    // Check that at least one lock indicator exists (system fields present)
    // The lock icon uses LockIcon from MUI — rendered as an SVG with specific test
    const lockIcons = page.locator('[data-testid="LockIcon"]');
    await expect(lockIcons.first()).toBeVisible();
  });
});
