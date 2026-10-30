import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { gantt, Made, openGantt, templateId } from './schedule'

// D52 on the production Gantt: no legend under the chart, the chart running to
// the bottom of the window, tank abbreviations in the names-only column, and
// the template preview opening a tank's steps.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 900 } })

const made = new Made()
test.afterEach(() => made.cleanup())

test('no legend under the chart; the chart runs to 24px above the bottom of the window', async ({ page }) => {
  await openGantt(page)
  await expect(page.getByTestId('gantt-legend')).toHaveCount(0)
  await expect
    .poll(async () => {
      const b = (await gantt(page).boundingBox())!
      return Math.round(900 - (b.y + b.height))
    })
    .toBe(24)
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
})

test('a tank abbreviation shows in the names-only column; without one, the name', async ({ page }) => {
  const [a, b] = [await made.tank('Serving A'), await made.tank('Serving B')]
  const api = await apiAs('brewer1')
  const res = await api.patch(`/api/production/tanks/${a.id}`, { data: { abbreviation: 'SVA' } })
  expect(res.status(), await res.text()).toBe(200)

  await openGantt(page)
  if ((await gantt(page).getAttribute('data-compact')) === null) await page.getByTestId('gantt-compact').click()
  await expect(gantt(page)).toHaveAttribute('data-compact', 'true')
  await expect(page.getByTestId(`gantt-tank-name-${a.id}`)).toHaveText('SVA')
  await expect(page.getByTestId(`gantt-tank-name-${b.id}`)).toHaveText(b.name)
  // The full view keeps the full name.
  await page.getByTestId('gantt-compact').click()
  await expect(page.getByTestId(`gantt-tank-name-${a.id}`)).toHaveText(a.name)
})

test('Edit tank: an optional abbreviation, up to 4 characters', async ({ page }) => {
  const t = await made.tank('Abbrev')
  await page.goto('/brewery/production/tanks')
  await page.getByTestId(`tank-edit-${t.id}`).click()
  const field = page.getByTestId('tank-abbreviation')
  await expect(field).toHaveAttribute('maxlength', '4')
  await field.fill('AB1')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => {
    const tanks = (await (await (await apiAs('brewer1')).get('/api/production/tanks')).json()).data as { id: number; abbreviation: string | null }[]
    return tanks.find((x) => x.id === t.id)?.abbreviation
  }).toBe('AB1')
})

test('template preview: a caret opens a tank\'s steps, in day order, with their links', async ({ page }) => {
  const id = await templateId('[SEED] Lager with transfer')
  const template = (await (await (await apiAs('brewer1')).get(`/api/production/templates/${id}`)).json()).data as {
    steps: { id: number; vessel_index: number }[]
    links: { from_step_id: number; to_step_id: number }[]
  }
  const first = template.steps.filter((s) => s.vessel_index === 0)
  const firstIds = new Set(first.map((s) => s.id))
  const links = template.links.filter((l) => firstIds.has(l.from_step_id) && firstIds.has(l.to_step_id))

  await page.goto(`/brewery/production/templates/${id}`)
  const preview = page.getByTestId('template-preview')
  await expect(preview).toBeVisible()
  await expect(preview.getByTestId('preview-steps')).toHaveCount(0)
  await page.getByTestId('preview-caret-0').click()
  await expect(page.getByTestId('preview-caret-0')).toHaveAttribute('aria-expanded', 'true')
  const steps = preview.getByTestId('preview-steps')
  await expect(steps.locator('[data-testid^="preview-step-label-"]')).toHaveCount(first.length)
  await expect(steps.locator('[data-testid^="preview-diamond-"]')).toHaveCount(first.length)
  await expect(steps.locator('[data-testid^="preview-link-"]')).toHaveCount(links.length)
  await page.getByTestId('preview-caret-0').click()
  await expect(preview.getByTestId('preview-steps')).toHaveCount(0)
})
