import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('D13: Recipe Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Recipe toolbar shows all operation buttons', async ({ page }) => {
    // Navigate to brands list
    await page.goto('/brands');
    await expect(page.getByRole('heading', { name: 'Brands & Recipes' })).toBeVisible();

    // Click the first brand row to go to detail
    const firstBrandRow = page.getByRole('row').filter({ has: page.getByRole('gridcell') }).first();
    await firstBrandRow.click();

    // Wait for brand detail page
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 10_000 });

    // Click first recipe row
    const recipeRow = page.locator('[role="grid"]').last().getByRole('row').filter({ has: page.getByRole('gridcell') }).first();
    await recipeRow.click();

    // Wait for recipe page to load — use heading which contains "Recipe v1.x"
    await expect(page.getByRole('heading', { name: /Recipe v\d+\.\d+/ })).toBeVisible({ timeout: 10_000 });

    // Check toolbar buttons by their tooltip / aria-label
    await expect(page.getByRole('button', { name: /Copy Recipe/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Move to Brand/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit Recipe/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Delete Recipe/i })).toBeVisible();

    // Set as Default OR Default chip should be visible
    const setDefaultButton = page.getByRole('button', { name: /Set as Default/i });
    const defaultChip = page.getByText('Default');
    await expect(setDefaultButton.or(defaultChip)).toBeVisible();
  });

  test('Copy Recipe dialog opens with correct content', async ({ page }) => {
    // Navigate to brands → first brand → first recipe
    await page.goto('/brands');
    await expect(page.getByRole('heading', { name: 'Brands & Recipes' })).toBeVisible();

    const firstBrandRow = page.getByRole('row').filter({ has: page.getByRole('gridcell') }).first();
    await firstBrandRow.click();
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 10_000 });

    const recipeRow = page.locator('[role="grid"]').last().getByRole('row').filter({ has: page.getByRole('gridcell') }).first();
    await recipeRow.click();
    await expect(page.getByRole('heading', { name: /Recipe v\d+\.\d+/ })).toBeVisible({ timeout: 10_000 });

    // Click Copy Recipe
    await page.getByRole('button', { name: /Copy Recipe/i }).click();

    // Verify dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Copy Recipe' })).toBeVisible();
    await expect(page.getByText(/auto-incremented version/i)).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Copy' })).toBeVisible();

    // Cancel instead of executing
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Duplicate Brand dialog shows from brand detail', async ({ page }) => {
    await page.goto('/brands');
    await expect(page.getByRole('heading', { name: 'Brands & Recipes' })).toBeVisible();

    const firstBrandRow = page.getByRole('row').filter({ has: page.getByRole('gridcell') }).first();
    await firstBrandRow.click();
    await expect(page.getByRole('heading', { level: 4 })).toBeVisible({ timeout: 10_000 });

    // Click Duplicate Brand button
    await page.getByRole('button', { name: /Duplicate Brand/i }).click();

    // Verify dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Duplicate Brand' })).toBeVisible();
    // Should have a pre-filled name field with "(Copy)" suffix
    const nameField = page.getByRole('dialog').getByRole('textbox', { name: 'New Brand Name' });
    await expect(nameField).toBeVisible();
    const nameValue = await nameField.inputValue();
    expect(nameValue).toContain('(Copy)');

    // Should have "Clone all recipes" checkbox
    await expect(page.getByText(/[Cc]lone/)).toBeVisible();

    // Duplicate button
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Duplicate' })).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
