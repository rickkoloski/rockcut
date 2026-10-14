import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_BOARDS,
  FUTURE,
  UNFINISHED,
  allBoardCardLink,
  boardMoveRule,
  boardPath,
  boardTarget,
  boardTitle,
  departmentSections,
  describeEvent,
  rangeForDay,
  readBoard,
  readHideCompleted,
  readPhoneView,
  readSpan,
  taskError,
  taskGone,
  switcherBoards,
  taskSaveError,
  writeBoard,
  writeSpan,
} from './tasks'
import type { AllBoardCard, TaskBoardEntry, TaskEvent } from './types'

const err = (status: number, url: string, data: Record<string, unknown> = {}) => ({ response: { status, data }, config: { url } })

describe('taskGone / taskError', () => {
  it('a 410, or a 404 on a task route, reads "This task was deleted"', () => {
    const gone = [
      err(410, '/api/boards/brewery/tasks/12', { error: 'deleted', message: 'This task was deleted' }),
      err(404, '/api/boards/brewery/tasks/12', { error: 'not_found', message: 'Not found' }),
      err(404, '/api/boards/brewery/tasks/12/move', { error: 'not_found', message: 'Not found' }),
      err(404, '/api/boards/brewery/tasks/12/series'),
    ]
    for (const e of gone) {
      expect(taskGone(e)).toBe(true)
      expect(taskError(e)).toBe('This task was deleted')
    }
  })

  it('other refusals keep their own message', () => {
    const daily = err(404, '/api/boards/brewery/daily_checks/2026-10-12/3', { error: 'not_found', message: 'Not found' })
    expect(taskGone(daily)).toBe(false)
    expect(taskError(daily)).toBe('Not found')
    const locked = err(422, '/api/boards/brewery/tasks/12/move', { error: 'locked', message: 'A finished task can’t be moved' })
    expect(taskGone(locked)).toBe(false)
    expect(taskError(locked)).toBe('A finished task can’t be moved')
  })
})

describe('boardMoveRule', () => {
  const today = '2026-10-12'
  const tomorrow = '2026-10-13'

  it('desktop and the vertical view: anywhere but onto the Unfinished card', () => {
    for (const rule of [boardMoveRule(null, today, today), boardMoveRule('vertical', today, today)]) {
      expect(rule(today, tomorrow)).toBe(true)
      expect(rule(UNFINISHED, tomorrow)).toBe(true)
      expect(rule(today, FUTURE)).toBe(true)
      expect(rule(today, UNFINISHED)).toBe(false)
      expect(rule(FUTURE, UNFINISHED)).toBe(false)
      expect(rule(UNFINISHED, UNFINISHED)).toBe(true)
    }
  })

  it('one day on today: its own list, or Unfinished → today', () => {
    const rule = boardMoveRule('day', today, today)
    expect(rule(today, today)).toBe(true)
    expect(rule(UNFINISHED, today)).toBe(true)
    expect(rule(today, tomorrow)).toBe(false)
    expect(rule(today, FUTURE)).toBe(false)
    expect(rule(today, UNFINISHED)).toBe(false)
  })

  it('one day on another day: its own list only', () => {
    const rule = boardMoveRule('day', tomorrow, today)
    expect(rule(tomorrow, tomorrow)).toBe(true)
    expect(rule(UNFINISHED, tomorrow)).toBe(false)
    expect(rule(UNFINISHED, today)).toBe(false)
  })
})

describe('describeEvent: made_repeating (Decision 6)', () => {
  const ev = (detail: Record<string, unknown>): TaskEvent => ({
    id: 1,
    task_id: 7,
    action: 'made_repeating',
    title: 'Keg Wash FV1',
    actor_id: 1,
    actor_name: 'Kate',
    on_shared_device: false,
    detail,
    inserted_at: '2026-10-14T18:00:00Z',
  })
  const names = { users: { '5': 'Sam Brewer' }, items: {} }
  const repeat = { frequency: 'weekly', interval: 1, weekdays: [3] }

  it('names the day and the rule', () => {
    expect(describeEvent(ev({ due_on: '2026-10-14', repeat, from: {}, to: {} }), names)).toMatch(/^Made Keg Wash FV1 repeat from Wed 10\/14 \(.+\)$/)
  })

  it('adds what else the save changed', () => {
    const text = describeEvent(ev({ due_on: '2026-10-14', repeat, from: { title: 'Keg Wash', assignee_id: null }, to: { title: 'Keg Wash FV1', assignee_id: 5 } }), names)
    expect(text).toMatch(/; renamed from Keg Wash; assigned to Sam Brewer$/)
  })
})

