import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  addDays,
  apiAs,
  dailyCard,
  denverToday,
  mouseDrag,
  openBoard,
  setBoardCheck,
  setCheck,
  type ApiDailyCard,
} from './taskBoardHelpers'

// D38 §3.8 Daily card, scenarios S24–S27: ticking today and past days, future
// days disabled, the amber count, and a card that never drags. Each test puts
// the checks it touched back as they were (re-ticked as breweryMgr).

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 2200 } })

const touched: { date: string; id: number; checked: boolean }[] = []
test.afterEach(async () => {
  const api = await apiAs('breweryMgr')
  for (const t of touched.splice(0).reverse()) await setCheck(api, t.date, t.id, t.checked)
})

/** Set a check for the test, remembering how it was. */
async function prepare(card: ApiDailyCard, name: string, checked: boolean) {
  const item = card.items.find((i) => i.name === name)!
  touched.push({ date: card.date, id: item.daily_item_id, checked: item.checked })
  if (item.checked !== checked) await setCheck(await apiAs('breweryMgr'), card.date, item.daily_item_id, checked)
  return item.daily_item_id
}

const checkWrite = (page: Page, method: 'PUT' | 'DELETE') =>
  page.waitForResponse((r) => /\/api\/boards\/brewery\/daily_checks\//.test(r.url()) && r.request().method() === method && r.ok())

test('S24: ticking Temps and Pressures today shows who and when, brewer2 sees it, unticking counts down', async ({ page, browser }) => {
  const today = denverToday()
  const api = await apiAs('brewer1')
  const before = await dailyCard(api, today)
  const temps = await prepare(before, 'Temps', false)
  const pressures = await prepare(before, 'Pressures', false)
  const start = (await dailyCard(api, today)).done
  const total = before.total

  await openBoard(page)
  // Today's card starts expanded.
  await expect(page.getByTestId(`daily-toggle-${today}`)).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${start}/${total}`)

  let saved = checkWrite(page, 'PUT')
  await setBoardCheck(page.getByTestId(`daily-check-${today}-${temps}`), true)
  await saved
  saved = checkWrite(page, 'PUT')
  await setBoardCheck(page.getByTestId(`daily-check-${today}-${pressures}`), true)
  await saved
  await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${start + 2}/${total}`)

  await page.reload()
  await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${start + 2}/${total}`)
  await expect(page.getByTestId(`daily-label-${today}-${temps}`)).toHaveText(/^Temps — Jake, \d{1,2}:\d{2}[ap]$/)

  // brewer2 sees the same.
  const other = await browser.newContext({ storageState: authFile('brewer2'), viewport: { width: 1600, height: 1400 } })
  const page2 = await other.newPage()
  await openBoard(page2)
  await expect(page2.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${start + 2}/${total}`)
  await expect(page2.getByTestId(`daily-label-${today}-${temps}`)).toHaveText(/^Temps — Jake, /)
  await other.close()

  // D43 §1.11: a finished card starts closed after a load; open it to untick.
  if (start + 2 === total) {
    await expect(page.getByTestId(`daily-toggle-${today}`)).toHaveAttribute('aria-expanded', 'false')
    await page.getByTestId(`daily-toggle-${today}`).click()
  }
  saved = checkWrite(page, 'DELETE')
  await setBoardCheck(page.getByTestId(`daily-check-${today}-${temps}`), false)
  await saved
  await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${start + 1}/${total}`)
  await page.reload()
  await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${start + 1}/${total}`)
  await expect(page.getByTestId(`daily-label-${today}-${temps}`)).toHaveText('Temps')
})

