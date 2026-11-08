import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { mouseDrag } from '../brewery/taskBoardHelpers'
import { apiAs, board, cardFace, cleanupIdeas, listColumn, openIdeas, rememberList, rememberTask, tempCard, tempList } from './helpers'

// D53 Part 2 stage 6: one smoke test per Idea Board screen (the board, the
// card dialog, drag, locks, Send and "From idea", Archived, History, the
// tablet, phone width). The scenarios in full are stage 8's. Each test works
// in its own [TEST-TEMP] list. The boards are shared, so these run in the
// one-worker `idea-boards` project.

test.afterEach(cleanupIdeas)

test.describe('bartender1', () => {
  test.use({ storageState: authFile('bartender1'), viewport: { width: 1600, height: 1000 } })

  test('S223: nav → Boards opens the Taproom board with its four lists; the switcher has Taproom and Company', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Boards', exact: true }).click()
    await expect(page).toHaveURL(/\/boards\/bar$/)
    await expect(page.getByTestId('board-title')).toHaveText('Taproom board')
    await expect(page.locator('[data-testid^="idea-list-name-"]').first()).toHaveText('Ideas')
    const names = await page.locator('[data-testid^="idea-list-name-"]').allInnerTexts()
    expect(names.slice(0, 4)).toEqual(['Ideas', 'Planned', 'Doing', 'Done'])
    await page.getByTestId('board-switcher').click()
    await expect(page.getByTestId('board-switcher-menu').getByRole('menuitem')).toHaveText(['Taproom', 'Company'])
  })

  test('S227: /boards/brewery goes to the Taproom board', async ({ page }) => {
    await page.goto('/boards/brewery')
    await expect(page).toHaveURL(/\/boards\/bar$/)
  })

  test('S224 smoke: a list and a card from the board; the card dialog saves; reload keeps it all; back closes it', async ({ page }) => {
    await openIdeas(page, '/boards/bar')
    // The list, through the UI; its id from the reply so clean-up finds it.
    await page.getByTestId('idea-add-list').click()
    const name = `[TEST-TEMP] Remodel ${Date.now().toString(36)}`
    await page.getByTestId('idea-add-list-input').fill(name)
    const created = page.waitForResponse((r) => r.url().endsWith('/api/idea_boards/bar/lists') && r.request().method() === 'POST')
    await page.getByTestId('idea-add-list-save').click()
    const list = (await (await created).json()).data as { id: number }
    rememberList('bar', list.id)

    await page.getByTestId(`idea-add-card-${list.id}`).click()
    await page.getByTestId(`idea-add-card-input-${list.id}`).fill('[TEST-TEMP] New bar top')
    await page.getByTestId(`idea-add-card-save-${list.id}`).click()
    const face = listColumn(page, list.id).locator('[data-testid^="idea-card-title-"]')
    await expect(face).toHaveText(['[TEST-TEMP] New bar top'])
    await face.click()
    await expect(page).toHaveURL(/\/boards\/bar\/cards\/\d+$/)
    const dialog = page.getByTestId('idea-card-dialog')

    await dialog.getByTestId('idea-card-description-input').fill('Walnut, seats 14')
    await dialog.getByTestId('idea-card-description-save').click()
    await dialog.getByTestId('idea-card-due-input').fill('2030-01-15')
    await dialog.getByTestId('idea-checklist-input').fill('Measure')
    await dialog.getByTestId('idea-checklist-add').click()
    await dialog.locator('[data-testid^="idea-checklist-tick-"]').first().check()
    await dialog.getByTestId('idea-note-input').fill('Quote came in')
    await dialog.getByTestId('idea-note-add').click()
    await expect(dialog.locator('[data-testid^="idea-note-body-"]')).toHaveText(['Quote came in'])
    await dialog.getByTestId('idea-card-watch').click()
    await expect(dialog.getByTestId('idea-card-watch')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(dialog.getByTestId('idea-card-description-input')).toHaveValue('Walnut, seats 14')
    await expect(dialog.getByTestId('idea-card-due-input')).toHaveValue('2030-01-15')
    await expect(dialog.locator('[data-testid^="idea-checklist-tick-"]').first()).toBeChecked()
    await expect(dialog.locator('[data-testid^="idea-note-body-"]')).toHaveText(['Quote came in'])
    await expect(dialog.getByTestId('idea-card-watch')).toHaveAttribute('aria-pressed', 'true')

    // Opened by URL (a reload): Close goes to the board.
    await dialog.getByTestId('idea-card-close').click()
    await expect(page).toHaveURL(/\/boards\/bar$/)
    // Opened from the board: back closes it.
    await face.click()
    await expect(dialog).toBeVisible()
    await page.goBack()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/boards\/bar$/)
  })

  test('drag a card to another list (mouse)', async ({ page }) => {
    const a = await tempList('bartender1', 'bar', 'Drag from')
    const b = await tempList('bartender1', 'bar', 'Drag to')
    const card = await tempCard('bartender1', 'bar', a.id, 'Dragged')
    await openIdeas(page, '/boards/bar')
    await mouseDrag(page, cardFace(page, card.id), listColumn(page, b.id))
    await expect(listColumn(page, b.id).getByTestId(`idea-card-${card.id}`)).toBeVisible()
    await expect
      .poll(async () => (await board(await apiAs('bartender1'), 'bar')).lists.find((l) => l.id === b.id)?.cards?.map((c) => c.id))
      .toEqual([card.id])
  })

  test('S233 smoke: Send → the chip; the task dialog says "From idea" and links back', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Send')
    const card = await tempCard('bartender1', 'bar', list.id, 'Deep clean the lines')
    await openIdeas(page, `/boards/bar/cards/${card.id}`)
    const dialog = page.getByTestId('idea-card-dialog')
    await dialog.getByTestId('idea-card-send').click()
    const send = page.getByTestId('idea-send-dialog')
    await expect(send.getByTestId('idea-send-no-day')).toBeChecked()
    const sent = page.waitForResponse((r) => r.url().includes('/send_to_tasks') && r.request().method() === 'POST')
    await send.getByRole('button', { name: 'Send' }).click()
    const task = ((await (await sent).json()).tasks as { id: number }[])[0]
    rememberTask('bar', task.id)
    await expect(dialog.locator('[data-testid^="idea-card-sent-"]').first()).toHaveText(`On the ${await deptName()} task list · Future`)

    await page.goto('/tasks/bar')
    await page.getByTestId(`task-${task.id}:future`).click()
    await page.getByTestId('task-menu-edit').click()
    await expect(page.getByTestId('task-dialog-from-idea')).toContainText(`From the ${await deptName()} board:`)
    await page.getByTestId('task-dialog-from-idea-link').click()
    await expect(page).toHaveURL(new RegExp(`/boards/bar/cards/${card.id}$`))
    await expect(page.getByTestId('idea-card-dialog')).toBeVisible()
  })

  test('S237 smoke: archive a list from its menu; Archived restores it', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Archive me')
    await tempCard('bartender1', 'bar', list.id, 'Inside')
    await openIdeas(page, '/boards/bar')
    await page.getByTestId(`idea-list-menu-${list.id}`).click()
    await page.getByTestId('idea-list-archive').click()
    await expect(listColumn(page, list.id)).toBeHidden()
    await page.getByTestId('idea-settings').click()
    await page.getByTestId('idea-menu-archived').click()
    await expect(page.getByTestId(`idea-archived-list-${list.id}`)).toContainText('1 card')
    // Not a manager: no delete for good.
    await expect(page.getByTestId(`idea-archived-list-delete-${list.id}`)).toHaveCount(0)
    await page.getByTestId(`idea-archived-list-restore-${list.id}`).click()
    await page.getByTestId('idea-archived-close').click()
    await expect(listColumn(page, list.id)).toBeVisible()
    await expect(listColumn(page, list.id).locator('[data-testid^="idea-card-title-"]')).toHaveCount(1)
  })

  test('S228 smoke: a locked list has no add, no menu, and says who locked it', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Locked')
    const mgr = await apiAs('barMgr')
    expect((await mgr.post(`/api/idea_boards/bar/lists/${list.id}/lock`)).status()).toBe(200)
    await openIdeas(page, '/boards/bar')
    await expect(page.getByTestId(`idea-list-locked-by-${list.id}`)).toContainText('Locked by Casey')
    await expect(page.getByTestId(`idea-add-card-${list.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`idea-list-menu-${list.id}`)).toHaveCount(0)
  })

  test('S240 smoke: no History in the menu', async ({ page }) => {
    await openIdeas(page, '/boards/bar')
    await page.getByTestId('idea-settings').click()
    await expect(page.getByTestId('idea-menu-archived')).toBeVisible()
    await expect(page.getByTestId('idea-menu-history')).toHaveCount(0)
  })
})

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr'), viewport: { width: 1600, height: 1000 } })

  test('S228/S240 smoke: a manager keeps the locked list\'s controls, and has History', async ({ page }) => {
    const list = await tempList('barMgr', 'bar', 'Locked')
    await (await apiAs('barMgr')).post(`/api/idea_boards/bar/lists/${list.id}/lock`)
    await openIdeas(page, '/boards/bar')
    await expect(page.getByTestId(`idea-add-card-${list.id}`)).toBeVisible()
    await page.getByTestId(`idea-list-menu-${list.id}`).click()
    await expect(page.getByTestId('idea-list-unlock')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('idea-settings').click()
    await page.getByTestId('idea-menu-history').click()
    await expect(page.getByTestId('idea-history-dialog')).toBeVisible()
    await expect(page.locator('[data-testid^="idea-history-entry-"]').first()).toContainText('Locked the list')
  })
})

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice'), viewport: { width: 1280, height: 900 } })

  test('S241 smoke: the board and a card, view only', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Tablet')
    const card = await tempCard('bartender1', 'bar', list.id, 'Read only')
    await openIdeas(page, '/boards/bar')
    await expect(listColumn(page, list.id)).toBeVisible()
    await expect(page.getByTestId('idea-add-list')).toHaveCount(0)
    await expect(page.getByTestId(`idea-add-card-${list.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`idea-list-menu-${list.id}`)).toHaveCount(0)
    await cardFace(page, card.id).click()
    const dialog = page.getByTestId('idea-card-dialog')
    await expect(dialog.getByTestId('idea-card-title')).toBeVisible()
    for (const id of ['idea-card-title-input', 'idea-card-watch', 'idea-note-input', 'idea-card-send', 'idea-checklist-input'])
      await expect(dialog.getByTestId(id)).toHaveCount(0)
    await dialog.getByTestId('idea-card-close').click()
    await page.getByTestId('board-switcher').click()
    await expect(page.getByTestId('board-switcher-menu').getByRole('menuitem')).toHaveText(['Taproom', 'Company'])
  })
})

test.describe('phone width', () => {
  test.use({ storageState: authFile('bartender1'), viewport: { width: 390, height: 844 }, hasTouch: true })

  test('S239 smoke: one list at a time under tabs; a card opens at its URL and back closes it', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Phone')
    const card = await tempCard('bartender1', 'bar', list.id, 'On a phone')
    await openIdeas(page, '/boards/bar')
    await expect(page.getByTestId('idea-list-tabs')).toBeVisible()
    await page.getByTestId(`idea-list-tab-${list.id}`).click()
    await expect(listColumn(page, list.id)).toBeVisible()
    await expect(page.locator('[data-testid^="idea-list-"][data-list-name]')).toHaveCount(1)
    await cardFace(page, card.id).click()
    await expect(page).toHaveURL(new RegExp(`/boards/bar/cards/${card.id}$`))
    await expect(page.getByTestId('idea-card-dialog')).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId('idea-card-dialog')).toBeHidden()
  })
})

async function deptName() {
  const api = await apiAs('bartender1')
  return ((await (await api.get('/api/departments')).json()).data as { key: string; name: string }[]).find((d) => d.key === 'bar')!.name
}
