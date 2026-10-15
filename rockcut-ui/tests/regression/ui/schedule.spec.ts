import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from '../scheduler/helpers'

// D43 §1.8–§1.10, S156–S162: header buttons by page and role, week totals,
// and the Move mode for the staff order.

const SETUP_BUTTONS = ['Templates', 'Positions', 'Add event', 'Add shift']
const WEEK_BUTTONS = ['Publish week', 'Copy last week', 'Delete week']

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

test.describe('S156: brewer1, View Schedule', () => {
  test.use({ storageState: authFile('brewer1') })

  test('no header buttons; Calendar sync only opens its dialog', async ({ page }) => {
    await page.goto('/schedule')
    await expect(page.locator('header h1')).toHaveText('Schedule')
    for (const name of [...SETUP_BUTTONS, ...WEEK_BUTTONS]) await expect(button(page, name)).toHaveCount(0)
    await page.getByRole('button', { name: /calendar sync/i }).click()
    await expect(page.getByRole('dialog', { name: 'Calendar sync' })).toBeVisible()
    await expect(page).toHaveURL(/\/schedule/)
  })
})

test.describe('S157: breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('View Schedule: no Templates / Positions / Add event / Add shift', async ({ page }) => {
    await page.goto('/schedule')
    await expect(page.getByRole('button', { name: /calendar sync/i })).toBeVisible()
    for (const name of SETUP_BUTTONS) await expect(button(page, name)).toHaveCount(0)
  })

  test('Scheduler: those plus Publish / Copy / Delete week; no Calendar sync', async ({ page }) => {
    await page.goto('/scheduler')
    for (const name of [...WEEK_BUTTONS, ...SETUP_BUTTONS]) await expect(button(page, name)).toBeVisible()
    await expect(page.getByRole('button', { name: /calendar sync/i })).toHaveCount(0)
  })
})

test.describe('S158: taproomDevice, View Schedule', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('no Calendar sync', async ({ page }) => {
    await page.goto('/schedule')
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await expect(page.locator('header h1')).toHaveText('Schedule')
    await expect(page.getByRole('button', { name: /calendar sync/i })).toHaveCount(0)
  })
})

// "8 hr", "8 hr · 8 hr draft": published, then drafts only (spec §1.9).
function parseRowHours(label: string): { pub: number; draft: number } {
  const m = label.match(/^([\d.]+) hr(?: · ([\d.]+) hr draft)?$/)
  if (!m) throw new Error(`not an hours label: ${label}`)
  return { pub: Number(m[1]), draft: Number(m[2] ?? 0) }
}

async function weekTotals(page: Page) {
  const text = await page.getByTestId('week-hours').innerText()
  const pub = Number(text.match(/Scheduled ([\d.]+) hr/)![1])
  const draft = Number(text.match(/Draft ([\d.]+) hr/)![1])
  return { pub, draft }
}

async function rowSums(page: Page) {
  const labels = await page
    .locator('.MuiTypography-caption')
    .filter({ hasText: /^[\d.]+ hr( · [\d.]+ hr draft)?$/ })
    .allInnerTexts()
  return labels.map(parseRowHours).reduce((a, h) => ({ pub: a.pub + h.pub, draft: a.draft + h.draft }), { pub: 0, draft: 0 })
}

const round = (h: { pub: number; draft: number }) => ({ pub: Math.round(h.pub * 100) / 100, draft: Math.round(h.draft * 100) / 100 })

