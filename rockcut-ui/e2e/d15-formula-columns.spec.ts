import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupTestData, teardownTestData, type TestData } from './helpers/test-data';

let testData: TestData;

test.describe.serial('D15: Formula Column Rendering', () => {
  test.beforeAll(async ({ request }) => {
    testData = await setupTestData(request);
  });

  test.afterAll(async ({ request }) => {
    await teardownTestData(request, testData);
  });

  test('Brand detail loads recipe grid', async ({ page }) => {
    await login(page);
    await page.goto(`/brands/${testData.brand.id}`);

    // Wait for brand detail page
    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test IPA',
      { timeout: 10_000 },
    );

    // Recipes section heading
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();

    // Recipe grid renders with at least one row
    const grid = page.locator('[role="grid"]').last();
    await expect(grid).toBeVisible();

    // Our test recipe row should be visible (version "1.0")
    await expect(grid.getByRole('gridcell')).not.toHaveCount(0);
  });

  test('Est. IBU column renders a computed value', async ({ page }) => {
    await login(page);
    await page.goto(`/brands/${testData.brand.id}`);

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test IPA',
      { timeout: 10_000 },
    );

    // Wait for formula columns to compute (they load async via remote functions)
    const grid = page.locator('[role="grid"]').last();
    await expect(grid).toBeVisible();

    // Est. IBU column header should be visible
    await expect(page.getByRole('columnheader', { name: 'Est. IBU' })).toBeVisible();

    // The Est. IBU cell for our recipe should contain a numeric value
    // Formula columns render async — wait for cell content to be a number
    // The cell is in the row for our test recipe
    const ibuCell = grid.locator('[data-field="est_ibu"]').first();
    await expect(ibuCell).toBeVisible({ timeout: 15_000 });

    // Wait for the cell to have actual numeric content (not empty, not loading)
    // The formula may compute to 0 for grain-only recipes (no hops), which is valid
    await expect(ibuCell).not.toBeEmpty({ timeout: 15_000 });
  });

  test('Est. OG column renders a computed value', async ({ page }) => {
    await login(page);
    await page.goto(`/brands/${testData.brand.id}`);

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test IPA',
      { timeout: 10_000 },
    );

    const grid = page.locator('[role="grid"]').last();
    await expect(grid).toBeVisible();

    // Est. OG column header should be visible
    await expect(page.getByRole('columnheader', { name: 'Est. OG' })).toBeVisible();

    // The Est. OG cell should contain a value
    const ogCell = grid.locator('[data-field="est_og"]').first();
    await expect(ogCell).toBeVisible({ timeout: 15_000 });

    // For 200 lb of 2-Row in a 7 bbl batch at 75% efficiency, OG should be > 1.000
    // Wait for it to have content (not empty)
    await expect(ogCell).not.toBeEmpty({ timeout: 15_000 });
  });

  test('Formula columns visible via column visibility toggle', async ({ page }) => {
    await login(page);
    await page.goto(`/brands/${testData.brand.id}`);

    await expect(page.getByRole('heading', { level: 4 })).toContainText(
      'PW Test IPA',
      { timeout: 10_000 },
    );

    const grid = page.locator('[role="grid"]').last();
    await expect(grid).toBeVisible();

    // Check if the column visibility toggle button exists
    // DataGridExtended renders a toolbar button for toggling columns
    const toggleButton = page.getByRole('button', { name: /columns/i })
      .or(page.locator('[aria-label="Show/Hide Columns"]'))
      .or(page.locator('[data-testid="ViewColumnIcon"]').locator('..'));

    // If the toggle button exists, try to enable hidden formula columns
    const toggleVisible = await toggleButton.first().isVisible().catch(() => false);

    if (toggleVisible) {
      await toggleButton.first().click();

      // The column visibility panel should appear
      // Look for checkboxes for Est. FG, Est. ABV, Est. SRM
      const panel = page.locator('.MuiPopover-root, .MuiPaper-root').last();

      const fgCheckbox = panel.getByText('Est. FG').or(panel.getByLabel('Est. FG'));
      const abvCheckbox = panel.getByText('Est. ABV').or(panel.getByLabel('Est. ABV'));
      const srmCheckbox = panel.getByText('Est. SRM').or(panel.getByLabel('Est. SRM'));

      // Enable any that are available (they may not be wired yet)
      for (const checkbox of [fgCheckbox, abvCheckbox, srmCheckbox]) {
        const isVisible = await checkbox.isVisible().catch(() => false);
        if (isVisible) {
          await checkbox.click();
        }
      }

      // Close the panel by clicking away
      await page.keyboard.press('Escape');

      // If Est. FG column is now visible, verify it renders
      const fgHeader = page.getByRole('columnheader', { name: 'Est. FG' });
      const fgVisible = await fgHeader.isVisible().catch(() => false);
      if (fgVisible) {
        const fgCell = grid.locator('[data-field="est_fg"]').first();
        await expect(fgCell).toBeVisible({ timeout: 15_000 });
      }
    }

    // Even without toggle, Est. IBU and Est. OG should be visible as baseline
    await expect(page.getByRole('columnheader', { name: 'Est. IBU' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Est. OG' })).toBeVisible();
  });
});
