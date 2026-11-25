import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, personas, type PersonaKey } from '../../config/test-env'
import { retireCoded, staffWithCode, type Coded } from '../production/device'
import { apiAs, expectNoSidewaysScroll, expectPhoneDialogClosed, setQuantityDisplay } from './helpers'

// D63 Stop 3 (spec §6, §9, §12 "Settings"): Brewery → Settings, and the [SEED]
// hop. There is one settings row, shared: this project runs one at a time, and
// every test that edits it puts the starting values back through the API, even
// when it fails. Nothing else reads them.

const API = '/api/brewery_settings'
const START: Record<string, string> = {
  boil_temp_f: '202', ibu_equation_hold: 'rc_2026', ibu_equation_print: 'rc_2026', ibu_tolerance: '2', pellet_factor: '1.1',
  hop_stand_temp_f: '170', hop_stand_cooling_min: '15', hop_stand_whirl_min: '20', hop_stand_rest_min: '20',
  whirlpool_whirl_min: '20', whirlpool_rest_min: '20', evaporation_bbl_per_hr: '0.23', kettle_loss_bbl: '0.21', fermenter_loss_bbl: '0.5',
  whirlfloc_tablets_per_bbl: '2', clarity_ferm_ml_per_plato_bbl: '1.3333', zinc_g_per_bbl: '0.09375', pitch_rate: '1.5',
  water_ca_ppm: '20', water_mg_ppm: '3', water_na_ppm: '4', water_co3_ppm: '0', water_hco3_ppm: '18', water_so4_ppm: '2', water_cl_ppm: '3',
}

type Settings = Record<string, string> & { lock_version: number; updated_by: { name: string } | null }
const settings = async (): Promise<Settings> => (await (await (await apiAs('breweryMgr')).get(API)).json()).data
async function save(values: Record<string, string>, as: PersonaKey = 'breweryMgr') {
  const res = await (await apiAs(as)).put(API, { data: { ...values, lock_version: (await settings()).lock_version } })
  expect(res.status(), await res.text()).toBe(200)
}

const value = (page: Page, key: string) => page.getByTestId(`setting-${key}`)
const box = (page: Page, key: string) => page.getByTestId(`setting-input-${key}`).locator('input')
const help = (page: Page, key: string) => page.getByTestId(`setting-input-${key}`).locator('.MuiFormHelperText-root')
const dialog = (page: Page) => page.getByTestId('brewery-settings-dialog')
const alert = (page: Page) => page.getByTestId('brewery-settings-dialog-error')
const saveButton = (page: Page) => dialog(page).getByRole('button', { name: 'Save' })
const changed = (page: Page) => page.getByTestId('brewery-settings-changed')

async function open(page: Page) {
  await page.goto('/brewery/settings')
  await expect(value(page, 'boil_temp_f')).toBeVisible()
}
async function edit(page: Page) {
  await page.getByTestId('brewery-settings-edit').click()
  await expect(dialog(page)).toBeVisible()
}
const as = async (browser: Browser, persona: PersonaKey) => (await browser.newContext({ storageState: authFile(persona) })).newPage()

async function expectEveryValue(page: Page) {
  const shown: Record<string, string> = {
    boil_temp_f: '202 °F', ibu_equation_hold: 'RC 2026', ibu_equation_print: 'RC 2026', ibu_tolerance: '2 IBU', pellet_factor: '1.1',
    hop_stand_temp_f: '170 °F', hop_stand_cooling_min: '15 min', hop_stand_whirl_min: '20 min', hop_stand_rest_min: '20 min',
    whirlpool_whirl_min: '20 min', whirlpool_rest_min: '20 min', evaporation_bbl_per_hr: '0.23 bbl/hr', kettle_loss_bbl: '0.21 bbl', fermenter_loss_bbl: '0.5 bbl',
    whirlfloc_tablets_per_bbl: '2 tablets/bbl', clarity_ferm_ml_per_plato_bbl: '1.3333 mL/°P/bbl', zinc_g_per_bbl: '0.75 g per 8 bbl', pitch_rate: '1.5 M cells/mL/°P',
    water_ca_ppm: '20 ppm', water_mg_ppm: '3 ppm', water_na_ppm: '4 ppm', water_co3_ppm: '0 ppm', water_hco3_ppm: '18 ppm', water_so4_ppm: '2 ppm', water_cl_ppm: '3 ppm',
  }
  for (const [key, text] of Object.entries(shown)) await expect(value(page, key), key).toHaveText(text)
  for (const title of ['Boil and hops', 'Volumes', 'Additions', 'Yeast', 'Source water: Estes Summer']) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByTestId('brewery-settings-notes')).toContainText('Used by recipes.')
  await expect(page.getByTestId('brewery-settings-notes')).toContainText('Recipes start using these in an upcoming release.')
}

