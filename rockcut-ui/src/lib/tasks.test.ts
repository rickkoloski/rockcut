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
  cardPeople,
  cardShown,
  departmentSections,
  describeEvent,
  rangeForDay,
  samePeople,
  coloradoToday,
  defaultRange,
  readBoard,
  readFirstDay,
  readHideCompleted,
  readHideShifts,
  readPhoneView,
  readSpan,
  taskError,
  taskGone,
  switcherBoards,
  taskSaveError,
  todaysTasks,
  weekStart,
  writeBoard,
  writeFirstDay,
  writeHideCompleted,
  writeHideShifts,
  writePhoneView,
  writeSpan,
} from './tasks'
import type { AllBoardCard, DailyCardItem, TaskBoardData, TaskBoardEntry, TaskCardData, TaskEvent } from './types'

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

describe('describeEvent: a rule change (D53)', () => {
  const ev = (detail: Record<string, unknown>): TaskEvent => ({
    id: 1,
    task_id: 7,
    action: 'edited',
    title: 'Keg Wash',
    actor_id: 1,
    actor_name: 'Kate',
    on_shared_device: false,
    detail,
    inserted_at: '2026-10-14T18:00:00Z',
  })
  const names = { users: { '5': 'Sam Brewer', '6': 'Riley Wort' }, items: {} }
  const repeat = { to: { frequency: 'weekly', interval: 1, weekdays: [1, 3] } }

  it('reads as the rule alone when only the rule changed', () => {
    expect(describeEvent(ev({ scope: 'following', repeat, removed: 4, kept: 0 }), names)).toMatch(/^Changed how Keg Wash repeats \(this and following\): .+; removed 4$/)
  })

  it('names the people when the same save changed them', () => {
    const text = describeEvent(ev({ scope: 'following', repeat, removed: 4, kept: 0, from: { assignee_ids: [5] }, to: { assignee_ids: [6] } }), names)
    expect(text).toMatch(/^Changed how Keg Wash repeats .+; removed 4; Assigned Riley Wort to Keg Wash; removed Sam Brewer$/)
  })
})

describe('describeEvent: assignees, old and new shapes (D53)', () => {
  const ev = (action: TaskEvent['action'], detail: Record<string, unknown>): TaskEvent => ({
    id: 1,
    task_id: 7,
    action,
    title: 'Keg Wash',
    actor_id: 1,
    actor_name: 'Kate',
    on_shared_device: false,
    detail,
    inserted_at: '2026-10-14T18:00:00Z',
  })
  const names = { users: { '5': 'Sam Pour', '6': 'Jake Brewer' }, items: {} }
  const taproom = { key: 'bar', name: 'Taproom' }
  const repeat = { frequency: 'weekly', interval: 1, weekdays: [3] }

  it('reads id lists', () => {
    expect(describeEvent(ev('assigned', { from: [], to: [5, 6] }), names)).toBe('Assigned Sam Pour, Jake Brewer to Keg Wash')
    expect(describeEvent(ev('assigned', { from: [5, 6], to: [5] }), names)).toBe('Removed Jake Brewer from Keg Wash')
    expect(describeEvent(ev('assigned', { from: [5], to: [6] }), names)).toBe('Assigned Jake Brewer to Keg Wash; removed Sam Pour')
    expect(describeEvent(ev('assigned', { from: [5], to: [5, 6], scope: 'this' }), names)).toBe('Assigned Jake Brewer to Keg Wash (just this one)')
    expect(describeEvent(ev('created', { due_on: null, assignee_ids: [5, 6] }), names)).toBe('Added Keg Wash to Future, assigned to Sam Pour, Jake Brewer')
    expect(describeEvent(ev('created', { due_on: null, assignee_ids: [] }), names)).toBe('Added Keg Wash to Future')
    expect(describeEvent(ev('edited', { scope: 'following', from: { assignee_ids: [] }, to: { assignee_ids: [5, 6] } }), names)).toBe('Assigned Sam Pour, Jake Brewer to Keg Wash (this and following)')
    expect(describeEvent(ev('unassigned', { from: [5, 6], to: [5], reason: 'left_bar' }), names, taproom)).toBe('Removed Jake Brewer from Keg Wash (left the Taproom)')
    expect(describeEvent(ev('made_repeating', { due_on: '2026-10-14', repeat, from: { assignee_ids: [] }, to: { assignee_ids: [5, 6] } }), names)).toMatch(/; assigned to Sam Pour, Jake Brewer$/)
  })

  it('reads old single-assignee events exactly as before', () => {
    expect(describeEvent(ev('assigned', { from: null, to: 5 }), names)).toBe('Assigned Keg Wash to Sam Pour')
    expect(describeEvent(ev('assigned', { from: 5, to: 6 }), names)).toBe('Reassigned Keg Wash from Sam Pour to Jake Brewer')
    expect(describeEvent(ev('assigned', { from: 5, to: null, scope: 'this' }), names)).toBe('Unassigned Keg Wash (was Sam Pour) (just this one)')
    expect(describeEvent(ev('created', { due_on: null, assignee_id: 5 }), names)).toBe('Added Keg Wash to Future, assigned to Sam Pour')
    expect(describeEvent(ev('edited', { scope: 'following', from: { assignee_id: null }, to: { assignee_id: 5 } }), names)).toBe('Assigned Keg Wash to Sam Pour (this and following)')
    expect(describeEvent(ev('unassigned', { from: 6, to: null, reason: 'left_bar' }), names, taproom)).toBe('Unassigned Keg Wash from Jake Brewer (left the Taproom)')
    expect(describeEvent(ev('assigned', { from: null, to: 99 }), names)).toBe('Assigned Keg Wash to someone no longer here')
  })
})

