import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { expectNoSidewaysScroll } from '../ingredients/helpers'
import { apiAs } from './helpers'
import { batchOf, snack, stepOf } from './schedule'
import { fillHarvest, Yeast, yeastProduct } from './yeast'

// D64 lead decisions 3, gap 6: at 360 px with touch emulation (`isMobile`
// widens the layout to whatever overflows, as a phone does) the Gantt page is
// 360 px wide, and the Harvest dialog and both questions fit and can be tapped.

test.use({ storageState: authFile('brewer1'), viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })

const yeast = new Yeast()
test.afterEach(async () => {
  await yeast.cleanup()
})

test('360 px with touch: the Gantt is no wider than the screen; the Harvest dialog and its questions save by tap', async ({ page }) => {
  test.slow()
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-touch')
  const b = await yeast.brewed('Galactic')
  const api = await apiAs('brewer1')
  // The second pull goes on top, so the has-yeast question is asked.
  const first = stepOf(b, 'Yeast harvest')
  const body = { done_on: first.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_lb: '5', yeast_product_ids: [us05.id], yeast_generation: 1 }
  expect((await api.post(`/api/production/steps/${first.id}/complete`, { data: body })).status()).toBe(200)

  const second = stepOf(await batchOf(b.id), 'Yeast harvest - #2')
  await page.goto(`/brewery/production?step=${second.id}&day=${second.due_on}`)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  expect(await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth])).toEqual([360, 360])
  await page.getByTestId('step-check-off').tap()
  const d = await fillHarvest(page, { lb: '6' })
  const save = d.getByRole('button', { name: 'Save' })
  await save.scrollIntoViewIfNeeded()
  const box = (await save.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(360)
  await expectNoSidewaysScroll(page)
  await save.tap()
  const q = page.getByTestId('harvest-question-has-yeast')
  await expect(q).toBeVisible()
  for (const name of ['This brink is empty', 'Harvest on top']) {
    const r = (await q.getByRole('button', { name }).boundingBox())!
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width).toBeLessThanOrEqual(360)
  }
  await q.getByRole('button', { name: 'Harvest on top' }).tap()
  await expect(snack(page)).toContainText('Yeast harvest - #2 done · 6 lb')
})

test('360 px with touch: the dirty question fits and saves by tap', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-touch-dirty')
  const [a, b] = [await yeast.brewed('Galactic'), await yeast.brewed('Enos')]
  const api = await apiAs('brewer1')
  const first = stepOf(a, 'Yeast harvest')
  await api.post(`/api/production/steps/${first.id}/complete`, {
    data: { done_on: first.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_lb: '5', yeast_product_ids: [us05.id], yeast_generation: 1 },
  })
  await api.post(`/api/yeast/brinks/${tb.id}/dump`, { data: { occurred_on: first.due_on } })

  const s = stepOf(b, 'Yeast harvest - #2')
  await page.goto(`/brewery/production?step=${s.id}&day=${s.due_on}`)
  await page.getByTestId('step-check-off').tap()
  const d = await fillHarvest(page, { brinkId: tb.id, lb: '6', strainId: us05.id })
  await d.getByRole('button', { name: 'Save' }).tap()
  const q = page.getByTestId('harvest-question-dirty')
  const r = (await q.getByRole('button', { name: 'Record anyway' }).boundingBox())!
  expect(r.x + r.width).toBeLessThanOrEqual(360)
  await q.getByRole('button', { name: 'Record anyway' }).tap()
  await expect(snack(page)).toContainText('Yeast harvest - #2 done')
})