/** Staff rows in the grid, in order (from each row's ⋮ label). */
async function rowNames(page: Page): Promise<string[]> {
  const labels = await page.getByRole('button', { name: / options$/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
  return labels.map((l) => l.replace(/ options$/, '').replace(/ \(you\)$/, ''))
}

test.describe('owner, the Scheduler', () => {
  test.use({ storageState: authFile('owner') })

  test('S159: Scheduled / Draft totals match the rows, and follow the Department filter', async ({ page }) => {
    await page.goto('/scheduler')
    await expect(page.getByTestId('week-hours')).toBeVisible()
    await expect.poll(async () => JSON.stringify(round(await rowSums(page)))).toBe(JSON.stringify(round(await weekTotals(page))))
    const all = await weekTotals(page)

    await page.getByLabel('Department').click()
    await page.getByRole('option', { name: 'Brewery' }).click()
    await expect.poll(async () => JSON.stringify(round(await rowSums(page)))).toBe(JSON.stringify(round(await weekTotals(page))))
    const brewery = await weekTotals(page)
    expect(brewery.pub + brewery.draft).toBeLessThan(all.pub + all.draft)
  })

  test.describe('S160–S161: Move mode', () => {
    test.describe.configure({ mode: 'serial' })
    let original: number[] = []

    test.beforeAll(async () => {
      const roster = (await (await (await apiAs('owner')).get('/api/roster')).json()).data as { id: number }[]
      original = roster.map((r) => r.id)
    })
    test.afterAll(async () => {
      const res = await (await apiAs('owner')).post('/api/roster/order', { data: { user_ids: original } })
      expect(res.status()).toBe(200)
    })

    test('S160: ⋮ → Move; ↑ twice; Enter. Highlighted, other ⋮ hidden, order saved', async ({ page }) => {
      await page.goto('/scheduler')
      await expect(page.getByRole('button', { name: / options$/ }).first()).toBeVisible()
      const before = await rowNames(page)
      expect(before.length).toBeGreaterThan(3)
      const name = before[3]

      await page.getByRole('button', { name: `${before[3]} options` }).first().click()
      await page.getByTestId('row-move').click()
      const controls = page.getByTestId('move-controls')
      await expect(controls).toBeVisible()
      await expect(controls.getByRole('button', { name: 'Move up' })).toBeVisible()
      await expect(controls.getByRole('button', { name: 'Move down' })).toBeVisible()
      await expect(controls.getByRole('button', { name: 'Finished' })).toBeVisible()
      await expect(page.locator('[data-moving-row]')).toHaveCount(1)
      // Every other row's ⋮ hides while moving.
      await expect(page.getByRole('button', { name: / options$/ })).toHaveCount(0)

      // Two quick presses, as a person would: both steps count (each builds on the last).
      let saves = 0
      page.on('response', (r) => {
        if (r.url().endsWith('/api/roster/order') && r.request().method() === 'POST' && r.ok()) saves += 1
      })
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('Enter')
      await expect.poll(() => saves).toBe(2)
      await expect(controls).toHaveCount(0)

      const expected = [...before]
      expected.splice(3, 1)
      expected.splice(1, 0, name)
      await expect.poll(() => rowNames(page)).toEqual(expected)
      await page.reload()
      await expect.poll(() => rowNames(page)).toEqual(expected)
    })

    test('S161: ↓ button then Finished; Move then Esc also ends it', async ({ page }) => {
      await page.goto('/scheduler')
      await expect(page.getByRole('button', { name: / options$/ }).first()).toBeVisible()
      const before = await rowNames(page)
      const name = before[1]

      await page.getByRole('button', { name: `${name} options` }).first().click()
      await page.getByTestId('row-move').click()
      const controls = page.getByTestId('move-controls')
      const saved = page.waitForResponse((r) => r.url().endsWith('/api/roster/order') && r.request().method() === 'POST')
      await controls.getByRole('button', { name: 'Move down' }).click()
      await saved
      await controls.getByRole('button', { name: 'Finished' }).click()
      await expect(controls).toHaveCount(0)
      const expected = [...before]
      ;[expected[1], expected[2]] = [expected[2], expected[1]]
      await expect.poll(() => rowNames(page)).toEqual(expected)

      await page.getByRole('button', { name: `${name} options` }).first().click()
      await page.getByTestId('row-move').click()
      await expect(controls).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(controls).toHaveCount(0)
      await expect(page.getByRole('button', { name: / options$/ }).first()).toBeVisible()
    })
  })
})

test.describe('S162: brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('no Scheduler, and no ⋮ or arrows on View Schedule', async ({ page }) => {
    await page.goto('/scheduler')
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/schedule')
    await expect(page.locator('header h1')).toHaveText('Schedule')
    await expect(page.getByRole('button', { name: / options$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Move up' })).toHaveCount(0)
  })
})
