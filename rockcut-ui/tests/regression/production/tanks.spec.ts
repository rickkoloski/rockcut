import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { activeTankIds, createTank, openBreweryNav, retireTanks, shortTag, tanks } from './helpers'
import { addDays, Made, today } from './schedule'

const madeSchedule = new Made()

// D46 §3.2 Tanks page: P1–P5. Each test makes its own [TEST-TEMP] tank and
// retires it; the active order is put back afterwards.

let order: number[] = []
const made: number[] = []

test.beforeAll(async () => {
  order = await activeTankIds()
})
test.afterAll(async () => {
  await madeSchedule.cleanup()
  await retireTanks(made.splice(0), order)
})

const names = (page: Page) => page.locator('[data-testid^="tank-name-"]')

test.describe('as brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('P1: Add a tank; it is listed last and persists', async ({ page }) => {
    const name = shortTag('FV8')
    await page.goto('/brewery/production')
    await page.getByTestId('gantt-setup').click()
    await page.getByTestId('gantt-setup-tanks').click()
    await expect(page).toHaveURL(/\/brewery\/production\/tanks$/)
    await page.getByTestId('tank-add').click()
    await page.getByTestId('tank-name').fill(name)
    await page.getByTestId('tank-kind').click()
    await page.getByTestId('tank-kind-unitank').click()
    await page.getByTestId('tank-capacity').fill('30')
    await page.getByTestId('tank-location').click()
    await page.getByTestId('tank-location-brewhouse').click()
    await page.getByTestId('tank-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('tank-dialog')).toBeHidden()
    await expect(names(page).last()).toHaveText(name)

    await page.reload()
    await expect(names(page).last()).toHaveText(name)
    const saved = (await tanks()).find((t) => t.name === name)!
    made.push(saved.id)
    expect(saved).toMatchObject({ kind: 'unitank', capacity_bbl: 30, location: 'brewhouse', retired_at: null })
    await expect(page.getByTestId(`tank-name-${saved.id}`).locator('..')).toContainText('Unitank · 30 bbl · Brewhouse')
  })

  test('P3: a duplicate name (any case) is refused inline', async ({ page }) => {
    await page.goto('/brewery/production/tanks')
    await page.getByTestId('tank-add').click()
    await page.getByTestId('tank-name').fill('fv1')
    await page.getByTestId('tank-capacity').fill('20')
    await page.getByTestId('tank-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('tank-dialog')).toContainText('A tank named FV1 already exists.')
    await expect(page.getByTestId('tank-dialog')).toBeVisible()
    expect((await tanks()).filter((t) => t.name.toLowerCase() === 'fv1')).toHaveLength(1)
  })

  test('P5: Retire an empty tank; it leaves the list; Restore brings it back last', async ({ page }) => {
    const tank = await createTank(shortTag('FV9'))
    made.push(tank.id)
    await page.goto('/brewery/production/tanks')
    await page.getByTestId(`tank-retire-${tank.id}`).click()
    await expect(page.getByRole('dialog')).toContainText(`Retire ${tank.name}? It leaves the schedule. Batches that used it keep its name.`)
    await page.getByRole('dialog').getByRole('button', { name: 'Retire' }).click()
    await expect(page.getByTestId(`tank-name-${tank.id}`)).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId(`tank-name-${tank.id}`)).toHaveCount(0)
    await page.getByTestId('tanks-retired-toggle').click()
    await expect(page.getByTestId(`tank-retired-row-${tank.id}`)).toBeVisible()
    // "Last" means after every tank active before it came back: other tests
    // (and people, on DEV) may add tanks meanwhile, after it.
    const before = await activeTankIds()
    const restored = page.waitForResponse((r) => r.url().endsWith(`/api/production/tanks/${tank.id}/restore`))
    await page.getByTestId(`tank-restore-${tank.id}`).click()
    expect((await restored).status()).toBe(200)
    await expect(page.getByTestId(`tank-name-${tank.id}`)).toHaveText(tank.name)
    const shown = await names(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    const at = shown.indexOf(`tank-name-${tank.id}`)
    for (const id of before) expect(shown.indexOf(`tank-name-${id}`)).toBeLessThan(at)
    const after = await activeTankIds()
    for (const id of before) expect(after.indexOf(id)).toBeLessThan(after.indexOf(tank.id))
    expect((await tanks()).find((t) => t.id === tank.id)!.retired_at).toBeNull()
  })

  test('P4: Retire refused while steps are planned in the tank: the batches are listed', async ({ page }) => {
    // D47: a real batch planned in the tank (it was stubbed in D46).
    const tank = await createTank(shortTag('FV7 busy'))
    made.push(tank.id)
    const brand = await madeSchedule.brand('Fest')
    const batch = await madeSchedule.plan({ brand_id: brand.id, template: '[SEED] Standard ale', brew_on: addDays(today(), 3), tank_ids: [tank.id] })
    await page.goto('/brewery/production/tanks')
    await page.getByTestId(`tank-retire-${tank.id}`).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Retire' }).click()
    await expect(page.getByTestId('tanks-error')).toHaveText(`Unfinished steps are planned in this tank: ${batch.label}. Move them first.`)
    await expect(page.getByTestId(`tank-name-${tank.id}`)).toBeVisible()
    // The batch goes first, then the tank can be retired (afterAll).
    await madeSchedule.cleanup()
  })
})