test('S24: a refused tick snaps back with a message', async ({ page }) => {
  const today = denverToday()
  const before = await dailyCard(await apiAs('brewer1'), today)
  const temps = await prepare(before, 'Temps', false)
  const start = (await dailyCard(await apiAs('brewer1'), today)).done

  await page.route('**/api/boards/brewery/daily_checks/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) }),
  )
  await openBoard(page)
  // click, not check: the box snaps back before check() could see it change.
  await page.getByTestId(`daily-check-${today}-${temps}`).click()
  await expect(page.getByTestId('board-toast')).toBeVisible()
  await expect(page.getByTestId(`daily-check-${today}-${temps}`)).not.toBeChecked()
  await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${start}/${before.total}`)
})

test("S25: tomorrow's checks are shown but disabled, and the API refuses them", async ({ page }) => {
  const tomorrow = addDays(denverToday(), 1)
  const card = await dailyCard(await apiAs('brewer1'), tomorrow)

  await openBoard(page)
  await expect(page.getByTestId(`daily-toggle-${tomorrow}`)).toHaveAttribute('aria-expanded', 'false')
  await page.getByTestId(`daily-toggle-${tomorrow}`).click()
  for (const item of card.items) {
    await expect(page.getByTestId(`daily-check-${tomorrow}-${item.daily_item_id}`)).toBeDisabled()
  }

  const res = await (await apiAs('brewer1')).put(`/api/boards/brewery/daily_checks/${tomorrow}/${card.items[0].daily_item_id}`)
  expect(res.status()).toBe(422)
  expect((await res.json()).error).toBe('future_day')
})

test("S26: yesterday's 3/4 is amber, and the 4th can still be ticked", async ({ page }) => {
  const today = denverToday()
  const yesterday = addDays(today, -1)
  const card = await dailyCard(await apiAs('brewer1'), yesterday)
  const active = card.items.filter((i) => i.active)
  // Every item ticked but the last.
  for (const item of active.slice(0, -1)) await prepare(card, item.name, true)
  const last = await prepare(card, active[active.length - 1].name, false)
  const { done, total } = await dailyCard(await apiAs('brewer1'), yesterday)
  expect(done).toBe(total - 1)

  await openBoard(page, { from: yesterday, to: addDays(today, 5) })
  const count = page.getByTestId(`daily-count-${yesterday}`)
  await expect(count).toHaveText(`Daily ${done}/${total}`)
  await expect(page.getByTestId(`daily-${yesterday}`)).toHaveAttribute('data-behind', 'true')
  // The amber (MUI warning.dark).
  await expect(count).toHaveCSS('color', 'rgb(230, 81, 0)')

  await page.getByTestId(`daily-toggle-${yesterday}`).click()
  const saved = checkWrite(page, 'PUT')
  await setBoardCheck(page.getByTestId(`daily-check-${yesterday}-${last}`), true)
  await saved
  await expect(count).toHaveText(`Daily ${total}/${total}`)
  await expect(page.getByTestId(`daily-${yesterday}`)).toHaveAttribute('data-behind', 'false')
  await page.reload()
  await expect(page.getByTestId(`daily-count-${yesterday}`)).toHaveText(`Daily ${total}/${total}`)
})

test("S27: a Daily card can't be dragged", async ({ page }) => {
  const today = denverToday()
  const tomorrow = addDays(today, 1)
  let moves = 0
  page.on('request', (r) => {
    if (/\/api\/boards\/brewery\/tasks\/\d+\/move$/.test(r.url())) moves += 1
  })

  await openBoard(page)
  const daily = page.getByTestId(`daily-${today}`)
  // It isn't a sortable item.
  await expect(page.locator(`[aria-roledescription="sortable"]:has([data-testid="daily-${today}"])`)).toHaveCount(0)
  await mouseDrag(page, page.getByTestId(`daily-count-${today}`), page.getByTestId(`day-list-${tomorrow}`))
  await expect(page.getByTestId(`day-${today}`).getByTestId(`daily-${today}`)).toBeVisible()
  await expect(page.getByTestId(`day-list-${tomorrow}`).getByTestId(`daily-${today}`)).toHaveCount(0)
  await expect(daily).toBeVisible()
  expect(moves).toBe(0)
})
