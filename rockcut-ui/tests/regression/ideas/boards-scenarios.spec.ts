import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { mouseDrag, userId } from '../brewery/taskBoardHelpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import {
  apiAs,
  board,
  cardFace,
  cardListId,
  cleanupIdeas,
  listColumn,
  openIdeas,
  rememberLabel,
  rememberTask,
  tempCard,
  tempList,
  touchDropOn,
  written,
} from './helpers'

// D53 Part 2 §5: S223–S243 and S255–S261 in the browser, as the personas.
// Each test works in its own [TEST-TEMP] lists, cards and labels (removed
// after). What a browser can't show in a spec's time is ExUnit's: Watch's
// 10-minute batching (S225, S242's notifications, S243) is
// `watchers_test.exs`. The boards are shared: the one-worker `idea-boards`
// project. The four starter lists are read, never changed.

test.afterEach(cleanupIdeas)

const BAR = '/boards/bar'
const COMPANY = '/boards/company'
const desk = { width: 1600, height: 1000 }

const openCard = async (page: Page, key: string, id: number) => {
  await openIdeas(page, `/boards/${key}/cards/${id}`)
  await expect(page.getByTestId('idea-card-dialog')).toBeVisible()
  return page.getByTestId('idea-card-dialog')
}

test.describe('bartender1', () => {
  test.use({ storageState: authFile('bartender1'), viewport: desk })

  test('S224: a card with labels, a checklist, a due date and bartender2, all kept after a reload', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Taproom remodel')
    const card = await tempCard('bartender1', 'bar', list.id, 'New bar top')
    const dialog = await openCard(page, 'bar', card.id)

    // A label, created from the card.
    await dialog.getByTestId('idea-card-labels-input').locator('input').fill('[TEST-TEMP] Big')
    const created = page.waitForResponse((r) => r.url().endsWith('/labels') && r.request().method() === 'POST')
    await page.getByRole('option', { name: /Add the label/ }).click()
    rememberLabel('bar', ((await (await created).json()).data as { id: number }).id)
    await expect(dialog.locator('[data-testid^="idea-card-label-"]')).toHaveText(['[TEST-TEMP] Big'])

    const cardPath = new RegExp(`/cards/${card.id}$`)
    await dialog.getByTestId('idea-card-people-input').locator('input').fill('Alex')
    let save = written(page, 'PATCH', cardPath)
    await page.getByRole('option', { name: 'Alex Draft' }).click()
    await save
    save = written(page, 'PATCH', cardPath)
    await dialog.getByTestId('idea-card-due-input').fill('2030-01-15')
    await save
    for (const t of ['Measure', 'Quote']) {
      await dialog.getByTestId('idea-checklist-input').fill(t)
      const added = written(page, 'POST', /\/checklist$/)
      await dialog.getByTestId('idea-checklist-add').click()
      await added
    }
    await expect(dialog.locator('[data-testid^="idea-checklist-item-"]')).toHaveCount(2)

    await page.reload()
    await expect(dialog.getByTestId('idea-card-people-input')).toContainText('Alex Draft')
    await expect(dialog.getByTestId('idea-card-due-input')).toHaveValue('2030-01-15')
    await expect(dialog.locator('[data-testid^="idea-card-label-"]')).toHaveText(['[TEST-TEMP] Big'])
    await expect(dialog.locator('[data-testid^="idea-checklist-item-"]')).toHaveCount(2)
    await dialog.getByTestId('idea-card-close').click()
    await expect(cardFace(page, card.id)).toContainText('0/2')
    // Nobody watches it: bartender2 being on it doesn't turn Watch on.
    const asB2 = (await board(await apiAs('bartender2'), 'bar')).lists.flatMap((l) => l.cards ?? []).find((c) => c.id === card.id)!
    expect(asB2.watching).toBe(false)
  })

  test('S225 (the browser part): Watch on shows on the card; the eye is per person', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Watch')
    const card = await tempCard('bartender1', 'bar', list.id, 'Watched')
    const dialog = await openCard(page, 'bar', card.id)
    await dialog.getByTestId('idea-card-watch').click()
    await expect(dialog.getByTestId('idea-card-watch')).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByTestId('idea-card-close').click()
    await expect(page.getByTestId(`idea-card-watching-${card.id}`)).toBeVisible()
    const asB2 = (await board(await apiAs('bartender2'), 'bar')).lists.flatMap((l) => l.cards ?? []).find((c) => c.id === card.id)!
    expect(asB2.watching).toBe(false)
  })

  test('S237: Archived search narrows lists and cards; restore brings the list back with its cards', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Fall releases')
    await tempCard('bartender1', 'bar', list.id, 'Pumpkin ale')
    const other = await tempList('bartender1', 'bar', 'Keep me')
    const shelved = await tempCard('bartender1', 'bar', other.id, 'Shelved stout', { description: 'Too dark for summer' })
    const api = await apiAs('bartender1')
    expect((await api.post(`/api/idea_boards/bar/lists/${list.id}/archive`)).status()).toBe(200)
    expect((await api.post(`/api/idea_boards/bar/cards/${shelved.id}/archive`)).status()).toBe(200)

    await openIdeas(page, BAR)
    await expect(listColumn(page, list.id)).toBeHidden()
    await page.getByTestId('idea-settings').click()
    await page.getByTestId('idea-menu-archived').click()
    const search = page.getByTestId('idea-archived-search')
    await expect(page.getByTestId(`idea-archived-list-${list.id}`)).toBeVisible()
    await expect(page.getByTestId(`idea-archived-card-${shelved.id}`)).toBeVisible()

    // A card's description matches, ignoring case.
    await search.fill('TOO DARK')
    await expect(page.getByTestId(`idea-archived-card-${shelved.id}`)).toBeVisible()
    await expect(page.getByTestId(`idea-archived-list-${list.id}`)).toBeHidden()
    // A list's name.
    await search.fill('fall rel')
    await expect(page.getByTestId(`idea-archived-list-${list.id}`)).toBeVisible()
    await expect(page.getByTestId(`idea-archived-card-${shelved.id}`)).toBeHidden()
    await search.fill('nothing like this')
    await expect(page.getByTestId('idea-archived-none')).toHaveText('Nothing archived matches')
    await search.fill('Fall')

    await expect(page.getByTestId(`idea-archived-list-delete-${list.id}`)).toHaveCount(0)
    await page.getByTestId(`idea-archived-list-restore-${list.id}`).click()
    await page.getByTestId('idea-archived-close').click()
    await expect(listColumn(page, list.id).locator('[data-testid^="idea-card-title-"]')).toHaveText([/Pumpkin ale/])
  })

  test('S257: archiving an unlocked list that holds a locked card is refused, saying why', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Has a locked card')
    const card = await tempCard('bartender1', 'bar', list.id, 'Locked one')
    expect((await (await apiAs('barMgr')).post(`/api/idea_boards/bar/cards/${card.id}/lock`)).status()).toBe(200)
    await openIdeas(page, BAR)
    await page.getByTestId(`idea-list-menu-${list.id}`).click()
    await page.getByTestId('idea-list-archive').click()
    await expect(page.getByTestId('idea-toast')).toContainText('locked card')
    await expect(listColumn(page, list.id)).toBeVisible()
  })

  test('S258: a card due last week sends for Today; per item has no Repeat; a locked card has no Send', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'Send defaults')
    const past = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const card = await tempCard('bartender1', 'bar', list.id, 'Overdue idea', { due_on: past })
    const api = await apiAs('bartender1')
    for (const text of ['One', 'Two']) await api.post(`/api/idea_boards/bar/cards/${card.id}/checklist`, { data: { text } })

    const dialog = await openCard(page, 'bar', card.id)
    await dialog.getByTestId('idea-card-send').click()
    const send = page.getByTestId('idea-send-dialog')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date())
    await expect(send.getByTestId('idea-send-day')).toHaveValue(today)
    await expect(send.getByText('Repeat', { exact: true }).first()).toBeVisible()
    await send.getByTestId('idea-send-checklist-per-item').check()
    await expect(send.getByText('Repeat works with one task only.')).toBeVisible()
    await send.getByRole('button', { name: 'Cancel' }).click()

    expect((await (await apiAs('barMgr')).post(`/api/idea_boards/bar/cards/${card.id}/lock`)).status()).toBe(200)
    await page.reload()
    await expect(dialog.getByTestId('idea-card-locked')).toBeVisible()
    await expect(dialog.getByTestId('idea-card-send')).toHaveCount(0)
  })

  test('S233: one task with both people and ☐ notes; From link; chip with the day', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S233')
    const due = new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10)
    const ids = [await userId(await apiAs('bartender1')), await userId(await apiAs('bartender2'))]
    const card = await tempCard('bartender1', 'bar', list.id, 'Taproom remodel', { due_on: due, assignee_ids: ids })
    const api = await apiAs('bartender1')
    for (const text of ['Measure', 'Quote', 'Order']) await api.post(`/api/idea_boards/bar/cards/${card.id}/checklist`, { data: { text } })

    const dialog = await openCard(page, 'bar', card.id)
    await dialog.getByTestId('idea-card-send').click()
    const sent = page.waitForResponse((r) => r.url().includes('/send_to_tasks') && r.request().method() === 'POST')
    await page.getByTestId('idea-send-dialog').getByRole('button', { name: 'Send' }).click()
    const task = ((await (await sent).json()).tasks as { id: number; due_on: string }[])[0]
    rememberTask('bar', task.id)
    expect(task.due_on).toBe(due)
    await expect(dialog.locator('[data-testid^="idea-card-sent-"]').first()).toContainText('task list ·')

    const tasks = (await (await api.get('/api/boards/bar/tasks', { params: { from: due, to: due } })).json()).data
    const t = tasks.days[0].cards.find((c: { id: number }) => c.id === task.id)
    expect(t.notes).toContain('☐ Measure\n☐ Quote\n☐ Order')
    expect(t.assignees.map((a: { id: number }) => a.id)).toEqual(ids)
    expect(t.from_idea).toMatchObject({ link: true, card_id: card.id, board: 'bar' })
  })

  test('S234: one task per item, then the card moves to Done', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S234')
    const card = await tempCard('bartender1', 'bar', list.id, 'Per item')
    const api = await apiAs('bartender1')
    for (const text of ['Measure', 'Quote', 'Order']) await api.post(`/api/idea_boards/bar/cards/${card.id}/checklist`, { data: { text } })
    const done = (await board(api, 'bar')).lists.find((l) => l.name === 'Done')!

    const dialog = await openCard(page, 'bar', card.id)
    await dialog.getByTestId('idea-card-send').click()
    const send = page.getByTestId('idea-send-dialog')
    await send.getByTestId('idea-send-checklist-per-item').check()
    await send.getByTestId('idea-send-then-move').check()
    await expect(send.getByTestId('idea-send-then-list')).toHaveText('Done')
    const sent = page.waitForResponse((r) => r.url().includes('/send_to_tasks') && r.request().method() === 'POST')
    await send.getByRole('button', { name: 'Send' }).click()
    const tasks = (await (await sent).json()).tasks as { id: number; title: string }[]
    tasks.forEach((t) => rememberTask('bar', t.id))
    expect(tasks.map((t) => t.title)).toEqual(['Measure', 'Quote', 'Order'])
    expect(await cardListId('bartender1', 'bar', card.id)).toBe(done.id)
    // The card is in the shared Done list: take it out before clean-up removes the list.
    await (await apiAs('owner')).post(`/api/idea_boards/bar/cards/${card.id}/archive`)
    await (await apiAs('owner')).delete(`/api/idea_boards/bar/cards/${card.id}`)
  })

  test('S235 and S259: ticked on the task board → "✓ Done"; deleted → "Removed", title kept', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S235')
    const a = await tempCard('bartender1', 'bar', list.id, 'Done one')
    const b = await tempCard('bartender1', 'bar', list.id, 'Deleted one')
    const api = await apiAs('bartender1')
    const send = async (id: number) =>
      ((await (await api.post(`/api/idea_boards/bar/cards/${id}/send_to_tasks`, { data: { due_on: null } })).json()).tasks[0] as { id: number })
    const ta = await send(a.id)
    const tb = await send(b.id)
    rememberTask('bar', ta.id)
    expect((await (await apiAs('bartender2')).post(`/api/boards/bar/tasks/${ta.id}/complete`)).status()).toBe(200)
    expect((await api.delete(`/api/boards/bar/tasks/${tb.id}`)).status()).toBe(204)

    await openIdeas(page, BAR)
    await expect(page.getByTestId(`idea-card-sent-${a.id}`)).toContainText('✓ Done')
    await expect(page.getByTestId(`idea-card-sent-${b.id}`)).toHaveText('Removed from the task list')
    const dialog = await openCard(page, 'bar', b.id)
    await expect(dialog.locator('[data-state="removed"]')).toHaveText('Removed')
    await expect(dialog.locator('[data-state="removed"]')).toHaveAttribute('title', /Deleted one/)
  })

  test('S256: bartender1 adds a label but can\'t rename or delete one', async ({ page }) => {
    const res = await (await apiAs('bartender1')).post('/api/idea_boards/bar/labels', { data: { name: '[TEST-TEMP] S256', color: 'red' } })
    const label = (await res.json()).data as { id: number }
    rememberLabel('bar', label.id)
    const list = await tempList('bartender1', 'bar', 'S256')
    const card = await tempCard('bartender1', 'bar', list.id, 'Labelled')
    const dialog = await openCard(page, 'bar', card.id)
    await expect(dialog.getByTestId('idea-card-edit-labels')).toHaveCount(0)
    const api = await apiAs('bartender1')
    expect((await api.patch(`/api/idea_boards/bar/labels/${label.id}`, { data: { name: 'x' } })).status()).toBe(403)
    expect((await api.delete(`/api/idea_boards/bar/labels/${label.id}`)).status()).toBe(403)
  })

  test('S261: notes newest first with author and time; editing marks one edited; kept after a reload', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S261')
    const card = await tempCard('bartender1', 'bar', list.id, 'Notes')
    const dialog = await openCard(page, 'bar', card.id)
    for (const body of ['First note', 'Second note']) {
      await dialog.getByTestId('idea-note-input').fill(body)
      await dialog.getByTestId('idea-note-add').click()
      await expect(dialog.locator('[data-testid^="idea-note-body-"]').first()).toHaveText(body)
    }
    const second = dialog.locator('[data-testid^="idea-note-"]').filter({ hasText: 'Second note' }).first()
    const id = (await second.getAttribute('data-testid'))!.replace('idea-note-', '')
    await dialog.getByTestId(`idea-note-edit-${id}`).click()
    await dialog.getByTestId(`idea-note-edit-input-${id}`).fill('Second note, edited')
    const edited = written(page, 'PATCH', new RegExp(`/notes/${id}$`))
    await dialog.getByTestId(`idea-note-save-${id}`).click()
    await edited
    await page.reload()
    await expect(dialog.locator('[data-testid^="idea-note-body-"]')).toHaveText(['Second note, edited', 'First note'])
    await expect(dialog.getByTestId(`idea-note-meta-${id}`)).toContainText('edited')
    await expect(dialog.locator('[data-testid^="idea-note-"]').filter({ hasText: 'First note' }).first()).toContainText('Sam Pour')
  })

  test('S255: a note on a locked card saves; the rest stays read-only', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S255')
    const card = await tempCard('bartender1', 'bar', list.id, 'Locked, still talking')
    await (await apiAs('barMgr')).post(`/api/idea_boards/bar/cards/${card.id}/lock`)
    const dialog = await openCard(page, 'bar', card.id)
    await expect(dialog.getByTestId('idea-card-locked')).toContainText('Notes stay open')
    await expect(dialog.getByTestId('idea-card-title-input')).toHaveCount(0)
    await dialog.getByTestId('idea-note-input').fill('Still a good idea')
    const added = written(page, 'POST', /\/notes$/)
    await dialog.getByTestId('idea-note-add').click()
    await added
    await page.reload()
    await expect(dialog.locator('[data-testid^="idea-note-body-"]')).toHaveText(['Still a good idea'])
  })

  test('S242 (the browser part): the Watching filter lists the card while Watch is on', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S242')
    const watched = await tempCard('bartender1', 'bar', list.id, 'Watched')
    const plain = await tempCard('bartender1', 'bar', list.id, 'Not watched')
    await (await apiAs('bartender1')).put(`/api/idea_boards/bar/cards/${watched.id}/watch`)
    await openIdeas(page, BAR)
    await page.getByTestId('idea-settings').click()
    await page.getByTestId('idea-filter').click()
    await page.getByRole('menuitem', { name: 'Watching' }).click()
    await page.keyboard.press('Escape')
    await expect(cardFace(page, watched.id)).toBeVisible()
    await expect(cardFace(page, plain.id)).toBeHidden()
    await (await apiAs('bartender1')).delete(`/api/idea_boards/bar/cards/${watched.id}/watch`)
    await page.reload()
    await page.getByTestId('idea-settings').click()
    await page.getByTestId('idea-filter').click()
    await page.getByRole('menuitem', { name: 'Watching' }).click()
    await page.keyboard.press('Escape')
    await expect(cardFace(page, watched.id)).toBeHidden()
  })

  test('S229: a locked card can\'t be dragged by bartender1; the others in its list still move', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S229 from')
    const to = await tempList('bartender1', 'bar', 'S229 to')
    const locked = await tempCard('bartender1', 'bar', list.id, 'Locked')
    const free = await tempCard('bartender1', 'bar', list.id, 'Free')
    await (await apiAs('barMgr')).post(`/api/idea_boards/bar/cards/${locked.id}/lock`)
    await openIdeas(page, BAR)
    await expect(page.getByTestId(`idea-card-lock-${locked.id}`)).toBeVisible()
    await mouseDrag(page, cardFace(page, locked.id), listColumn(page, to.id))
    await mouseDrag(page, cardFace(page, free.id), listColumn(page, to.id))
    await expect.poll(() => cardListId('bartender1', 'bar', free.id)).toBe(to.id)
    expect(await cardListId('bartender1', 'bar', locked.id)).toBe(list.id)
    const dialog = await openCard(page, 'bar', locked.id)
    await expect(dialog.getByTestId('idea-card-title')).toBeVisible()
    await expect(dialog.getByTestId('idea-card-title-input')).toHaveCount(0)
  })
})

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr'), viewport: desk })

  test('S228: barMgr locks a list from its menu; bartender1 is refused 423; barMgr still renames it', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S228')
    const card = await tempCard('bartender1', 'bar', list.id, 'In it')
    await openIdeas(page, BAR)
    await page.getByTestId(`idea-list-menu-${list.id}`).click()
    await page.getByTestId('idea-list-lock').click()
    await expect(page.getByTestId(`idea-list-locked-by-${list.id}`)).toContainText('Locked by Casey')

    const b1 = await apiAs('bartender1')
    const res = await b1.patch(`/api/idea_boards/bar/cards/${card.id}`, { data: { title: 'crafted' } })
    expect(res.status()).toBe(423)
    expect((await res.json()).message).toBe('Locked by a manager')

    // No unlock first: rename the list and edit the card.
    await page.getByTestId(`idea-list-name-${list.id}`).click()
    await page.getByTestId(`idea-list-name-input-${list.id}`).fill('[TEST-TEMP] S228 renamed')
    await page.getByTestId(`idea-list-name-input-${list.id}`).press('Enter')
    await expect(page.getByTestId(`idea-list-name-${list.id}`)).toHaveText('[TEST-TEMP] S228 renamed')
    const dialog = await openCard(page, 'bar', card.id)
    await dialog.getByTestId('idea-card-title-input').fill('[TEST-TEMP] Manager edit')
    await dialog.getByTestId('idea-card-title-input').press('Enter')
    await expect.poll(async () => (await board(b1, 'bar')).lists.find((l) => l.id === list.id)!.cards![0].title).toBe('[TEST-TEMP] Manager edit')
  })

  test('S237: a manager deletes an archived list for good', async ({ page }) => {
    const list = await tempList('barMgr', 'bar', 'Delete me')
    await (await apiAs('barMgr')).post(`/api/idea_boards/bar/lists/${list.id}/archive`)
    await openIdeas(page, BAR)
    await page.getByTestId('idea-settings').click()
    await page.getByTestId('idea-menu-archived').click()
    await page.getByTestId(`idea-archived-list-delete-${list.id}`).click()
    await page.getByRole('button', { name: 'Delete for good' }).click()
    await expect(page.getByTestId(`idea-archived-list-${list.id}`)).toHaveCount(0)
    expect((await (await apiAs('barMgr')).get('/api/idea_boards/bar/archived')).ok()).toBe(true)
  })

  test('S240: History shows Taproom changes only; Company History is 403 for barMgr', async ({ page }) => {
    const list = await tempList('barMgr', 'bar', 'S240')
    await openIdeas(page, BAR)
    await page.getByTestId('idea-settings').click()
    await page.getByTestId('idea-menu-history').click()
    await expect(page.getByTestId('idea-history-dialog')).toContainText(list.name)
    expect((await (await apiAs('barMgr')).get('/api/idea_boards/company/history')).status()).toBe(403)
    expect((await (await apiAs('bartender1')).get('/api/idea_boards/bar/history')).status()).toBe(403)
  })

  test('S256: barMgr deletes a label; it comes off a locked card', async ({ page }) => {
    const res = await (await apiAs('bartender1')).post('/api/idea_boards/bar/labels', { data: { name: '[TEST-TEMP] S256m', color: 'blue' } })
    const label = (await res.json()).data as { id: number }
    rememberLabel('bar', label.id)
    const list = await tempList('barMgr', 'bar', 'S256m')
    const card = await tempCard('barMgr', 'bar', list.id, 'Locked with label', { label_ids: [label.id] })
    await (await apiAs('barMgr')).post(`/api/idea_boards/bar/cards/${card.id}/lock`)
    const dialog = await openCard(page, 'bar', card.id)
    await dialog.getByTestId('idea-card-edit-labels').click()
    await page.getByTestId(`idea-label-delete-${label.id}`).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(dialog.locator('[data-testid^="idea-card-label-"]')).toHaveCount(0)
    const face = (await board(await apiAs('bartender1'), 'bar')).lists.flatMap((l) => l.cards ?? []).find((c) => c.id === card.id) as unknown as { label_ids: number[] }
    expect(face.label_ids).toEqual([])
  })

  test('S261: barMgr deletes bartender1\'s note; bartender2 can\'t edit or delete it', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'S261m')
    const card = await tempCard('bartender1', 'bar', list.id, 'Notes')
    const note = (await (await (await apiAs('bartender1')).post(`/api/idea_boards/bar/cards/${card.id}/notes`, { data: { body: 'Mine' } })).json()).data as { id: number }
    const b2 = await apiAs('bartender2')
    expect((await b2.patch(`/api/idea_boards/bar/cards/${card.id}/notes/${note.id}`, { data: { body: 'x' } })).status()).toBe(403)
    expect((await b2.delete(`/api/idea_boards/bar/cards/${card.id}/notes/${note.id}`)).status()).toBe(403)
    const dialog = await openCard(page, 'bar', card.id)
    await expect(dialog.getByTestId(`idea-note-edit-${note.id}`)).toHaveCount(0)
    await dialog.getByTestId(`idea-note-delete-${note.id}`).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByTestId(`idea-note-${note.id}`)).toHaveCount(0)
  })

  test('S258: barMgr sends a locked card', async ({ page }) => {
    const list = await tempList('barMgr', 'bar', 'S258m')
    const card = await tempCard('barMgr', 'bar', list.id, 'Locked send')
    await (await apiAs('barMgr')).post(`/api/idea_boards/bar/cards/${card.id}/lock`)
    const dialog = await openCard(page, 'bar', card.id)
    await dialog.getByTestId('idea-card-send').click()
    const sent = page.waitForResponse((r) => r.url().includes('/send_to_tasks') && r.request().method() === 'POST')
    await page.getByTestId('idea-send-dialog').getByRole('button', { name: 'Send' }).click()
    const res = await sent
    expect(res.status()).toBe(201)
    rememberTask('bar', ((await res.json()).tasks as { id: number }[])[0].id)
  })
})