describe('boardPath (D41)', () => {
  it('puts the department and the segments under /api/boards', () => {
    expect(boardPath('brewery', 'tasks')).toBe('/api/boards/brewery/tasks')
    expect(boardPath('brewery', 'tasks', 12, 'move')).toBe('/api/boards/brewery/tasks/12/move')
    expect(boardPath('bar', 'daily_checks', '2026-10-12', 3)).toBe('/api/boards/bar/daily_checks/2026-10-12/3')
  })
})

describe('the board’s remembered choices (D41 storage keys)', () => {
  const stubStorage = (initial: Record<string, string>) => {
    const store = new Map(Object.entries(initial))
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    return store
  }
  afterEach(() => vi.unstubAllGlobals())

  it('reads a choice saved under the old key once, and keeps it under the new one', () => {
    const store = stubStorage({
      'rockcut.breweryTasks.span': '7',
      'rockcut.breweryTasks.hideCompleted': 'true',
      'rockcut.breweryTasks.phoneView': 'day',
    })
    expect(readSpan()).toBe(7)
    expect(readHideCompleted()).toBe(true)
    expect(readPhoneView()).toBe('day')
    expect(store.get('rockcut.tasks.span')).toBe('7')
    expect(store.get('rockcut.tasks.hideCompleted')).toBe('true')
    expect(store.get('rockcut.tasks.phoneView')).toBe('day')
  })

  it('the new key wins; writes go to the new key only', () => {
    const store = stubStorage({ 'rockcut.breweryTasks.span': '7', 'rockcut.tasks.span': '14' })
    expect(readSpan()).toBe(14)
    store.set('rockcut.breweryTasks.span', 'old')
    writeSpan(7)
    expect(store.get('rockcut.tasks.span')).toBe('7')
    expect(store.get('rockcut.breweryTasks.span')).toBe('old')
    stubStorage({})
    expect([readSpan(), readHideCompleted(), readPhoneView()]).toEqual([14, false, 'vertical'])
  })

  it('storage that throws gives the defaults', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect([readSpan(), readHideCompleted(), readPhoneView()]).toEqual([14, false, 'vertical'])
    expect(() => writeSpan(7)).not.toThrow()
  })

  it('an old value is still read when writing the new key throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'rockcut.breweryTasks.span' ? '7' : null),
      setItem: () => {
        throw new Error('full')
      },
    })
    expect(readSpan()).toBe(7)
  })
})

describe('boardTarget: which board a Tasks URL shows (D41 §3.5)', () => {
  const boards = [{ key: 'brewery' }, { key: 'bar' }]

  it('a board the person can open shows', () => {
    expect(boardTarget(boards, 'bar', 'brewery')).toBe('bar')
  })

  it('/tasks opens the remembered board, else the first', () => {
    expect(boardTarget(boards, null, 'bar')).toBe('bar')
    expect(boardTarget(boards, null, null)).toBe('brewery')
    expect(boardTarget(boards, null, 'office')).toBe('brewery')
  })

  it('a board they can’t open goes to their first (S102, S109), and with none, Home (S114)', () => {
    expect(boardTarget([{ key: 'bar' }], 'brewery', 'brewery')).toBe('bar')
    expect(boardTarget(boards, 'other', null)).toBe('brewery')
    expect(boardTarget([], 'bar', 'bar')).toBeNull()
    expect(boardTarget([], null, null)).toBeNull()
  })
})

