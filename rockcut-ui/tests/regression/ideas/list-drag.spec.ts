import { test, expect, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, board, cleanupIdeas, listColumn, openIdeas, tempList, written } from './helpers'

// D58 §3.16 (5193): on desktop an Idea Board list drags left or right by its
// header, and saves as ⋮ → Move left / Move right does (the same History
// entry). Locked lists stay put for non-managers; phones keep the ⋮ menu.

test.afterEach(cleanupIdeas)

/** Press on `header`, move past `target`'s middle, let go. */
async function dragHeader(page: Page, header: Locator, target: Locator, side: 'left' | 'right') {
  const h = (await header.boundingBox())!
  const t = (await target.boundingBox())!
  await page.mouse.move(h.x + 40, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + 52, h.y + h.height / 2, { steps: 4 })
  const x = side === 'right' ? t.x + t.width * 0.75 : t.x + t.width * 0.25
  await page.mouse.move(x, h.y + h.height / 2, { steps: 20 })
  await page.mouse.up()
}

const order = async (key: string) => (await board(await apiAs('owner'), key)).lists.map((l) => l.id)

test.describe('bartender1 on the Taproom board', () => {
  test.use({ storageState: authFile('bartender1'), viewport: { width: 2400, height: 1000 } })

  test('drag a list right past the next one: saved, after a reload too, and in History', async ({ page }) => {
    const a = await tempList('bartender1', 'bar', 'Drag A')
    const b = await tempList('bartender1', 'bar', 'Drag B')
    await openIdeas(page, '/boards/bar')
    const moved = written(page, 'POST', new RegExp(`/api/idea_boards/bar/lists/${a.id}/move$`))
    await dragHeader(page, page.getByTestId(`idea-list-header-${a.id}`), listColumn(page, b.id), 'right')
    await moved
    const ids = await order('bar')
    expect(ids.indexOf(b.id)).toBe(ids.indexOf(a.id) - 1)

    await page.reload()
    await expect(listColumn(page, a.id)).toBeVisible()
    const shown = await page.locator('[data-testid^="idea-list-"][data-list-name]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(shown.indexOf(`idea-list-${b.id}`)).toBe(shown.indexOf(`idea-list-${a.id}`) - 1)

    const history = await (await apiAs('owner')).get('/api/idea_boards/bar/history')
    const events = ((await history.json()).data ?? []) as { action: string; list_id?: number; detail?: Record<string, unknown> }[]
    expect(events.some((e) => e.action === 'list_moved')).toBe(true)
  })

  test('a click on the name still renames; a click on ⋮ still opens the menu', async ({ page }) => {
    const a = await tempList('bartender1', 'bar', 'Click')
    await openIdeas(page, '/boards/bar')
    await page.getByTestId(`idea-list-name-${a.id}`).click()
    await expect(page.getByTestId(`idea-list-name-input-${a.id}`)).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId(`idea-list-menu-${a.id}`).click()
    await expect(page.getByTestId(`idea-list-menu-items-${a.id}`)).toBeVisible()
  })

  test('a locked list doesn’t drag for a non-manager', async ({ page }) => {
    const a = await tempList('bartender1', 'bar', 'Locked')
    const b = await tempList('bartender1', 'bar', 'Next')
    expect((await (await apiAs('barMgr')).post(`/api/idea_boards/bar/lists/${a.id}/lock`)).ok()).toBe(true)
    const before = await order('bar')
    await openIdeas(page, '/boards/bar')
    await dragHeader(page, page.getByTestId(`idea-list-header-${a.id}`), listColumn(page, b.id), 'right')
    await page.waitForTimeout(500)
    expect(await order('bar')).toEqual(before)
  })
})

test.describe('phone', () => {
  test.use({ storageState: authFile('bartender1'), viewport: { width: 390, height: 844 } })

  test('the list header isn’t a drag handle on a phone', async ({ page }) => {
    const a = await tempList('bartender1', 'bar', 'Phone')
    await openIdeas(page, '/boards/bar')
    await page.getByTestId(`idea-list-tab-${a.id}`).click()
    await expect(page.getByTestId(`idea-list-header-${a.id}`)).not.toHaveCSS('cursor', 'grab')
  })
})