describe('several people on a task (D53)', () => {
  const on = (assignees: { id: number; name: string }[]) =>
    ({ done: false, assignees, assignee_id: assignees[0]?.id ?? null, assignee_name: assignees[0]?.name ?? null }) as TaskCardData
  const both = on([
    { id: 5, name: 'Sam Pour' },
    { id: 6, name: 'Jake Brewer' },
  ])

  it('My tasks is any task I am on, second place too (S217)', () => {
    expect(cardShown(both, 'mine', false, 5)).toBe(true)
    expect(cardShown(both, 'mine', false, 6)).toBe(true)
    expect(cardShown(both, 'mine', false, 7)).toBe(false)
    expect(cardShown(on([]), 'mine', false, undefined)).toBe(false)
  })

  it('Unassigned is nobody', () => {
    expect(cardShown(both, 'unassigned', false, 5)).toBe(false)
    expect(cardShown(on([]), 'unassigned', false, 5)).toBe(true)
  })

  it('an API on the old version sends one person: the board reads that', () => {
    const old = { assignee_id: 5, assignee_name: 'Sam Pour' }
    expect(cardPeople(old)).toEqual([{ id: 5, name: 'Sam Pour' }])
    expect(cardPeople({ assignee_id: null, assignee_name: null })).toEqual([])
    expect(cardShown({ ...old, done: false } as TaskCardData, 'mine', false, 5)).toBe(true)
  })

  it('the same people in another order are the same', () => {
    expect(samePeople([5, 6], [6, 5])).toBe(true)
    expect(samePeople([5, 6], [5])).toBe(false)
    expect(samePeople([5], [6])).toBe(false)
    expect(samePeople([], [])).toBe(true)
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
    expect(readSpan('brewery')).toBe(7)
    expect(readHideCompleted('brewery')).toBe(true)
    expect(readPhoneView('brewery')).toBe('day')
    expect(store.get('rockcut.tasks.span')).toBe('7')
    expect(store.get('rockcut.tasks.hideCompleted')).toBe('true')
    expect(store.get('rockcut.tasks.phoneView')).toBe('day')
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
    expect([readSpan('bar'), readHideCompleted('bar'), readPhoneView('bar'), readFirstDay('bar')]).toEqual([14, false, 'vertical', 'today'])
    expect(() => writeSpan('bar', 7)).not.toThrow()
    expect(() => writeFirstDay('bar', 'monday')).not.toThrow()
  })

  it('an old value is still read when writing the new key throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'rockcut.breweryTasks.span' ? '7' : null),
      setItem: () => {
        throw new Error('full')
      },
    })
    expect(readSpan('brewery')).toBe(7)
  })
})

