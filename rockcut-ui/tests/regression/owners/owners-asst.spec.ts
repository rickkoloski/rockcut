import { test, expect } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { boardWrite, setBoardCheck } from '../brewery/taskBoardHelpers'
import { boardManagerItems } from '../settingsMenu'
import { cleanupIdeas, openIdeas, tempCard, tempList, written } from '../ideas/helpers'
import {
  OWNERS,
  addDays,
  apiAs,
  channelNames,
  cleanupOwners,
  denverToday,
  openTaskBoard,
  ownersCards,
  ownersTask,
  status,
  switcherEntries,
  tempTag,
} from './helpers'

// D59 §5 as ownersAsst (Office employee + Owners member): O3 (the Owners task
// board, no manager tools), O4 (the Owners Idea Board; an owner's lock holds),
// O10 (a post in the Owners channel reaches the owners, not office1). Runs in
// the one-worker `owners` project.

test.use({ storageState: authFile('ownersAsst'), viewport: { width: 1600, height: 1100 } })
test.describe.configure({ mode: 'default', timeout: 60_000 })

test.afterEach(async () => {
  await cleanupOwners()
  await cleanupIdeas()
})

test('O3: Tasks → Owners; ticks a task and moves one to tomorrow; no History or Edit Daily items', async ({ page }) => {
  const today = denverToday()
  const tomorrow = addDays(today, 1)
  const tick = await ownersTask('owner', 'O3 Sign lease')
  const move = await ownersTask('owner', 'O3 Call accountant')

  await openTaskBoard(page, '/tasks/office')
  expect(await switcherEntries(page)).toEqual(['Office', 'Owners'])
  await page.getByTestId('board-switcher').click()
  await page.getByTestId(`board-switch-${OWNERS}`).click()
  await expect(page).toHaveURL(/\/tasks\/owners$/)
  await expect(page.getByTestId('board-title')).toHaveText('Owners tasks')

  const done = boardWrite(page, new RegExp(`/api/boards/owners/tasks/${tick.id}/complete$`))
  await setBoardCheck(page.getByTestId(`task-check-${tick.id}:${today}`), true)
  await done

  await page.getByTestId(`task-title-${move.id}:${today}`).click()
  await page.getByTestId('task-menu-change-day').click()
  await page.getByTestId('change-day-input').fill(tomorrow)
  const moved = boardWrite(page, new RegExp(`/api/boards/owners/tasks/${move.id}/move$`))
  await page.getByTestId('change-day-confirm').click()
  expect((await moved).request().postDataJSON()).toEqual({ due_on: tomorrow, before_id: null })
  await expect(page.getByTestId(`task-${move.id}:${tomorrow}`)).toBeVisible()

  await page.reload()
  await expect(page.getByTestId(`task-check-${tick.id}:${today}`)).toBeChecked()
  const cards = (await ownersCards('owner')).cards
  expect(cards.find((c) => c.id === tick.id)?.done).toBe(true)
  expect(cards.find((c) => c.id === move.id)?.on).toBe(tomorrow)

  // No managers in Owners, so the manager tools are the owners' alone.
  expect(await boardManagerItems(page)).toEqual([])
  expect(await status('ownersAsst', 'GET', `/api/boards/${OWNERS}/tasks/history`)).toBe(403)
  expect(await status('ownersAsst', 'POST', `/api/boards/${OWNERS}/daily_items`, { name: tempTag('O3 Daily') })).toBe(403)
  expect(await status('owner', 'GET', `/api/boards/${OWNERS}/tasks/history`)).toBe(200)
})