describe('the switcher’s words (D41)', () => {
  it('titles a board "<Department> tasks"', () => {
    expect(boardTitle({ name: 'Taproom' })).toBe('Taproom tasks')
  })

  it('an assignee from another department reads "Only members of the Taproom can be assigned" (S105)', () => {
    const refused = { response: { status: 422, data: { errors: { assignee_id: ['must be a Taproom member'] } } } }
    expect(taskSaveError(refused, { name: 'Taproom' })).toBe('Only members of the Taproom can be assigned')
    expect(taskSaveError(err(422, '/api/boards/bar/tasks', { message: 'Pick a day to repeat' }), { name: 'Taproom' })).toBe('Pick a day to repeat')
  })

  it('History says who left which department (`left_<key>`)', () => {
    const left: TaskEvent = {
      id: 1,
      task_id: 2,
      action: 'unassigned',
      title: 'Lines',
      actor_id: 1,
      actor_name: 'Owner',
      on_shared_device: false,
      detail: { from: 5, reason: 'left_bar' },
      inserted_at: '2026-10-13T12:00:00Z',
    }
    const names = { users: { '5': 'Sam Pour' }, items: {} }
    expect(describeEvent(left, names, { key: 'bar', name: 'Taproom' })).toBe('Unassigned Lines from Sam Pour (left the Taproom)')
    expect(describeEvent(left, names, { key: 'brewery', name: 'Brewery' })).toBe('Unassigned Lines from Sam Pour')
  })
})

describe('the remembered board (rockcut.tasks.board)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is written and read back, with no old key to fall back to', () => {
    const store = new Map<string, string>([['rockcut.breweryTasks.board', 'brewery']])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    expect(readBoard()).toBeNull()
    writeBoard('bar')
    expect(readBoard()).toBe('bar')
  })
})

describe('All departments in task_boards (D41 §3.6)', () => {
  const entry = (key: string, name: string): TaskBoardEntry => ({ key, name, color: '#000', manage: true })
  const all: TaskBoardEntry = { key: ALL_BOARDS, name: 'All departments', manage: false }
  const owner = [entry('brewery', 'Brewery'), entry('bar', 'Taproom'), entry('office', 'Office'), entry('sales', 'Sales'), all]

  it('the switcher lists the boards in order, then All departments last; only an owner has it', () => {
    expect(switcherBoards(owner).map((b) => b.key)).toEqual(['brewery', 'bar', 'office', 'sales', 'all'])
    // Last even if it came first.
    expect(switcherBoards([all, ...owner.slice(0, 2)]).map((b) => b.key)).toEqual(['brewery', 'bar', 'all'])
    const floater = [entry('brewery', 'Brewery'), entry('bar', 'Taproom')]
    expect(switcherBoards(floater).map((b) => b.key)).toEqual(['brewery', 'bar'])
  })

  it('the "first board" is never All departments', () => {
    expect(boardTarget(owner, null, null)).toBe('brewery')
    expect(boardTarget([all, ...owner.slice(0, 4)], null, null)).toBe('brewery')
    expect(boardTarget([all, ...owner.slice(0, 4)], 'nope', null)).toBe('brewery')
    expect(boardTarget([all], null, null)).toBeNull()
  })

  it('an owner opens it from the URL or the remembered choice; anyone else goes to their first board (S120)', () => {
    expect(boardTarget(owner, 'all', null)).toBe('all')
    expect(boardTarget(owner, null, 'all')).toBe('all')
    const breweryMgr = [entry('brewery', 'Brewery')]
    expect(boardTarget(breweryMgr, 'all', null)).toBe('brewery')
    expect(boardTarget(breweryMgr, null, 'all')).toBe('brewery')
    expect(boardTarget([], 'all', 'all')).toBeNull()
  })

  it('its title is just "All departments"', () => {
    expect(boardTitle(all)).toBe('All departments')
    expect(boardTitle(entry('bar', 'Taproom'))).toBe('Taproom tasks')
  })
})

