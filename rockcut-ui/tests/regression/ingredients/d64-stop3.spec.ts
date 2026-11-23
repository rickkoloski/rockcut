import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, expectNoSidewaysScroll } from './helpers'
import { stepOf, today, type SBatch } from '../production/schedule'
import { brink, history, pitchFrom, Yeast, yeastProduct } from '../production/yeast'

// D64 Stop 3: the batch page's Yeast section (spec §6.6: pitched from a brink,
// harvested one line per pull with "(on top)", Yeast dumped with its note) and
// Remove on a brink's History (spec §8, A8, lead item 7: the maker or a
// Brewery manager, the latest entry only; the API's refusals show in the
// confirm). [TEST-TEMP] batches and brinks only, cleaned up by id.

test.use({ storageState: authFile('brewer1') })

// Lean: no tank or template of its own (`ingredients` runs beside `production`).
const yeast = new Yeast({ lean: true })
test.afterEach(async () => {
  await yeast.cleanup()
})

/** Check a Yeast harvest step off through the API on its own day. */
async function harvest(b: SBatch, step: string, brinkId: number, lb: string, extra: Record<string, unknown> = {}) {
  const s = stepOf(b, step)
  const us05 = await yeastProduct('US-05')
  const res = await (await apiAs('brewer1')).post(`/api/production/steps/${s.id}/complete`, {
    data: { done_on: s.due_on, yeast_outcome: 'harvested', yeast_brink_id: brinkId, yeast_lb: lb, yeast_product_ids: [us05.id], yeast_generation: 1, ...extra },
  })
  expect(res.status(), await res.text()).toBe(200)
}

async function openHistory(page: Page, brinkId: number) {
  await page.goto('/ingredients/brinks')
  await page.getByTestId(`brink-actions-${brinkId}`).click()
  await page.getByTestId('brink-action-history').click()
  await expect(page.getByTestId('brink-history-dialog')).toBeVisible()
  return page.getByTestId('brink-history-dialog')
}

test('the batch page: pitched from a brink, both pulls (the second on top), and Yeast dumped with its note', async ({ page }) => {
  const [src, tb] = [await yeast.brink('YB-src'), await yeast.brink('YB-pulls')]
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  await harvest(a, 'Yeast harvest', src.id, '40', { yeast_generation: 2 })
  await pitchFrom(src.id, b.id, '38')
  // #B: the first pull into the brink, the second on top of it.
  const [first, second] = [stepOf(b, 'Yeast harvest'), stepOf(b, 'Yeast harvest - #2')]
  const api = await apiAs('brewer1')
  expect((await api.post(`/api/production/steps/${first.id}/complete`, { data: { done_on: first.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_lb: '30' } })).status()).toBe(200)
  expect(
    (await api.post(`/api/production/steps/${second.id}/complete`, { data: { done_on: second.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_lb: '12', yeast_brink_answer: 'on_top' } })).status(),
  ).toBe(200)
  // #A's second step: Yeast dumped.
  const dumped = stepOf(a, 'Yeast harvest - #2')
  expect((await api.post(`/api/production/steps/${dumped.id}/complete`, { data: { done_on: dumped.due_on, yeast_outcome: 'dumped', yeast_note: 'too much trub' } })).status()).toBe(200)

  const short = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
  await page.goto(`/batches/${b.id}`)
  const y = page.getByTestId('batch-yeast')
  await expect(y.getByTestId('batch-yeast-pitched')).toHaveText([`${short(today())} · 38 lb from ${src.name} · US-05 gen 2`])
  await expect(y.getByTestId('batch-yeast-harvested')).toHaveText([`${short(first.due_on)} · 30 lb → ${tb.name}`, `${short(second.due_on)} · 12 lb → ${tb.name} (on top)`])

  await page.goto(`/batches/${a.id}`)
  await expect(page.getByTestId('batch-yeast-harvested')).toHaveText([`${short(stepOf(a, 'Yeast harvest').due_on)} · 40 lb → ${src.name}`])
  await expect(page.getByTestId('batch-yeast-dumped')).toHaveText(`${short(dumped.due_on)} · Yeast dumped · too much trub`)
})

test('Remove: the maker removes the latest pitch (confirm), and the yeast goes back; someone else sees no Remove', async ({ page, browser }) => {
  const tb = await yeast.brink('YB-remove')
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  await harvest(a, 'Yeast harvest', tb.id, '30')
  await pitchFrom(tb.id, b.id, '10')
  const [, pitch] = (await history(tb.id))[0].entries

  // brewer2 didn't make it and isn't a manager: no Remove.
  const other = await browser.newContext({ storageState: authFile('brewer2') })
  const otherPage = await other.newPage()
  const h2 = await openHistory(otherPage, tb.id)
  await expect(h2.getByTestId(`brink-history-entry-${pitch.id}`)).toBeVisible()
  await expect(h2.getByTestId(`brink-history-remove-${pitch.id}`)).toHaveCount(0)
  await other.close()

  const h = await openHistory(page, tb.id)
  // The harvest itself has no Remove (un-check its step).
  await expect(h.locator('[data-testid^="brink-history-remove-"]')).toHaveCount(1)
  await h.getByTestId(`brink-history-remove-${pitch.id}`).click()
  const confirm = page.getByTestId('brink-history-remove-confirm')
  await expect(confirm).toContainText(`Remove the pitch of 10 lb into ${b.label}`)
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(h.getByTestId(`brink-history-entry-${pitch.id}`)).toHaveCount(0)
  expect((await brink(tb.id))!.yeast?.on_hand_lb).toBe('30')
})

test('Remove refused by the API shows why in the confirm: the brink was filled again since', async ({ page }) => {
  const tb = await yeast.brink('YB-again')
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  await harvest(a, 'Yeast harvest', tb.id, '30')
  // The whole 30 lb pitched: the brink empties (dirty); History is opened now.
  await pitchFrom(tb.id, b.id, '30')
  const records = await history(tb.id)
  const emptied = records.find((r) => r.status === 'emptied')!
  const pitch = emptied.entries.find((e) => e.kind === 'pitched')!

  const h = await openHistory(page, tb.id)
  await h.getByTestId(`brink-history-remove-${pitch.id}`).click()
  const confirm = page.getByTestId('brink-history-remove-confirm')
  // #B's harvest starts a new record behind the open dialog (a fresh History offers no Remove: gap 9).
  await harvest(b, 'Yeast harvest', tb.id, '20', { yeast_dirty_ok: true })
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(confirm.getByTestId('brink-history-remove-error')).toHaveText(`${tb.name} has been filled again since, so this can't be removed.`)
  expect((await history(tb.id)).find((r) => r.status === 'emptied')!.entries).toHaveLength(2)
})

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test("the batch page's Yeast section has no sideways scroll", async ({ page }) => {
    const tb = await yeast.brink('YB-phone-page')
    const a = await yeast.brewed('Galactic')
    await harvest(a, 'Yeast harvest', tb.id, '30', { yeast_note: 'a long note about the slurry and how it looked when it came out of the cone' })
    await page.goto(`/batches/${a.id}`)
    await expect(page.getByTestId('batch-yeast-harvested')).toContainText(`30 lb → ${tb.name}`)
    await expectNoSidewaysScroll(page)
  })
})
