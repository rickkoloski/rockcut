import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('D15: Baseline Auth & Navigation', () => {
  test('Login flow — credentials, submit, app shell loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Email' }).fill('matthewheiser@gmail.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('rockcut2026');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // App shell loaded — Settings nav button indicates authenticated state
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
    // Home page content should be visible
    await expect(page.getByText('Home')).toBeVisible();
  });

  test('Nav to Settings — Settings page loads', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
  });

  test('Nav to Brewhouses — list heading and grid visible', async ({ page }) => {
    await login(page);
    await page.goto('/settings/brewhouses');
    await expect(page.getByRole('heading', { name: 'Brewhouses' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Brewhouse' })).toBeVisible();
  });

  test('Nav to Brands — list heading and grid visible', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Brands & Recipes' }).click();
    await expect(page.getByRole('heading', { name: 'Brands & Recipes' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Brand' })).toBeVisible();
  });

  test('Nav to Ingredients — list heading and grid visible', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Ingredient Library' }).click();
    await expect(page.getByRole('heading', { name: 'Ingredient Library' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('grid')).toBeVisible();
  });
});