test.describe('Settings', () => {
  test.beforeEach(() => save(START))
  test.afterEach(() => save(START))

  test.describe('as brewer1', () => {
    test.use({ storageState: authFile('brewer1') })

    test('every value from the Brewery nav, no Edit and no fields; the API refuses a save', async ({ page }) => {
      await page.goto('/brewery/production')
      await page.locator('.MuiDrawer-paper:visible').getByText('Settings', { exact: true }).click()
      await expect(page).toHaveURL(/\/brewery\/settings$/)
      await expectEveryValue(page)
      await expect(page.getByTestId('brewery-settings-edit')).toHaveCount(0)
      await expect(page.locator('main').getByRole('textbox')).toHaveCount(0)
      const res = await (await apiAs('brewer1')).put(API, { data: { pitch_rate: '1', lock_version: (await settings()).lock_version } })
      expect(res.status()).toBe(403)
      expect((await settings()).pitch_rate).toBe('1.5')
    })

    test('no "Last changed" before anyone has', async ({ page }) => {
      await page.route(`**${API}`, async (route) => {
        const res = await route.fetch()
        const body = await res.json()
        await route.fulfill({ response: res, json: { ...body, data: { ...body.data, updated_by: null } } })
      })
      await open(page)
      await expect(changed(page)).toHaveCount(0)
    })
  })

  test.describe('as breweryMgr', () => {
    test.use({ storageState: authFile('breweryMgr') })

    test('IBU tolerance to 1.5: kept after a reload with "Last changed by"; only it is sent', async ({ page }) => {
      await open(page)
      await edit(page)
      await box(page, 'ibu_tolerance').fill('1.5')
      const sent = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith(API))
      await saveButton(page).click()
      expect(Object.keys((await sent).postDataJSON()).sort()).toEqual(['ibu_tolerance', 'lock_version'])
      await expect(dialog(page)).toHaveCount(0)
      await page.reload()
      await expect(value(page, 'ibu_tolerance')).toHaveText('1.5 IBU')
      await expect(changed(page)).toHaveText(new RegExp(`^Last changed by ${personas.breweryMgr.name} on [A-Z][a-z]{2} \\d{1,2}, \\d{4}$`))
    })

    test('equations, and zinc typed per 8 bbl is stored per bbl', async ({ page }) => {
      await open(page)
      await edit(page)
      await page.getByTestId('setting-input-ibu_equation_print').getByRole('combobox').click()
      await expect(page.getByRole('option')).toHaveText(['RC 2026', 'Tinseth', 'Modified Tinseth'])
      await page.getByRole('option', { name: 'Modified Tinseth' }).click()
      await box(page, 'zinc_g_per_bbl').fill('0.8')
      await saveButton(page).click()
      await expect(value(page, 'zinc_g_per_bbl')).toHaveText('0.8 g per 8 bbl')
      await expect(value(page, 'ibu_equation_print')).toHaveText('Modified Tinseth')
      expect(await settings()).toMatchObject({ zinc_g_per_bbl: '0.1', ibu_equation_print: 'modified_tinseth', clarity_ferm_ml_per_plato_bbl: '1.3333' })
    })

    test('opening and saving without a change writes nothing; another change leaves zinc and Clarity Ferm', async ({ page }) => {
      await save({ zinc_g_per_bbl: '0.09376' })
      const before = await settings()
      await open(page)
      await edit(page)
      await saveButton(page).click()
      await expect(dialog(page)).toHaveCount(0)
      expect(await settings()).toEqual(before)
      await edit(page)
      await box(page, 'boil_temp_f').fill('203')
      await saveButton(page).click()
      await expect(dialog(page)).toHaveCount(0)
      expect(await settings()).toMatchObject({ boil_temp_f: '203', zinc_g_per_bbl: '0.09376', clarity_ferm_ml_per_plato_bbl: '1.3333' })
    })

    test('250, text, a comma decimal and empty are refused with the limits; the form stays with what was typed', async ({ page }) => {
      const before = await settings()
      await open(page)
      await edit(page)
      for (const bad of ['250', 'hot', '200,5', '', '179.9', '212.1']) {
        await box(page, 'boil_temp_f').fill(bad)
        await saveButton(page).click()
        await expect(alert(page)).toContainText('Boil temperature must be between 180 and 212 °F')
        await expect(box(page, 'boil_temp_f')).toHaveValue(bad)
      }
      await box(page, 'boil_temp_f').fill('202')
      await expect(alert(page)).toHaveCount(0)
      await box(page, 'zinc_g_per_bbl').fill('40.01')
      await saveButton(page).click()
      await expect(alert(page)).toContainText('Zinc (kettle volume) must be between 0 and 40 g per 8 bbl')
      expect(await settings()).toEqual(before)
      await box(page, 'zinc_g_per_bbl').fill('40')
      await box(page, 'boil_temp_f').fill('212')
      await saveButton(page).click()
      await expect(dialog(page)).toHaveCount(0)
      expect(await settings()).toMatchObject({ zinc_g_per_bbl: '5', boil_temp_f: '212' })
    })

    test('a refusal only the API makes is shown, the form kept', async ({ page }) => {
      await open(page)
      await edit(page)
      await page.route(`**${API}`, (route) =>
        route.request().method() === 'PUT' ? route.fulfill({ status: 422, json: { errors: { pitch_rate: ['Pitch rate must be between 0.1 and 5 M cells/mL/°P'] } } }) : route.fallback(),
      )
      await box(page, 'pitch_rate').fill('2')
      await saveButton(page).click()
      await expect(alert(page)).toHaveText('Pitch rate must be between 0.1 and 5 M cells/mL/°P')
      await expect(box(page, 'pitch_rate')).toHaveValue('2')
    })

    test('two editors: the second save is refused with a sentence and the current values, the typing kept; then it saves', async ({ page }) => {
      await open(page)
      await edit(page)
      await box(page, 'ibu_tolerance').fill('3')
      await box(page, 'pitch_rate').fill('1')
      await save({ ibu_tolerance: '1.5', boil_temp_f: '204' }, 'owner')
      await saveButton(page).click()
      await expect(alert(page)).toContainText('Someone else changed the settings since you opened them.')
      await expect(box(page, 'ibu_tolerance')).toHaveValue('3')
      await expect(help(page, 'ibu_tolerance')).toHaveText('Now: 1.5 IBU')
      await expect(box(page, 'pitch_rate')).toHaveValue('1')
      await expect(box(page, 'boil_temp_f')).toHaveValue('204')
      expect(await settings()).toMatchObject({ ibu_tolerance: '1.5', pitch_rate: '1.5', boil_temp_f: '204' })
      // Cancel leaves the page on the current values, and Edit works.
      await dialog(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(value(page, 'ibu_tolerance')).toHaveText('1.5 IBU')
      await expect(changed(page)).toContainText(personas.owner.name)
      await edit(page)
      await box(page, 'ibu_tolerance').fill('4')
      await saveButton(page).click()
      await expect(value(page, 'ibu_tolerance')).toHaveText('4 IBU')
    })

    test('two editors: Save again from the refused form keeps the other change', async ({ page }) => {
      await open(page)
      await edit(page)
      await box(page, 'ibu_tolerance').fill('3')
      await save({ ibu_tolerance: '1.5', boil_temp_f: '204' }, 'owner')
      await saveButton(page).click()
      await expect(alert(page)).toBeVisible()
      await saveButton(page).click()
      await expect(dialog(page)).toHaveCount(0)
      expect(await settings()).toMatchObject({ ibu_tolerance: '3', boil_temp_f: '204' })
    })

    test('a slow network: a double-click on Save writes once', async ({ page }) => {
      await open(page)
      await edit(page)
      let puts = 0
      await page.route(`**${API}`, async (route) => {
        if (route.request().method() === 'PUT') {
          puts += 1
          await new Promise((r) => setTimeout(r, 1500))
        }
        await route.fallback()
      })
      await box(page, 'ibu_tolerance').fill('1.5')
      const version = (await settings()).lock_version
      await saveButton(page).dblclick()
      await expect(dialog(page)).toHaveCount(0, { timeout: 10_000 })
      expect(puts).toBe(1)
      expect((await settings()).lock_version).toBe(version + 1)
    })

    test('360 px: no sideways scroll; Back closes Edit, drops what was typed and stays on the page', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await open(page)
      await expectNoSidewaysScroll(page)
      await edit(page)
      expect(await dialog(page).locator('.MuiDialogContent-root').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0)
      await box(page, 'ibu_tolerance').fill('9')
      await page.goBack()
      await expectPhoneDialogClosed(page, dialog(page))
      await expect(page).toHaveURL(/\/brewery\/settings$/)
      await expect(value(page, 'ibu_tolerance')).toHaveText('2 IBU')
      await edit(page)
      await expect(box(page, 'ibu_tolerance')).toHaveValue('2')
      await box(page, 'ibu_tolerance').fill('1.5')
      await saveButton(page).click()
      await expectPhoneDialogClosed(page, dialog(page))
      await expect(value(page, 'ibu_tolerance')).toHaveText('1.5 IBU')
    })
  })

  test('as owner: edits', async ({ browser }) => {
    const page = await as(browser, 'owner')
    await open(page)
    await edit(page)
    await box(page, 'ibu_tolerance').fill('2.5')
    await saveButton(page).click()
    await expect(value(page, 'ibu_tolerance')).toHaveText('2.5 IBU')
    await expect(changed(page)).toContainText(personas.owner.name)
    await page.context().close()
  })

  test.describe('as the brewhouse device', () => {
    test.use({ storageState: authFile('breweryDevice') })
    let coded: Coded | null = null
    test.afterEach(() => retireCoded([coded]))

    test('in its nav with every value, no Edit, no code asked; the PUT is 403, with a manager’s code too', async ({ page }) => {
      await page.goto('/tasks/brewery')
      const nav = page.locator('.MuiDrawer-paper:visible')
      await nav.getByText('Brewery', { exact: true }).click()
      await nav.getByText('Settings', { exact: true }).click()
      await expect(page).toHaveURL(/\/brewery\/settings$/)
      await expectEveryValue(page)
      await expect(page.getByTestId('brewery-settings-edit')).toHaveCount(0)
      await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)

      coded = await staffWithCode('D63 mgr')
      const promoted = await (await apiAs('owner')).put(`/api/users/${coded.person.id}/memberships`, { data: { memberships: [{ department: 'brewery', role: 'manager' }] } })
      expect(promoted.status(), await promoted.text()).toBe(200)
      const lock_version = (await settings()).lock_version
      for (const extra of [{}, { staff_code: coded.code }]) {
        const res = await (await apiAs('breweryDevice')).put(API, { data: { pitch_rate: '1', lock_version, ...extra } })
        expect(res.status()).toBe(403)
      }
      expect((await settings()).pitch_rate).toBe('1.5')
    })
  })

  for (const who of ['bartender1', 'office1', 'barMgr'] as const) {
    test(`${who}: no nav entry, the URL goes Home, the API is 403`, async ({ browser }) => {
      const page = await as(browser, who)
      await page.goto('/brewery/settings')
      await expect(page).toHaveURL(/\/$/)
      await expect(page.locator('.MuiDrawer-paper').first().getByText('Home', { exact: true })).toBeVisible()
      await expect(page.locator('.MuiDrawer-paper').first().getByText('Settings', { exact: true })).toHaveCount(0)
      const api = await apiAs(who)
      expect((await api.get(API)).status()).toBe(403)
      expect((await api.put(API, { data: { lock_version: 1 } })).status()).toBe(403)
      await page.context().close()
    })
  }

  test('a Taproom device: no nav entry, no page, the API is 403', async ({ browser }) => {
    const page = await as(browser, 'taproomDevice')
    await page.goto('/brewery/settings')
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await expect(page.getByTestId('brewery-settings-notes')).toHaveCount(0)
    await expect(page.locator('.MuiDrawer-paper').first().getByText('Settings', { exact: true })).toHaveCount(0)
    const api = await apiAs('taproomDevice')
    expect((await api.get(API)).status()).toBe(403)
    expect((await api.put(API, { data: { lock_version: 1 } })).status()).toBe(403)
    await page.context().close()
  })
})

