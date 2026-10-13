import { describe, expect, it } from 'vitest'
import { FUTURE, UNFINISHED, boardMoveRule, describeEvent, taskError, taskGone } from './breweryTasks'
import type { TaskEvent } from './types'

const err = (status: number, url: string, data: Record<string, unknown> = {}) => ({ response: { status, data }, config: { url } })

describe('taskGone / taskError', () => {
  it('a 410, or a 404 on a task route, reads "This task was deleted"', () => {
    const gone = [
      err(410, '/api/brewery/tasks/12', { error: 'deleted', message: 'This task was deleted' }),
      err(404, '/api/brewery/tasks/12', { error: 'not_found', message: 'Not found' }),
      err(404, '/api/brewery/tasks/12/move', { error: 'not_found', message: 'Not found' }),
      err(404, '/api/brewery/tasks/12/series'),
    ]
    for (const e of gone) {
      expect(taskGone(e)).toBe(true)
      expect(taskError(e)).toBe('This task was deleted')
    }
  })

  it('other refusals keep their own message', () => {
    const daily = err(404, '/api/brewery/daily_checks/2026-10-12/3', { error: 'not_found', message: 'Not found' })
    expect(taskGone(daily)).toBe(false)
    expect(taskError(daily)).toBe('Not found')
    const locked = err(422, '/api/brewery/tasks/12/move', { error: 'locked', message: 'A finished task can’t be moved' })
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