describe('departmentSections: the All departments view grouped by department', () => {
  const boards: TaskBoardEntry[] = [
    { key: 'brewery', name: 'Brewery', color: '#b87', manage: true },
    { key: 'bar', name: 'Taproom', color: '#2e6', manage: true },
    { key: 'office', name: 'Office', color: '#3f8', manage: true },
    { key: 'sales', name: 'Sales', color: '#7a4', manage: true },
    { key: ALL_BOARDS, name: 'All departments', manage: false },
  ]
  const card = (id: number, department: string, extra: Partial<AllBoardCard> = {}) =>
    ({ id, key: `${id}:2026-10-14`, day: '2026-10-14', department, title: `T${id}`, done: false, assignee_id: null, ...extra }) as AllBoardCard
  const everything = () => true

  it('in the boards’ order, each keeping its own cards’ order; departments with nothing are left out', () => {
    const cards = [card(3, 'bar'), card(1, 'brewery'), card(2, 'brewery'), card(4, 'office')]
    const sections = departmentSections(boards, cards, [], everything)
    expect(sections.map((s) => [s.board.key, s.cards.map((c) => c.id)])).toEqual([
      ['brewery', [1, 2]],
      ['bar', [3]],
      ['office', [4]],
    ])
  })

  it('a section carries its board’s Daily count, when it has one', () => {
    const counts = [{ department: 'brewery', done: 3, total: 4 }]
    const sections = departmentSections(boards, [card(1, 'brewery'), card(2, 'bar')], counts, everything)
    expect(sections.map((s) => s.daily)).toEqual([{ department: 'brewery', done: 3, total: 4 }, null])
  })

  it('a department with a Daily count has a section even with no tasks that day: just its count', () => {
    const counts = [{ department: 'brewery', done: 2, total: 4 }]
    const sections = departmentSections(boards, [card(4, 'office')], counts, everything)
    expect(sections.map((s) => [s.board.key, s.cards.map((c) => c.id), s.daily?.done ?? null])).toEqual([
      ['brewery', [], 2],
      ['office', [4], null],
    ])
    expect(departmentSections(boards, [], counts, everything).map((s) => s.board.key)).toEqual(['brewery'])
  })

  it('the filter decides which cards show: a department whose cards are all hidden is left out unless it has a Daily count', () => {
    const counts = [{ department: 'brewery', done: 0, total: 4 }]
    const cards = [card(1, 'brewery', { done: true }), card(2, 'bar', { assignee_id: 7 }), card(3, 'bar'), card(4, 'office', { done: true })]
    const sections = departmentSections(boards, cards, counts, (c) => !c.done && c.assignee_id == null)
    expect(sections.map((s) => [s.board.key, s.cards.map((c) => c.id)])).toEqual([
      ['brewery', []],
      ['bar', [3]],
    ])
    expect(departmentSections(boards, [], [], everything)).toEqual([])
  })
})

describe('a card on the All departments view opens on its board (S119)', () => {
  const card = (day: string) => ({ id: 1, key: `1:${day}`, day, department: 'bar' }) as AllBoardCard

  it('at its day; Unfinished at today; Future at Future', () => {
    expect(allBoardCardLink(card('2026-10-15'), '2026-10-13')).toBe('/tasks/bar?day=2026-10-15')
    expect(allBoardCardLink(card(UNFINISHED), '2026-10-13')).toBe('/tasks/bar?day=2026-10-13')
    expect(allBoardCardLink(card(FUTURE), '2026-10-13')).toBe('/tasks/bar?day=future')
  })

  it('?day= keeps a range that holds the day, else starts the span on it', () => {
    expect(rangeForDay('2026-10-15', '2026-10-13', '2026-10-26', 14)).toEqual({ from: '2026-10-13', to: '2026-10-26' })
    expect(rangeForDay('2026-10-30', '2026-10-13', '2026-10-19', 7)).toEqual({ from: '2026-10-30', to: '2026-11-05' })
    expect(rangeForDay('2026-10-01', '2026-10-13', '2026-10-26', 14)).toEqual({ from: '2026-10-01', to: '2026-10-14' })
    expect(rangeForDay(FUTURE, '2026-10-13', '2026-10-19', 7)).toEqual({ from: '2026-10-13', to: '2026-10-19' })
  })
})
