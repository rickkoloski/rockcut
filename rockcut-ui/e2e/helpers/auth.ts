import { Page, expect } from '@playwright/test';

/**
 * Login to Rockcut UI and verify the app shell loads.
 * Reusable across all test files.
 */
export async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('matthewheiser@gmail.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('rockcut2026');
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Wait for redirect to authenticated app
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
}