test.describe('other personas', () => {
  test.use({ viewport: desk })

  test.describe('floater', () => {
    test.use({ storageState: authFile('floater') })
    test('S226: the switcher lists both department boards and Company, Company last', async ({ page }) => {
      await openIdeas(page, BAR)
      await page.getByTestId('board-switcher').click()
      const names = await page.getByTestId('board-switcher-menu').getByRole('menuitem').allInnerTexts()
      expect([...names].sort()).toEqual(['Brewery', 'Company', 'Taproom'])
      expect(names.at(-1)).toBe('Company')
    })
  })

  test.describe('brewer1', () => {
    test.use({ storageState: authFile('brewer1') })
    test('S227: /boards/bar goes to the Brewery board; the API is 403', async ({ page }) => {
      await page.goto(BAR)
      await expect(page).toHaveURL(/\/boards\/brewery$/)
      expect((await (await apiAs('brewer1')).get('/api/idea_boards/bar/lists')).status()).toBe(403)
    })
  })

  test.describe('splitRole', () => {
    test.use({ storageState: authFile('splitRole') })
    test('S230: no Lock on the Brewery board; Lock on the Taproom board', async ({ page }) => {
      const brewery = await tempList('splitRole', 'brewery', 'S230')
      const bar = await tempList('splitRole', 'bar', 'S230')
      await openIdeas(page, '/boards/brewery')
      await page.getByTestId(`idea-list-menu-${brewery.id}`).click()
      await expect(page.getByTestId('idea-list-rename')).toBeVisible()
      await expect(page.getByTestId('idea-list-lock')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await openIdeas(page, BAR)
      await page.getByTestId(`idea-list-menu-${bar.id}`).click()
      await expect(page.getByTestId('idea-list-lock')).toBeVisible()
    })
  })

  test.describe('breweryMgr', () => {
    test.use({ storageState: authFile('breweryMgr') })
    test('S231: no Lock on the Company board (API 403); after the owner locks it, no changes', async ({ page }) => {
      const list = await tempList('owner', 'company', 'S231')
      await openIdeas(page, COMPANY)
      await page.getByTestId(`idea-list-menu-${list.id}`).click()
      await expect(page.getByTestId('idea-list-lock')).toHaveCount(0)
      await page.keyboard.press('Escape')
      expect((await (await apiAs('breweryMgr')).post(`/api/idea_boards/company/lists/${list.id}/lock`)).status()).toBe(403)
      expect((await (await apiAs('owner')).post(`/api/idea_boards/company/lists/${list.id}/lock`)).status()).toBe(200)
      await page.reload()
      await expect(page.getByTestId(`idea-add-card-${list.id}`)).toHaveCount(0)
      for (const who of ['breweryMgr', 'brewer1'] as const)
        expect((await (await apiAs(who)).patch(`/api/idea_boards/company/lists/${list.id}`, { data: { name: 'x' } })).status()).toBe(423)
    })
  })

  test.describe('office1', () => {
    test.use({ storageState: authFile('office1') })
    test('S232: a Company card assigned to bartender1', async ({ page }) => {
      const list = await tempList('office1', 'company', 'S232')
      const card = await tempCard('office1', 'company', list.id, 'Holiday party')
      const dialog = await openCard(page, 'company', card.id)
      await dialog.getByTestId('idea-card-people-input').locator('input').fill('Sam')
      const saved = written(page, 'PATCH', new RegExp(`/cards/${card.id}$`))
      await page.getByRole('option', { name: 'Sam Pour' }).click()
      await saved
      await page.reload()
      await expect(dialog.getByTestId('idea-card-people-input')).toContainText('Sam Pour')
    })

    test('S236: Send picks Office; brewer1 is "not in Office, left off"', async ({ page }) => {
      const list = await tempList('office1', 'company', 'S236')
      const ids = [await userId(await apiAs('office1')), await userId(await apiAs('brewer1'))]
      const card = await tempCard('office1', 'company', list.id, 'Party supplies', { assignee_ids: ids })
      const dialog = await openCard(page, 'company', card.id)
      await dialog.getByTestId('idea-card-send').click()
      const send = page.getByTestId('idea-send-dialog')
      await expect(send.getByTestId('idea-send-board')).toHaveText('Office')
      await expect(send.getByTestId('idea-send-left-off')).toHaveText('Jake Brewer: not in Office, left off')
      await expect(send.getByTestId('idea-send-people')).toContainText('Pat Ledger')
      await send.getByRole('button', { name: 'Cancel' }).click()
    })
  })

  test.describe('noDept', () => {
    test.use({ storageState: authFile('noDept') })
    test('S238: only the Company board, and full use of it; /boards/bar goes to /boards/company', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Boards', exact: true }).click()
      await expect(page).toHaveURL(/\/boards\/company$/)
      await expect(page.getByTestId('board-switcher')).toHaveCount(0)
      await expect(page.getByTestId('board-title')).toHaveText('Company board')
      await page.goto(BAR)
      await expect(page).toHaveURL(/\/boards\/company$/)
      const list = await tempList('noDept', 'company', 'S238')
      await openIdeas(page, COMPANY)
      await page.getByTestId(`idea-add-card-${list.id}`).click()
      await page.getByTestId(`idea-add-card-input-${list.id}`).fill('[TEST-TEMP] From noDept')
      await page.getByTestId(`idea-add-card-save-${list.id}`).click()
      await expect(listColumn(page, list.id).locator('[data-testid^="idea-card-title-"]')).toHaveText(['[TEST-TEMP] From noDept'])
    })
  })

  test.describe('taproomDevice', () => {
    test.use({ storageState: authFile('taproomDevice') })
    test('S241: writes are 403; another department\'s board is 403', async () => {
      const api = await apiAs('taproomDevice')
      const ideas = (await board(await apiAs('bartender1'), 'bar')).lists[0]
      expect((await api.post('/api/idea_boards/bar/cards', { data: { list_id: ideas.id, title: 'x' } })).status()).toBe(403)
      expect((await api.get('/api/idea_boards/brewery/lists')).status()).toBe(403)
      expect((await api.get('/api/idea_boards/company/lists')).status()).toBe(200)
    })
  })

  test.describe('owner', () => {
    test.use({ storageState: authFile('owner') })
    let temp: TempPerson | null = null
    test.afterEach(async () => {
      await retireTempPerson(temp)
      temp = null
    })

    test('S260: deactivating a [TEST-TEMP] person takes them off cards and watches; their notes stay', async ({ page }) => {
      temp = await createTempPerson('S260', { memberships: [{ department: 'bar', role: 'employee' }] })
      const list = await tempList('barMgr', 'bar', 'S260')
      const card = await tempCard('barMgr', 'bar', list.id, 'Theirs', { assignee_ids: [temp.id] })
      const owner = await apiAs('owner')
      // Their note and watch, written as the owner can't; inserted through a manager's note is not theirs,
      // so the person signs in with a minted session through the helper's token.
      const { anonApi } = await import('../auth/helpers')
      const anon = await anonApi()
      const session = await anon.post('/api/session', { data: { email: temp.email, password: temp.password } })
      expect(session.status(), await session.text()).toBe(200)
      const token = (await session.json()).token as string
      const asTemp = await (await import('@playwright/test')).request.newContext({
        baseURL: (await import('../../config/targets')).activeProfile().apiUrl,
        extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      })
      expect((await asTemp.post(`/api/idea_boards/bar/cards/${card.id}/notes`, { data: { body: 'Note by the temp person' } })).status()).toBe(201)
      expect((await asTemp.put(`/api/idea_boards/bar/cards/${card.id}/watch`)).status()).toBe(200)

      expect((await owner.patch(`/api/users/${temp.id}`, { data: { active: false } })).status()).toBe(200)

      const dialog = await openCard(page, 'bar', card.id)
      await expect(dialog.getByTestId('idea-card-people-input')).not.toContainText(temp.name)
      await expect(dialog.locator('[data-testid^="idea-note-"]').filter({ hasText: 'Note by the temp person' }).first()).toContainText(temp.name)
    })
  })
})

