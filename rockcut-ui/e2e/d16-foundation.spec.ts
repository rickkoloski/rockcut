import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import {
  setupD16TestData,
  teardownD16TestData,
  type D16TestData,
} from './helpers/test-data';

let d16Data: D16TestData;

test.describe.serial('D16: Foundation Fixes', () => {
  test.beforeAll(async ({ request }) => {
    d16Data = await setupD16TestData(request);
  });

  test.afterAll(async ({ request }) => {
    await teardownD16TestData(request, d16Data);
  });

  // ── Group 1: Brewhouse Resolution ──────────────────────────────────

  test('Brand with no explicit brewhouse shows default indicator', async ({ page }) => {
    await login(page);
    await page.goto(`/brands/${d16Data.brand.id}`);

    // Wait for brand detail to render
    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test D16 Brand',
      { timeout: 10_000 },
    );

    // The Brewhouse caption label should be visible
    await expect(page.getByText('Brewhouse', { exact: true })).toBeVisible();

    // The resolved brewhouse name should show (default "Production")
    // Use the link text within the brewhouse field row
    const brewhouseSection = page.getByText('Brewhouse', { exact: true }).locator('..');
    await expect(brewhouseSection.getByText('Production')).toBeVisible();

    // The "default" chip should be visible (MUI Chip with label="default")
    const defaultChip = page.locator('.MuiChip-root', { hasText: 'default' });
    await expect(defaultChip).toBeVisible();
  });

  test('Brand with explicit brewhouse shows no default indicator', async ({ page }) => {
    await login(page);
    // Brand 1 = "Test IPA" has brewhouse_id=1 explicitly set
    await page.goto('/brands/1');

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'Test IPA',
      { timeout: 10_000 },
    );

    // Brewhouse label should show
    await expect(page.getByText('Brewhouse', { exact: true })).toBeVisible();

    // Brewhouse name should show
    const brewhouseSection = page.getByText('Brewhouse', { exact: true }).locator('..');
    await expect(brewhouseSection.getByText('Production')).toBeVisible();

    // The "default" chip should NOT be present for an explicitly-set brewhouse
    const defaultChip = page.locator('.MuiChip-root', { hasText: 'default' });
    await expect(defaultChip).not.toBeVisible();
  });

  // ── Group 2: New Brand Fields ──────────────────────────────────────

  test('New brand fields display on detail page', async ({ page }) => {
    await login(page);
    await page.goto(`/brands/${d16Data.brand.id}`);

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test D16 Brand',
      { timeout: 10_000 },
    );

    // Field labels should be present
    await expect(page.getByText('Apparent Attenuation')).toBeVisible();
    await expect(page.getByText('Target Mash Efficiency')).toBeVisible();
    await expect(page.getByText('Target Batch Size')).toBeVisible();
    await expect(page.getByText('Original Gravity')).toBeVisible();

    // Values should reflect what was set: 0.76, 0.80, 7, 1.055
    // The UI renders attenuation & efficiency with "%" suffix
    await expect(page.getByText('0.76%')).toBeVisible();
    await expect(page.getByText('0.8%')).toBeVisible();
    // target_batch_size = 7 (many "7"s on page, so check near label)
    const batchSizeField = page.locator('text=Target Batch Size').locator('..');
    await expect(batchSizeField).toContainText('7');
    await expect(page.getByText('1.055')).toBeVisible();
  });

  test('Edit brand fields with persist-verify', async ({ page }) => {
    await login(page);
    await page.goto(`/brands/${d16Data.brand.id}`);

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test D16 Brand',
      { timeout: 10_000 },
    );

    // Click Edit Brand button
    await page.getByRole('button', { name: 'Edit Brand' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Edit Brand' })).toBeVisible();

    // Change Apparent Attenuation from 0.76 to 0.78
    const attenuationField = page.getByRole('dialog').getByLabel('Apparent Attenuation (%)');
    await attenuationField.clear();
    await attenuationField.fill('0.78');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });

    // Verify changed value on detail page
    await expect(page.getByText('0.78%')).toBeVisible({ timeout: 5_000 });

    // PERSIST-VERIFY: Navigate away
    await page.getByRole('button', { name: 'Brands & Recipes' }).click();
    await expect(page.getByRole('heading', { name: 'Brands & Recipes' })).toBeVisible({ timeout: 10_000 });

    // Navigate back
    await page.goto(`/brands/${d16Data.brand.id}`);
    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test D16 Brand',
      { timeout: 10_000 },
    );

    // Confirm 0.78 persisted
    await expect(page.getByText('0.78%')).toBeVisible();
  });

  // ── Group 3: Recipe Detail Calculated Values ───────────────────────

  test('Recipe detail shows calculated values', async ({ page }) => {
    await login(page);
    // Use the existing "Test IPA" brand (id=1) which has recipe 1 with ingredients
    await page.goto('/brands/1/recipes/1');

    // Wait for recipe detail to load
    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'Recipe v1.0',
      { timeout: 10_000 },
    );

    // The summary header should show calculated values
    // The calc values are in italicized Typography elements with <strong> labels
    // Each calc value line renders as: <strong>Est. OG:</strong> 1.0564

    // Wait for formulas to compute (they load async) — check that OG shows a number
    // Use a regex that matches "Est. OG:" followed by a number (not a dash)
    await expect(page.getByText(/Est\. OG:\s*[\d.]+/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Est\. FG:\s*[\d.]+/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Est\. IBU:\s*[\d.]+/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Est\. ABV:\s*[\d.]+/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Est\. SRM:\s*[\d.]+/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Est\. Cal:\s*\d+/)).toBeVisible({ timeout: 10_000 });
  });

  test('Recipe detail shows brewhouse name', async ({ page }) => {
    await login(page);
    await page.goto('/brands/1/recipes/1');

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'Recipe v1.0',
      { timeout: 10_000 },
    );

    // The summary bar should show the brewhouse name
    // Rendered as <strong>Brewhouse:</strong> Production
    await expect(page.getByText(/Brewhouse:\s*Production/)).toBeVisible({ timeout: 10_000 });
  });

  // ── Group 4: Formula Accuracy Smoke Test ───────────────────────────

  test('Est. OG is in realistic beer range', async ({ page }) => {
    await login(page);
    await page.goto('/brands/1/recipes/1');

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'Recipe v1.0',
      { timeout: 10_000 },
    );

    // Wait for OG to compute — should show numeric text, not dashes
    const ogElement = page.getByText(/Est\. OG:\s*[\d.]+/);
    await expect(ogElement).toBeVisible({ timeout: 15_000 });

    // Extract the numeric OG value
    const ogFullText = await ogElement.textContent();
    const ogMatch = ogFullText?.match(/Est\.\s*OG:\s*([\d.]+)/);
    expect(ogMatch).not.toBeNull();
    const ogValue = parseFloat(ogMatch![1]);

    // OG should be in realistic beer range (1.010 - 1.100)
    expect(ogValue).toBeGreaterThanOrEqual(1.01);
    expect(ogValue).toBeLessThanOrEqual(1.1);
  });

  test('Est. ABV is in realistic beer range', async ({ page }) => {
    await login(page);
    await page.goto('/brands/1/recipes/1');

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'Recipe v1.0',
      { timeout: 10_000 },
    );

    const abvElement = page.getByText(/Est\. ABV:\s*[\d.]+/);
    await expect(abvElement).toBeVisible({ timeout: 15_000 });

    const abvFullText = await abvElement.textContent();
    const abvMatch = abvFullText?.match(/Est\.\s*ABV:\s*([\d.]+)/);
    expect(abvMatch).not.toBeNull();
    const abvValue = parseFloat(abvMatch![1]);

    // ABV should be in realistic beer range (0.5 - 15.0%)
    expect(abvValue).toBeGreaterThanOrEqual(0.5);
    expect(abvValue).toBeLessThanOrEqual(15.0);
  });
});
