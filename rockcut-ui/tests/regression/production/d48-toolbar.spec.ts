import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, addProcess, gantt, openGantt, schedule, today } from './schedule'
import { choiceOptions, pickSetting, settingValue } from '../settingsMenu'

// D48 Task 0 (§3.6 "Toolbar changes in D48"): Today, the zoom menu, the
// Collapse all | ● | Expand all switch, Add process ▾ and the compact
// expanded rows (P118–P121). Read-only against the [SEED] schedule; the
// view is remembered per browser, so each test starts in a fresh context.
// D52: the zoom and the tanks switch are choices in the settings gear
// ("Weeks on screen", "Tanks"); "Your selection" is offered once there's a mix.

const GEAR = 'gantt-settings'
const MODE = { collapse: 'Collapse all', mine: 'Your selection', expand: 'Expand all' } as const
const tanksMode = (page: Page) => settingValue(page, GEAR, 'gantt-expand')
const setTanks = (page: Page, mode: keyof typeof MODE) => pickSetting(page, GEAR, 'gantt-expand', mode)

const range = async (page: Page) => ({ from: await page.getByTestId('gantt-from').inputValue(), to: await page.getByTestId('gantt-to').inputValue() })

async function pickZoom(page: Page, weeks: number) {
  await pickSetting(page, GEAR, 'gantt-zoom', weeks)
  expect(await settingValue(page, GEAR, 'gantt-zoom')).toBe(`${weeks} weeks`)
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1300 } })

  test('P118: Today is a week back plus the zoom, and always scrolls back', async ({ page }) => {
    await openGantt(page)
    // The first visit opens the same way.
    expect(await range(page)).toEqual({ from: addDays(today(), -7), to: addDays(today(), 42) })
    const scroller = gantt(page)
    // Already a week back: Today used to do nothing (the D47 no-op); now it scrolls.
    await scroller.evaluate((e) => (e.scrollLeft = e.scrollWidth))
    expect(await scroller.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0)
    await page.getByTestId('gantt-today').click()
    await expect.poll(() => scroller.evaluate((e) => e.scrollLeft)).toBe(0)

    // Somewhere else, then Today.
    await page.getByTestId('gantt-forward').click()
    await scroller.evaluate((e) => (e.scrollLeft = e.scrollWidth))
    await page.getByTestId('gantt-today').click()
    expect(await range(page)).toEqual({ from: addDays(today(), -7), to: addDays(today(), 42) })
    await expect.poll(() => scroller.evaluate((e) => e.scrollLeft)).toBe(0)

    // 2 weeks keeps the start; Today: a week back plus 2 weeks.
    await page.getByTestId('gantt-back').click()
    const from = (await range(page)).from
    await pickZoom(page, 2)
    expect(await range(page)).toEqual({ from, to: addDays(from, 21) })
    await page.getByTestId('gantt-today').click()
    expect(await range(page)).toEqual({ from: addDays(today(), -7), to: addDays(today(), 14) })
  })

  test('P119: the Tanks setting follows the carets; Your selection restores the mix; remembered', async ({ page }) => {
    await openGantt(page)
    const sched = await schedule()
    const [a, b] = sched.tanks.slice(0, 2).map((t) => t.id)
    const caret = (id: number) => page.getByTestId(`gantt-caret-${id}`)

    await setTanks(page, 'collapse')
    expect(await tanksMode(page)).toBe(MODE.collapse)
    // No mix yet: Your selection isn't offered.
    expect(await choiceOptions(page, GEAR, 'gantt-expand')).not.toContain('gantt-expand-mine')

    await caret(a).click()
    await expect(caret(a)).toHaveAttribute('aria-expanded', 'true')
    expect(await tanksMode(page)).toBe(MODE.mine)
    await caret(b).click()

    await setTanks(page, 'collapse')
    await expect(page.locator('[data-testid^="gantt-step-row-"]')).toHaveCount(0)
    expect(await tanksMode(page)).toBe(MODE.collapse)

    await setTanks(page, 'mine')
    expect(await tanksMode(page)).toBe(MODE.mine)
    for (const t of sched.tanks) await expect(caret(t.id)).toHaveAttribute('aria-expanded', String(t.id === a || t.id === b))

    await page.reload()
    // The rows load first (slower on DEV); with none yet the setting reads Collapse all.
    await expect(caret(a)).toHaveAttribute('aria-expanded', 'true')
    expect(await tanksMode(page)).toBe(MODE.mine)
    // After Expand all and back, Your selection still reopens exactly the mix.
    await setTanks(page, 'expand')
    expect(await tanksMode(page)).toBe(MODE.expand)
    await setTanks(page, 'mine')
    for (const t of sched.tanks) await expect(caret(t.id)).toHaveAttribute('aria-expanded', String(t.id === a || t.id === b))

    // Opening every tank by its caret moves the setting to Expand all (Unassigned has no caret).
    for (const t of sched.tanks) if (t.id !== a && t.id !== b) await caret(t.id).click()
    expect(await tanksMode(page)).toBe(MODE.expand)
    await setTanks(page, 'collapse')
  })

  test('P120: the zoom menu and Add process ▾, by mouse and keyboard; the old buttons are gone', async ({ page }) => {
    await openGantt(page)
    const from = (await range(page)).from
    await pickZoom(page, 12)
    expect(await range(page)).toEqual({ from, to: addDays(from, 91) })

    // No separate 2/6/12, Plan batch or Add CIP buttons in the toolbar.
    const toolbar = page.getByTestId('gantt-toolbar')
    for (const id of ['gantt-zoom-2', 'gantt-zoom-6', 'gantt-plan', 'gantt-add-cip']) await expect(toolbar.getByTestId(id)).toHaveCount(0)

    await addProcess(page, 'plan')
    await expect(page.getByTestId('plan-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('plan-dialog')).toHaveCount(0)
    await addProcess(page, 'cip')
    await expect(page.getByTestId('cip-add-dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    // Keyboard: Enter opens the gear on its first setting; Enter opens the weeks,
    // arrows move, Enter picks (focus back on the heading), Escape closes.
    await page.getByTestId(GEAR).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('gantt-zoom')).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('gantt-zoom-2')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('gantt-zoom-6')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('gantt-zoom')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    expect(await settingValue(page, GEAR, 'gantt-zoom')).toBe('6 weeks')
    await page.getByTestId('gantt-add-process').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('gantt-plan')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('gantt-add-cip')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('gantt-add-cip')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('gantt-plan')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('plan-dialog')).toBeVisible()
  })

  test('P121: compact step rows with a mouse; phases indented a little, steps more; diamonds and links line up', async ({ page }) => {
    await openGantt(page)
    const sched = await schedule()
    const crusher = sched.batches.find((b) => b.label === 'Crusher #42')!
    const fv4 = sched.tanks.find((t) => t.name === 'FV4')!.id
    await page.getByTestId(`gantt-caret-${fv4}`).click()
    const marker = crusher.steps.find((s) => s.marker)!
    const step = crusher.steps.find((s) => !s.marker && s.name.startsWith('Set temp'))!

    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!
    expect((await box(`gantt-step-row-${step.id}`)).height).toBeCloseTo(20, 0)
    // From the column's edge: the tank's caret at 8 px, phases ~8 px further, steps ~20 px.
    const edge = (await box(`gantt-row-${fv4}`)).x
    const phaseIndent = (await box(`gantt-step-label-${marker.id}`)).x - edge
    const stepIndent = (await box(`gantt-step-label-${step.id}`)).x - edge
    expect(phaseIndent).toBeCloseTo(16, 0)
    expect(stepIndent).toBeCloseTo(28, 0)

    // The diamond sits in its row, centred.
    const row = await box(`gantt-step-row-${step.id}`)
    const dia = await box(`gantt-diamond-${step.id}`)
    expect(Math.abs(dia.y + dia.height / 2 - (row.y + row.height / 2))).toBeLessThanOrEqual(2)
    // A link's ends sit on its rows' centres.
    const link = crusher.links.find((l) => l.from_step_id === step.id || l.to_step_id === step.id)
    if (link) {
      const lb = await box(`gantt-link-${link.id}`)
      const centers = [link.from_step_id, link.to_step_id].map(async (id) => {
        const r = await box(`gantt-step-row-${id}`)
        return r.y + r.height / 2
      })
      const [ya, yb] = await Promise.all(centers)
      // The path's box takes in its stroke, the same on both sides.
      expect(Math.abs(lb.y + lb.height / 2 - (ya + yb) / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(lb.height - Math.abs(yb - ya))).toBeLessThanOrEqual(6)
    }

    // Phone width: 28 px rows, the same indents.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(async () => (await box(`gantt-step-row-${step.id}`)).height).toBeCloseTo(28, 0)
    expect((await box(`gantt-step-label-${step.id}`)).x - (await box(`gantt-row-${fv4}`)).x).toBeCloseTo(stepIndent, 0)
    await page.getByTestId(`gantt-caret-${fv4}`).click()
  })
})

test.describe('touch', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 1280, height: 900 }, hasTouch: true, isMobile: true })

  test('P121: a touch screen keeps 28 px rows', async ({ page }) => {
    await openGantt(page)
    const sched = await schedule()
    const fv4 = sched.tanks.find((t) => t.name === 'FV4')!.id
    const step = sched.batches.find((b) => b.label === 'Crusher #42')!.steps.find((s) => !s.marker)!
    await page.getByTestId(`gantt-caret-${fv4}`).click()
    expect((await page.getByTestId(`gantt-step-row-${step.id}`).boundingBox())!.height).toBeCloseTo(28, 0)
  })
})