// §9: read only. Nothing here moves, counts or reorders it.
test.describe('the [SEED] hop', () => {
  test.use({ storageState: authFile('brewer1') })
  const LIST = 'use-order-t90-pellet'
  const setHide = async (hide: boolean) =>
    expect((await (await apiAs('brewer1')).put('/api/me/board_settings/ingredients', { data: { hide_used_up_lots: hide } })).status()).toBe(200)
  test.beforeEach(async () => {
    await setQuantityDisplay('brewer1', 'lb')
    await setHide(true)
  })
  test.afterEach(async () => {
    await setQuantityDisplay('brewer1', 'packs')
    await setHide(true)
  })

  async function openHop(page: Page) {
    const hops = (await (await (await apiAs('brewer1')).get('/api/ingredients')).json()).data as { id: number; name: string }[]
    await page.goto(`/ingredients/${hops.find((h) => h.name === '[SEED] Summit Cone')!.id}`)
    await expect(page.getByTestId(`${LIST}-section`)).toBeVisible()
  }
  const rows = (page: Page) => page.locator(`[data-testid^="${LIST}-row-"]`)

  test('the expired lot is skipped, the next reads "In use", and the used-up one is behind the switch', async ({ page }) => {
    await openHop(page)
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).nth(0)).toContainText('BSG · Lot [SEED] Summit Cone B')
    await expect(rows(page).nth(0)).toContainText('22 lb')
    await expect(rows(page).nth(0)).toContainText(/expired/i)
    await expect(rows(page).nth(0)).not.toContainText('In use')
    await expect(rows(page).nth(1)).toContainText('Yakima Chief Hops · Lot [SEED] Summit Cone C')
    await expect(rows(page).nth(1)).toContainText('In use')
    await expect(page.getByTestId(`${LIST}-used-up`)).toHaveCount(0)
    await page.getByTestId('hide-used-up').click()
    await expect(page.getByTestId(`${LIST}-used-up`)).toContainText('[SEED] Summit Cone A')
    await expect(rows(page)).toHaveCount(2)
  })

  test('the switch and the packs / total toggle both survive a reload, whichever was changed last', async ({ page }) => {
    await openHop(page)
    const saved = () => page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith('/api/me/board_settings/ingredients'))
    const toggle = (name: RegExp) => page.getByTestId('quantity-toggle').first().getByRole('button', { name })
    let done = saved()
    await page.getByTestId('hide-used-up').click()
    expect((await (await done).request().postDataJSON())).toEqual({ hide_used_up_lots: false })
    await page.reload()
    await expect(page.getByTestId('hide-used-up')).not.toBeChecked()
    await expect(rows(page).nth(1)).toContainText('33 lb')

    done = saved()
    await toggle(/box/i).click()
    expect((await (await done).request().postDataJSON())).toEqual({ quantity_display: 'packs' })
    await page.reload()
    await expect(page.getByTestId('hide-used-up')).not.toBeChecked()
    await expect(rows(page).nth(1)).toContainText('3 boxes')
  })
})