describe('the choices per board (D42 §2.8)', () => {
  const stubStorage = (initial: Record<string, string>) => {
    const store = new Map(Object.entries(initial))
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    return store
  }
  afterEach(() => vi.unstubAllGlobals())

  it('S135: a board without its own choice starts from the shared one, then keeps it as its own', () => {
    const store = stubStorage({
      'rockcut.tasks.span': '7',
      'rockcut.tasks.hideCompleted': 'true',
      'rockcut.tasks.phoneView': 'day',
    })
    expect([readSpan('brewery'), readHideCompleted('brewery'), readPhoneView('brewery')]).toEqual([7, true, 'day'])
    expect(store.get('rockcut.tasks.span.brewery')).toBe('7')
    expect(store.get('rockcut.tasks.hideCompleted.brewery')).toBe('true')
    expect(store.get('rockcut.tasks.phoneView.brewery')).toBe('day')
    // The shared value isn't written again.
    writeSpan('brewery', 14)
    expect(store.get('rockcut.tasks.span')).toBe('7')
    expect(readSpan('brewery')).toBe(14)
  })

  it('S134: each board keeps its own, All departments included', () => {
    const store = stubStorage({})
    writeSpan('brewery', 7)
    writeHideCompleted('brewery', true)
    writeFirstDay(ALL_BOARDS, 'monday')
    writePhoneView('bar', 'day')
    expect([readSpan('brewery'), readHideCompleted('brewery'), readFirstDay('brewery')]).toEqual([7, true, 'today'])
    expect([readSpan('bar'), readHideCompleted('bar'), readPhoneView('bar')]).toEqual([14, false, 'day'])
    expect([readFirstDay(ALL_BOARDS), readPhoneView(ALL_BOARDS)]).toEqual(['monday', 'vertical'])
    expect(store.get('rockcut.tasks.firstDay.all')).toBe('monday')
  })

  it('a board’s own value wins over the shared one; the D41 key before it still counts as shared', () => {
    stubStorage({ 'rockcut.tasks.span': '7', 'rockcut.tasks.span.bar': '14', 'rockcut.breweryTasks.hideCompleted': 'true' })
    expect(readSpan('bar')).toBe(14)
    expect(readSpan('office')).toBe(7)
    expect(readHideCompleted('sales')).toBe(true)
  })

  it('an unknown first day reads as Today', () => {
    stubStorage({ 'rockcut.tasks.firstDay.bar': 'friday' })
    expect(readFirstDay('bar')).toBe('today')
  })
})