test('O4: Boards → Owners; adds a card; a card the owner locked is refused with the owners wording', async ({ page }) => {
  const list = await tempList('owner', OWNERS, 'O4')
  const locked = await tempCard('owner', OWNERS, list.id, 'O4 Locked')
  expect((await (await apiAs('owner')).post(`/api/idea_boards/${OWNERS}/cards/${locked.id}/lock`)).status()).toBe(200)

  await openIdeas(page, '/boards/office')
  expect(await switcherEntries(page)).toEqual(['Office', 'Owners', 'Company'])
  await page.getByTestId('board-switcher').click()
  await page.getByTestId(`board-switch-${OWNERS}`).click()
  await expect(page).toHaveURL(/\/boards\/owners$/)
  await expect(page.getByTestId('idea-board')).toBeVisible()

  const title = tempTag('O4 New card')
  await page.getByTestId(`idea-add-card-${list.id}`).click()
  await page.getByTestId(`idea-add-card-input-${list.id}`).fill(title)
  const added = written(page, 'POST', /\/api\/idea_boards\/owners\/cards$/)
  await page.getByTestId(`idea-add-card-save-${list.id}`).click()
  await added
  await page.reload()
  await expect(page.getByTestId(`idea-list-${list.id}`).getByText(title)).toBeVisible()

  await openIdeas(page, `/boards/${OWNERS}/cards/${locked.id}`)
  const dialog = page.getByTestId('idea-card-dialog')
  await expect(dialog.getByTestId('idea-card-locked')).toContainText('Only an owner can change it. Notes stay open.')
  await expect(dialog.getByTestId('idea-card-title-input')).toHaveCount(0)

  const res = await (await apiAs('ownersAsst')).patch(`/api/idea_boards/${OWNERS}/cards/${locked.id}`, { data: { title: tempTag('O4 changed') } })
  expect(res.status()).toBe(423)
  expect((await res.json()).message).toBe('Locked by an owner')

  // Manage and History are the owners'.
  expect(await status('ownersAsst', 'POST', `/api/idea_boards/${OWNERS}/cards/${locked.id}/unlock`)).toBe(403)
  expect(await status('ownersAsst', 'GET', `/api/idea_boards/${OWNERS}/history`)).toBe(403)
})

test.describe('O10', () => {
  // The message_posted bell is off by default (D23); turn it on for the people
  // checked, and put their preferences back after.
  const watched: PersonaKey[] = ['owner', 'owner2', 'office1', 'dualMgr']
  const saved = new Map<PersonaKey, Record<string, unknown>>()

  test.beforeAll(async () => {
    for (const p of watched) {
      const api = await apiAs(p)
      const prefs = (await (await api.get('/api/notification_preferences')).json()).data as Record<string, Record<string, boolean>>
      saved.set(p, prefs)
      const res = await api.put('/api/notification_preferences', { data: { prefs: { ...prefs, message_posted: { ...prefs.message_posted, in_app: true } } } })
      expect(res.status(), await res.text()).toBe(200)
    }
  })

  test.afterAll(async () => {
    for (const [p, prefs] of saved) await (await apiAs(p)).put('/api/notification_preferences', { data: { prefs } })
  })

  test('O10: a post in Owners reaches owner and owner2 in-app; office1 and dualMgr get nothing and can\'t read it', async ({ page }) => {
    expect(await channelNames(page)).toContain('Owners')
    const body = tempTag('O10 Partners meeting moved')
    await page.goto('/messages/dept:owners')
    await page.getByPlaceholder('Message Owners').fill(body)
    const posted = page.waitForResponse((r) => r.url().endsWith('/api/channels/dept:owners/messages') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Send message' }).click()
    const res = await posted
    expect(res.status()).toBe(201)
    const messageId = (await res.json()).data.id as number
    await page.reload()
    await expect(page.getByText(body)).toBeVisible()

    const noticeFor = async (p: PersonaKey) => {
      const items = (await (await (await apiAs(p)).get('/api/notifications')).json()).data as { event: string; data: { message_id?: number } }[]
      return items.filter((n) => n.event === 'message_posted' && n.data?.message_id === messageId).length
    }
    // Delivery runs in the background.
    await expect.poll(() => noticeFor('owner'), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => noticeFor('owner2'), { timeout: 15_000 }).toBe(1)
    expect(await noticeFor('office1')).toBe(0)
    expect(await noticeFor('dualMgr')).toBe(0)

    // The owners read it; office1 (not a member until O2) can't.
    const ownerMsgs = (await (await (await apiAs('owner')).get('/api/channels/dept:owners/messages')).json()).data as { body: string }[]
    expect(ownerMsgs.some((m) => m.body === body)).toBe(true)
    expect(await status('office1', 'GET', '/api/channels/dept:owners/messages')).toBe(403)
  })
})
