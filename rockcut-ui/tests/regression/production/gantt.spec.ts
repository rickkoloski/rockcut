import { test, expect } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { apiAs, tanks } from './helpers'
import { addDays, addProcess, dayPx, gantt, openGantt, schedule, today } from './schedule'

// D47 §3.6/§3.8 the Gantt as a view: P20, P46–P51, P62–P64, and the Gantt
// side of P1/P2 (row order). Read-only against the [SEED] schedule (the
// statuses are the seed's, relative to the day it was seeded on, so they're
// read from the API and compared with the page).

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1300 } })

  test('P20: tank rows in display order then Unassigned; today line; 6 weeks; every status line', async ({ page }) => {
    await openGantt(page)
    const active = (await tanks()).filter((t) => !t.retired_at)
    const rows = page.locator('[data-testid^="gantt-row-"]')
    await expect(rows).toHaveCount(active.length + 1)
    for (const [i, t] of active.entries()) await expect(rows.nth(i)).toHaveAttribute('data-testid', `gantt-row-${t.id}`)
    await expect(rows.last()).toHaveAttribute('data-testid', 'gantt-row-unassigned')
    // Its header is opaque, like the tanks': the chart doesn't show through when scrolled (minor 2).
    const bg = await page.getByTestId('gantt-unassigned-head').evaluate((e) => getComputedStyle(e).backgroundColor)
    expect(bg).toMatch(/^rgb\(|^rgba\(.*, 1\)$/)
    await expect(page.getByTestId('gantt-today-line')).toBeVisible()
    await expect(page.getByTestId('gantt-zoom')).toHaveText('6 weeks')
    expect(await page.getByTestId('gantt-from').inputValue()).toBe(addDays(today(), -7))

    const sched = await schedule()
    for (const s of sched.statuses) await expect(page.getByTestId(`gantt-status-${s.tank_id}`)).toHaveText(s.line)
  })

  test('P49–P51: the seed’s tank statuses; Serving 1 is dirty with its flag', async ({ page }) => {
    await openGantt(page)
    const sched = await schedule()
    const tank = (name: string) => sched.tanks.find((t) => t.name === name)!.id

    await expect(page.getByTestId(`gantt-tank-batch-${tank('FV4')}`)).toHaveText('· Crusher #42')
    await expect(page.getByTestId(`gantt-status-${tank('FV4')}`)).toHaveText(/^Day \d+ · Fermentation · 68° · set to 58° today$/)
    const fv5 = page.getByTestId(`gantt-status-${tank('FV5')}`)
    await expect(fv5).toHaveText(/ · 32° change late$/)
    // Red, unlike FV4's line.
    const color = (el: typeof fv5) => el.evaluate((e) => getComputedStyle(e).color)
    expect(await color(fv5)).not.toBe(await color(page.getByTestId(`gantt-status-${tank('FV4')}`)))
    await expect(page.getByTestId(`gantt-status-${tank('Serving 1')}`)).toHaveText('Empty · dirty 8 days · no CIP planned')

    await page.getByTestId('gantt-flags').click()
    await expect(page.getByTestId('flags-dialog')).toContainText('Serving 1 was emptied (Crusher #43) and has no CIP planned.')
  })

  test('P46: a tank’s caret lists its steps with links; remembered; Expand all / Collapse all', async ({ page }) => {
    await openGantt(page)
    const sched = await schedule()
    const fv4 = sched.tanks.find((t) => t.name === 'FV4')!.id
    const crusher = sched.batches.find((b) => b.label === 'Crusher #42')!
    await page.getByTestId(`gantt-caret-${fv4}`).click()
    await expect(page.getByTestId(`gantt-caret-${fv4}`)).toHaveAttribute('aria-expanded', 'true')
    const setTemp = crusher.steps.find((s) => s.name === 'Set temp - 58°')!
    await expect(page.getByTestId(`gantt-step-row-${setTemp.id}`)).toBeVisible()
    await expect(page.getByTestId(`gantt-diamond-${setTemp.id}`)).toHaveAttribute('data-state', 'today')
    // Its initials (assigned to brewer1 in the seed) after the name.
    await expect(page.getByTestId(`gantt-diamond-${setTemp.id}`)).toContainText('Set temp - 58° · JB')
    // Solid (move all) and dashed (move only) links.
    await expect(page.locator('[data-testid^="gantt-link-"][data-answer="move_all"]').first()).toBeAttached()
    await expect(page.locator('[data-testid^="gantt-link-"][data-answer="move_only"]').first()).toBeAttached()

    await page.reload()
    await expect(page.getByTestId(`gantt-caret-${fv4}`)).toHaveAttribute('aria-expanded', 'true')
    await page.getByTestId('gantt-collapse-all').click()
    await expect(page.locator('[data-testid^="gantt-step-row-"]')).toHaveCount(0)
    await page.getByTestId('gantt-expand-all').click()
    for (const t of sched.tanks) await expect(page.getByTestId(`gantt-caret-${t.id}`)).toHaveAttribute('aria-expanded', 'true')
    await page.getByTestId('gantt-collapse-all').click()
  })

  test('P47: « shows names only, the full name and status on hover; remembered', async ({ page }) => {
    await openGantt(page)
    const sched = await schedule()
    const fv4 = sched.statuses.find((s) => s.batch_label === 'Crusher #42')!
    const name = sched.tanks.find((t) => t.id === fv4.tank_id)!.name
    // Shown in full as the name's title (minor 6).
    await expect(page.getByTestId(`gantt-tank-name-${fv4.tank_id}`)).toHaveAttribute('title', name)
    await page.getByTestId('gantt-compact').click()
    await expect(gantt(page)).toHaveAttribute('data-compact', 'true')
    await expect(page.getByTestId(`gantt-status-${fv4.tank_id}`)).toHaveCount(0)
    await page.getByTestId(`gantt-tank-name-${fv4.tank_id}`).hover()
    // Names only cuts long names: the tooltip starts with the full one (minor 6).
    await expect(page.getByRole('tooltip')).toHaveText(`${name} · Crusher #42 · ${fv4.line}`)
    await page.reload()
    await expect(gantt(page)).toHaveAttribute('data-compact', 'true')
    await page.getByTestId('gantt-compact').click()
    await expect(page.getByTestId(`gantt-status-${fv4.tank_id}`)).toBeVisible()
  })

  test('P48: zoom 12 weeks, 4 weeks back, From/To; the view is remembered', async ({ page }) => {
    await openGantt(page)
    const wide = await dayPx(page)
    await page.getByTestId('gantt-zoom').click()
    await page.getByTestId('gantt-zoom-12').click()
    expect(await dayPx(page)).toBeLessThan(wide)
    const from = await page.getByTestId('gantt-from').inputValue()
    await page.getByTestId('gantt-back').click()
    await expect(page.getByTestId('gantt-from')).toHaveValue(addDays(from, -28))
    await page.getByTestId('gantt-to').fill(addDays(from, 120))
    await page.reload()
    await expect(page.getByTestId('gantt-zoom')).toHaveText('12 weeks')
    await expect(page.getByTestId('gantt-from')).toHaveValue(addDays(from, -28))
    await expect(page.getByTestId('gantt-to')).toHaveValue(addDays(from, 120))
    // Out of range: refused inline, the range kept to 730 days.
    await page.getByTestId('gantt-to').fill(addDays(from, 900))
    await expect(page.getByTestId('gantt-toolbar')).toContainText('Pick a range of 7 to 730 days.')
    await page.getByTestId('gantt-today').click()
    await expect(page.getByTestId('gantt-from')).toHaveValue(addDays(today(), -7))
  })
})

test.describe('P2 on the Gantt: brewer2 sees the tank order', () => {
  test.use({ storageState: authFile('brewer2') })

  test('the rows follow the Tanks list order', async ({ page }) => {
    await openGantt(page)
    const ids = (await tanks(await apiAs('brewer2'))).filter((t) => !t.retired_at).map((t) => `gantt-row-${t.id}`)
    const shown = await page.locator('[data-testid^="gantt-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(shown).toEqual([...ids, 'gantt-row-unassigned'])
  })
})

for (const persona of ['owner', 'floater'] as PersonaKey[]) {
  test.describe(`P62/P64: ${persona}`, () => {
    test.use({ storageState: authFile(persona) })
    test('full access: the Gantt and Plan batch', async ({ page }) => {
      await openGantt(page)
      await addProcess(page, 'plan')
      await expect(page.getByTestId('plan-dialog')).toBeVisible()
    })
  })
}

test.describe('P63: office1', () => {
  test.use({ storageState: authFile('office1') })
  test('no Production; the typed URL goes Home; the schedule API is 403', async ({ page }) => {
    await page.goto('/brewery/production')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('gantt')).toHaveCount(0)
    expect((await (await apiAs('office1')).get('/api/production/schedule')).status()).toBe(403)
  })
})