describe('the first day and the range (D42 §2.9)', () => {
  // 2026-10-14 is a Wednesday.
  it('the week’s Sunday or Monday; Today is the day itself', () => {
    expect(weekStart('2026-10-14', 'today')).toBe('2026-10-14')
    expect(weekStart('2026-10-14', 'sunday')).toBe('2026-10-11')
    expect(weekStart('2026-10-14', 'monday')).toBe('2026-10-12')
    // On the boundary days themselves.
    expect(weekStart('2026-10-11', 'sunday')).toBe('2026-10-11')
    expect(weekStart('2026-10-11', 'monday')).toBe('2026-10-05')
    expect(weekStart('2026-10-12', 'monday')).toBe('2026-10-12')
    expect(weekStart('2026-10-17', 'sunday')).toBe('2026-10-11')
  })

  it('S136, S137: 1 week and 2 weeks from the week holding today', () => {
    expect(defaultRange('2026-10-14', 7, 'monday')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(defaultRange('2026-10-14', 14, 'sunday')).toEqual({ from: '2026-10-11', to: '2026-10-24' })
    expect(defaultRange('2026-10-14', 7, 'today')).toEqual({ from: '2026-10-14', to: '2026-10-20' })
  })

  it('a week across a month and a year', () => {
    expect(defaultRange('2026-11-01', 7, 'monday')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(defaultRange('2027-01-01', 7, 'sunday')).toEqual({ from: '2026-12-27', to: '2027-01-02' })
    expect(defaultRange('2027-01-01', 14, 'monday')).toEqual({ from: '2026-12-28', to: '2027-01-10' })
  })

  it('Colorado’s today: late evening there is still that day', () => {
    vi.useFakeTimers()
    // 11:30pm Wednesday in Denver is 05:30 Thursday UTC.
    vi.setSystemTime(new Date('2026-10-15T05:30:00Z'))
    expect(coloradoToday()).toBe('2026-10-14')
    expect(defaultRange(coloradoToday(), 7, 'monday').from).toBe('2026-10-12')
    vi.useRealTimers()
  })

  it('S138: ?day= out of the range moves to the week holding it', () => {
    expect(rangeForDay('2026-10-20', '2026-10-12', '2026-10-18', 7, 'monday')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(rangeForDay('2026-10-20', '2026-10-11', '2026-10-17', 14, 'sunday')).toEqual({ from: '2026-10-18', to: '2026-10-31' })
    expect(rangeForDay('2026-10-13', '2026-10-12', '2026-10-18', 7, 'monday')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
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

  it('D53: a refused person is named, as the API says', () => {
    const refused = { response: { status: 422, data: { errors: { assignee_ids: ['Riley Wort must be a Taproom member', 'Sam Mash must be a Taproom member'] } } } }
    expect(taskSaveError(refused, { name: 'Taproom' })).toBe('Riley Wort must be a Taproom member; Sam Mash must be a Taproom member')
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

// D40 (S50): the Brewery Dashboard's Today's tasks card.
describe('todaysTasks', () => {
  const card = (id: number, over: Partial<TaskCardData> = {}) =>
    ({ id, key: `${id}:2026-10-14`, title: `T${id}`, done: false, due_on: '2026-10-14', assignee_name: null, ...over }) as TaskCardData
  const item = (id: number, checked: boolean) =>
    ({ daily_item_id: id, name: `D${id}`, active: true, checked, completed_by_name: null, completed_at: null }) as DailyCardItem

  it('Daily 2/4 with the unticked names, the first five open tasks, +2 more, 1 unfinished', () => {
    const cards = [1, 2, 3, 4, 5, 6, 7].map((id) => card(id))
    cards.push(card(8, { done: true }))
    // Finished today from another day: not open, not listed.
    cards.push(card(9, { done: true, due_on: '2026-10-12' }))
    const board = {
      from: '2026-10-14',
      to: '2026-10-14',
      today: '2026-10-14',
      days: [{ date: '2026-10-14', header: {}, cards, daily: { date: '2026-10-14', done: 2, total: 4, items: [item(1, true), item(2, false), item(3, true), item(4, false)] } }],
      unfinished: [card(10, { due_on: '2026-10-10' })],
      future: [card(11, { due_on: null })],
    } as unknown as TaskBoardData

    const s = todaysTasks(board)
    expect(s.daily).toMatchObject({ done: 2, total: 4 })
    expect(s.daily!.unticked.map((i) => i.name)).toEqual(['D2', 'D4'])
    expect(s.tasks.map((t) => t.id)).toEqual([1, 2, 3, 4, 5])
    expect(s.more).toBe(2)
    expect(s.unfinished).toBe(1)
  })

  it('D49 QA 3: Show planned batches off leaves out planned batches\' tasks (not a scheduled one\'s or a CIP)', () => {
    const production = (planned: boolean) => ({ step_id: 1, batch_id: planned ? 1 : null, batch_status: planned ? 'planned' : null, planned, step_name: 'FDH', batch_label: null })
    const cards = [card(1, { production: production(true) }), card(2), card(3, { production: production(false) })]
    const board = {
      today: '2026-10-14',
      days: [{ date: '2026-10-14', cards, daily: { done: 0, total: 0, items: [] } }],
      unfinished: [],
    } as unknown as TaskBoardData
    expect(todaysTasks(board).tasks.map((t) => t.id)).toEqual([1, 2, 3])
    expect(todaysTasks(board, false).tasks.map((t) => t.id)).toEqual([2, 3])
  })
})

describe('Hide shifts (D45 §3.3)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is off by default and kept per board, under rockcut.tasks.hideShifts.<board>', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    expect(readHideShifts('brewery')).toBe(false)
    writeHideShifts('brewery', true)
    expect(store.get('rockcut.tasks.hideShifts.brewery')).toBe('true')
    expect([readHideShifts('brewery'), readHideShifts('bar')]).toEqual([true, false])
    writeHideShifts('brewery', false)
    expect(readHideShifts('brewery')).toBe(false)
  })

  it('storage that throws: off, and turning it on doesn’t throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readHideShifts('bar')).toBe(false)
    expect(() => writeHideShifts('bar', true)).not.toThrow()
  })
})