test.describe('phone width', () => {
  test.use({ storageState: authFile('bartender1'), viewport: { width: 390, height: 844 }, hasTouch: true })

  test('S239: a long press drags a card onto another list\'s tab', async ({ page }) => {
    const from = await tempList('bartender1', 'bar', 'Phone from')
    const to = await tempList('bartender1', 'bar', 'Phone to')
    const card = await tempCard('bartender1', 'bar', from.id, 'Long press me')
    await openIdeas(page, BAR)
    await page.getByTestId(`idea-list-tab-${from.id}`).click()
    await expect(cardFace(page, card.id)).toBeVisible()
    // The target tab on screen (the strip scrolls; the list showing stays).
    await page.getByTestId(`idea-list-tab-${to.id}`).scrollIntoViewIfNeeded()
    await touchDropOn(page, cardFace(page, card.id), page.getByTestId(`idea-list-tab-${to.id}`))
    await expect.poll(() => cardListId('bartender1', 'bar', card.id)).toBe(to.id)
    await page.getByTestId(`idea-list-tab-${to.id}`).click()
    await expect(cardFace(page, card.id)).toBeVisible()
  })
})

// Fix cycle 1 (lead decisions 7): the DEV QA report's UI gaps, each its repro.
test.describe('fix cycle 1 (DEV QA)', () => {
  test.use({ storageState: authFile('bartender1'), viewport: desk })

  test('gap 1: list ⋮ → Rename opens the name field, and the rename saves', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'G1')
    await openIdeas(page, BAR)
    await page.getByTestId(`idea-list-menu-${list.id}`).click()
    await page.getByTestId('idea-list-rename').click()
    const input = page.getByTestId(`idea-list-name-input-${list.id}`)
    await expect(input).toBeFocused()
    // Still there once the menu has gone (DEV QA: it closed by itself).
    await page.waitForTimeout(800)
    await expect(input).toBeFocused()
    await input.fill('[TEST-TEMP] G1 renamed')
    const saved = written(page, 'PATCH', new RegExp(`/lists/${list.id}$`))
    await input.press('Enter')
    await saved
    await page.reload()
    await expect(page.getByTestId(`idea-list-name-${list.id}`)).toHaveText('[TEST-TEMP] G1 renamed')
  })

  test('gap 2: closing with an unsaved description asks first (✕, Escape, back); nothing unsaved closes at once', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'G2')
    const card = await tempCard('bartender1', 'bar', list.id, 'Unsaved')
    await openIdeas(page, BAR)
    const dialog = page.getByTestId('idea-card-dialog')
    const ask = page.getByRole('dialog', { name: 'Discard your changes to the description?' })
    const description = dialog.getByTestId('idea-card-description-input')

    // Nothing typed: ✕ closes.
    await cardFace(page, card.id).click()
    await dialog.getByTestId('idea-card-close').click()
    await expect(dialog).toBeHidden()

    // ✕ with typing: asked; Keep editing keeps it.
    await cardFace(page, card.id).click()
    await description.fill('Half a thought')
    await dialog.getByTestId('idea-card-close').click()
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Keep editing' }).click()
    await expect(ask).toBeHidden()
    await expect(description).toHaveValue('Half a thought')

    // Escape: asked too.
    await description.press('Escape')
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Keep editing' }).click()

    // Back (Android's gesture): asked, and the card stays open.
    await page.goBack()
    await expect(ask).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/boards/bar/cards/${card.id}$`))
    await ask.getByRole('button', { name: 'Discard' }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/boards\/bar$/)
    expect((await (await (await apiAs('bartender1')).get(`/api/idea_boards/bar/cards/${card.id}`)).json()).data.description).toBeNull()
  })

  test('gap 3: Enter on "Add the label" creates the label and puts it on the card', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'G3')
    const card = await tempCard('bartender1', 'bar', list.id, 'Labelled by Enter')
    const dialog = await openCard(page, 'bar', card.id)
    const input = dialog.getByTestId('idea-card-labels-input').locator('input')
    await input.fill('[TEST-TEMP] G3')
    await expect(page.getByRole('option', { name: 'Add the label "[TEST-TEMP] G3"' })).toBeVisible()
    const created = written(page, 'POST', /\/labels$/)
    await input.press('Enter')
    rememberLabel('bar', ((await (await created).json()).data as { id: number }).id)
    await expect(dialog.locator('[data-testid^="idea-card-label-"]')).toHaveText(['[TEST-TEMP] G3'])
    await page.reload()
    await expect(dialog.locator('[data-testid^="idea-card-label-"]')).toHaveText(['[TEST-TEMP] G3'])
  })

  test('gap 5: per item, one of two tasks deleted: the face still says "On the task list"; both deleted: "Removed"', async ({ page }) => {
    const list = await tempList('bartender1', 'bar', 'G5')
    const card = await tempCard('bartender1', 'bar', list.id, 'Two items')
    const api = await apiAs('bartender1')
    for (const text of ['item one', 'item two'])
      expect((await api.post(`/api/idea_boards/bar/cards/${card.id}/checklist`, { data: { text } })).status()).toBe(201)
    const res = await api.post(`/api/idea_boards/bar/cards/${card.id}/send_to_tasks`, { data: { checklist: 'per_item', due_on: null } })
    expect(res.status(), await res.text()).toBe(201)
    const tasks = (await res.json()).tasks as { id: number }[]
    expect(tasks).toHaveLength(2)
    // The later one deleted: the old face read only the latest send.
    expect((await api.delete(`/api/boards/bar/tasks/${tasks[1].id}`)).status()).toBe(204)
    rememberTask('bar', tasks[0].id)

    await openIdeas(page, BAR)
    await expect(page.getByTestId(`idea-card-sent-${card.id}`)).toHaveText('On the task list')
    expect((await api.delete(`/api/boards/bar/tasks/${tasks[0].id}`)).status()).toBe(204)
    await page.reload()
    await expect(page.getByTestId(`idea-card-sent-${card.id}`)).toHaveText('Removed from the task list')
  })
})