test.describe('P2: reorder', () => {
  // Tall enough for every tank row: the drag uses on-screen coordinates.
  test.use({ storageState: authFile('brewer1'), viewport: { width: 1280, height: 1400 } })

  test('the arrows and a drag move a tank; the order persists for brewer2 too', async ({ page, browser }) => {
    const tank = await createTank(shortTag('FV8 order'))
    made.push(tank.id)
    await page.goto('/brewery/production/tanks')
    await expect(names(page).last()).toHaveText(tank.name)

    // Up once with the arrow…
    const before = await activeTankIds()
    await page.getByTestId(`tanks-list-up-${tank.id}`).click()
    await expect(names(page).nth(before.length - 2)).toHaveText(tank.name)
    await expect.poll(async () => (await activeTankIds()).indexOf(tank.id)).toBe(before.length - 2)

    // …then dragged by its handle above the first tank.
    const handle = page.getByTestId(`tanks-list-handle-${tank.id}`)
    const from = (await handle.boundingBox())!
    const top = (await page.locator('[data-testid^="tanks-list-row-"]').first().boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 5 })
    // Over the upper part of the first row: it lands above it.
    await page.mouse.move(from.x + from.width / 2, top.y + top.height / 4, { steps: 25 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(names(page).first()).toHaveText(tank.name)
    await expect.poll(async () => (await activeTankIds())[0]).toBe(tank.id)

    await page.reload()
    await expect(names(page).first()).toHaveText(tank.name)

    const other = await browser.newContext({ storageState: authFile('brewer2') })
    const page2 = await other.newPage()
    await page2.goto('/brewery/production/tanks')
    await expect(names(page2).first()).toHaveText(tank.name)
    await other.close()
  })
})

test.describe('the Gantt and its Set up menu (D47)', () => {
  test.use({ storageState: authFile('brewer1') })

  test('Brewery → Production opens the Gantt; Set up reaches the setup pages; no Batches entry', async ({ page }) => {
    await openBreweryNav(page, 'Production')
    await expect(page).toHaveURL(/\/brewery\/production$/)
    await expect(page.getByTestId('gantt')).toBeVisible()
    await expect(page.getByTestId('gantt-row-unassigned')).toBeVisible()
    await expect(page.locator('.MuiDrawer-paper:visible').getByText('Batches', { exact: true })).toHaveCount(0)

    // P1: the tanks in display order are the Gantt's rows, then Unassigned.
    const active = (await tanks()).filter((t) => !t.retired_at)
    const rows = page.locator('[data-testid^="gantt-row-"]')
    await expect(rows).toHaveCount(active.length + 1)
    await expect(rows.last()).toHaveAttribute('data-testid', 'gantt-row-unassigned')
    await expect(rows.nth(active.length - 1)).toHaveAttribute('data-testid', `gantt-row-${active.at(-1)!.id}`)

    for (const [item, url] of [
      ['gantt-setup-tanks', /\/tanks$/],
      ['gantt-setup-templates', /\/templates$/],
      ['gantt-setup-lists', /\/lists$/],
    ] as const) {
      await page.goto('/brewery/production')
      await page.getByTestId('gantt-setup').click()
      await page.getByTestId(item).click()
      await expect(page).toHaveURL(url)
    }
  })
})
