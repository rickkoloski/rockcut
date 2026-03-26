import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupTestData, teardownTestData, type TestData } from './helpers/test-data';

let testData: TestData;

test.describe.serial('D15: Brewhouse Detail Verification', () => {
  test.beforeAll(async ({ request }) => {
    testData = await setupTestData(request);
  });

  test.afterAll(async ({ request }) => {
    await teardownTestData(request, testData);
  });

  test('UOM Preferences section is visible with all fields', async ({ page }) => {
    await login(page);
    await page.goto(`/settings/brewhouses/${testData.brewhouse.id}`);

    // Wait for the detail page to render the brewhouse name
    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test Brewhouse',
      { timeout: 10_000 },
    );

    // UOM Preferences section header
    await expect(page.getByText('UOM Preferences')).toBeVisible();

    // All UOM fields present
    await expect(page.getByText('Temperature Unit')).toBeVisible();
    await expect(page.getByText('Liquid Volume Unit')).toBeVisible();
    await expect(page.getByText('Density Unit')).toBeVisible();
    await expect(page.getByText('Alcohol Unit')).toBeVisible();
    await expect(page.getByText('Density Calc Method')).toBeVisible();
    await expect(page.getByText('IBU Calc Method')).toBeVisible();

    // Verify actual values rendered
    await expect(page.getByText('F', { exact: true })).toBeVisible();
    await expect(page.getByText('sg', { exact: true })).toBeVisible();
    await expect(page.getByText('tinseth', { exact: true })).toBeVisible();
  });

  test('Equipment Values section is visible with all fields', async ({ page }) => {
    await login(page);
    await page.goto(`/settings/brewhouses/${testData.brewhouse.id}`);

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test Brewhouse',
      { timeout: 10_000 },
    );

    // Equipment Values section header
    await expect(page.getByText('Equipment Values')).toBeVisible();

    // All equipment fields present
    await expect(page.getByText('Kettle Turn Size')).toBeVisible();
    await expect(page.getByText('Evaporation Rate')).toBeVisible();
    await expect(page.getByText('Kettle Loss')).toBeVisible();
    await expect(page.getByText('Fermenter Loss')).toBeVisible();

    // Verify values (created with known values via API)
    await expect(page.getByText('7')).toBeVisible();
    await expect(page.getByText('0.5')).toBeVisible();
  });

  test('Edit brewhouse — change temp unit, persist-verify', async ({ page }) => {
    await login(page);
    await page.goto(`/settings/brewhouses/${testData.brewhouse.id}`);

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test Brewhouse',
      { timeout: 10_000 },
    );

    // Click the Edit button (tooltip "Edit")
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Edit Brewhouse' })).toBeVisible();

    // Change Temperature Unit from F to C
    // MUI select: click the select, then pick the option
    const tempSelect = page.getByRole('dialog').getByLabel('Temperature Unit');
    await tempSelect.click();
    // MUI dropdown renders a listbox with options
    await page.getByRole('option', { name: 'C' }).click();

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });

    // Verify changed value is visible on detail page
    // The Temperature Unit value should now show C, not F
    // Find the value next to the "Temperature Unit" label
    const tempValueLocator = page.locator('text=Temperature Unit').locator('..').locator('p');
    await expect(tempValueLocator).toContainText('C');

    // PERSIST-VERIFY: Navigate away and come back
    await page.goto('/settings/brewhouses');
    await expect(page.getByRole('heading', { name: 'Brewhouses' })).toBeVisible({ timeout: 10_000 });

    // Navigate back to detail
    await page.goto(`/settings/brewhouses/${testData.brewhouse.id}`);
    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test Brewhouse',
      { timeout: 10_000 },
    );

    // Confirm the change persisted
    const tempValueAfter = page.locator('text=Temperature Unit').locator('..').locator('p');
    await expect(tempValueAfter).toContainText('C');
  });
});
