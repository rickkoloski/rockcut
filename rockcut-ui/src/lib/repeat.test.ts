import { describe, expect, it } from 'vitest'
import {
  defaultRule,
  ordinal,
  removeLaterWording,
  reseed,
  ruleFromTaskSeries,
  ruleProblem,
  sameRule,
  summaryFromDetail,
  taskRepeatParams,
  taskRepeatSummary,
  type TaskRule,
} from './repeat'

// 2026-10-14 is a Wednesday, the 2nd of its month.
const WED = '2026-10-14'
const rule = (patch: Partial<TaskRule>, day = WED): TaskRule => ({ ...defaultRule(day), ...patch })

describe('defaultRule', () => {
  it('takes its weekday, date and week of the month from the day', () => {
    expect(defaultRule(WED, 'weekly')).toMatchObject({
      frequency: 'weekly',
      interval: 1,
      weekdays: [3],
      monthRule: 'day',
      dayOfMonth: 14,
      weekOfMonth: 2,
      weekday: 3,
      ends: 'never',
      startDate: WED,
    })
  })

  it('a 5th weekday is the last', () => {
    expect(defaultRule('2026-10-30').weekOfMonth).toBe(-1)
  })

  it('reseed moves to a new day and keeps the frequency and the end', () => {
    const r = reseed(rule({ frequency: 'monthly', ends: 'count', count: '3' }), '2026-10-31')
    expect(r).toMatchObject({ frequency: 'monthly', dayOfMonth: 31, weekdays: [6], ends: 'count', count: '3', startDate: '2026-10-31' })
  })
})

describe('taskRepeatSummary', () => {
  it.each([
    [{ frequency: 'weekly' }, 'Repeats every week on Wed'],
    [{ frequency: 'weekly', interval: 2, weekdays: [4, 1] }, 'Repeats every other week on Mon and Thu'],
    [{ frequency: 'weekly', interval: 3, weekdays: [1, 3, 5] }, 'Repeats every 3 weeks on Mon, Wed and Fri'],
    [{ frequency: 'weekly', weekdays: [] }, 'Pick at least one day'],
    [{ frequency: 'monthly' }, 'Repeats every month on the 14th'],
    [{ frequency: 'monthly', dayOfMonth: 31 }, 'Repeats every month on the 31st (or the last day)'],
    [{ frequency: 'monthly', dayOfMonth: 22 }, 'Repeats every month on the 22nd'],
    [{ frequency: 'monthly', monthRule: 'weekday', weekOfMonth: -1, weekday: 5 }, 'Repeats every month on the last Friday'],
    [{ frequency: 'quarterly', dayOfMonth: 15 }, 'Repeats every 3 months on the 15th'],
    [{ frequency: 'quarterly', monthRule: 'weekday', weekOfMonth: -1, weekday: 5 }, 'Repeats every 3 months on the last Friday'],
    [{ frequency: 'never' }, 'Does not repeat'],
  ] as [Partial<TaskRule>, string][])('%o → %s', (patch, text) => {
    expect(taskRepeatSummary(rule(patch))).toBe(text)
  })

  it('annually reads the first day', () => {
    expect(taskRepeatSummary(rule({ frequency: 'annually' }, '2027-03-01'))).toBe('Repeats every year on Mar 1')
    expect(taskRepeatSummary(rule({ frequency: 'annually' }, '2028-02-29'))).toBe(
      'Repeats every year on Feb 29 (Feb 28 in other years)',
    )
  })

  it('adds the end', () => {
    expect(taskRepeatSummary(rule({ frequency: 'weekly', interval: 2, weekdays: [1, 4], ends: 'until', until: '2027-03-31' }))).toBe(
      'Repeats every other week on Mon and Thu, until Mar 31, 2027',
    )
    expect(taskRepeatSummary(rule({ frequency: 'annually', ends: 'count', count: '3' }, '2027-03-01'))).toBe(
      'Repeats every year on Mar 1, 3 times',
    )
    expect(taskRepeatSummary(rule({ frequency: 'monthly', ends: 'count', count: '1' }))).toBe('Repeats every month on the 14th, 1 time')
    // An end that isn't chosen doesn't show.
    expect(taskRepeatSummary(rule({ frequency: 'weekly', ends: 'never', count: '3' }))).toBe('Repeats every week on Wed')
  })
})

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [23, '23rd'],
    [31, '31st'],
    [-1, 'last'],
  ])('%i → %s', (n, text) => expect(ordinal(n)).toBe(text))
})

describe('taskRepeatParams', () => {
  it('sends only the rule’s own options, and both ends', () => {
    expect(taskRepeatParams(rule({ frequency: 'weekly', weekdays: [4, 1], interval: 2 }))).toEqual({
      repeat: 'weekly',
      repeat_weekdays: [1, 4],
      repeat_interval: 2,
      repeat_until: '',
      repeat_count: '',
    })
    expect(taskRepeatParams(rule({ frequency: 'monthly', dayOfMonth: 31 }))).toEqual({
      repeat: 'monthly',
      repeat_month_rule: 'day',
      repeat_day_of_month: 31,
      repeat_until: '',
      repeat_count: '',
    })
    expect(taskRepeatParams(rule({ frequency: 'quarterly', monthRule: 'weekday', weekOfMonth: -1, weekday: 5, ends: 'until', until: '2027-12-31' }))).toEqual({
      repeat: 'quarterly',
      repeat_month_rule: 'weekday',
      repeat_week_of_month: -1,
      repeat_weekday: 5,
      repeat_until: '2027-12-31',
      repeat_count: '',
    })
    expect(taskRepeatParams(rule({ frequency: 'annually', ends: 'count', count: '3' }))).toEqual({ repeat: 'annually', repeat_until: '', repeat_count: 3 })
  })

  it('R1: Ends = Never sends explicit blanks, so a saved end is cleared', () => {
    const saved = rule({ frequency: 'weekly', ends: 'until', until: '2026-12-01' })
    const never = { ...saved, ends: 'never' as const }
    // The date still in the form isn't sent once Ends is Never.
    expect(taskRepeatParams(never)).toMatchObject({ repeat_until: '', repeat_count: '' })
    expect(sameRule(never, saved)).toBe(false)
    expect(taskRepeatParams({ ...saved, ends: 'count', count: '5' })).toMatchObject({ repeat_until: '', repeat_count: 5 })
  })

  it('round-trips through a saved series', () => {
    const r = rule({ frequency: 'quarterly', dayOfMonth: 15, ends: 'count', count: '4' }, '2026-10-15')
    const saved = ruleFromTaskSeries({
      frequency: 'quarterly',
      month_rule: 'day',
      interval: 1,
      weekdays: null,
      day_of_month: 15,
      week_of_month: null,
      weekday: null,
      until_date: null,
      count: 4,
      start_date: '2026-10-15',
    })
    expect(sameRule(saved, r)).toBe(true)
    expect(sameRule(saved, { ...r, dayOfMonth: 16 })).toBe(false)
  })
})

describe('ruleProblem', () => {
  it('needs a weekday, an end date on or after the day, and 1–400 times', () => {
    expect(ruleProblem(rule({ frequency: 'weekly', weekdays: [] }))).toMatch(/at least one day/)
    expect(ruleProblem(rule({ frequency: 'monthly', ends: 'until', until: '' }))).toMatch(/last date/)
    expect(ruleProblem(rule({ frequency: 'monthly', ends: 'until', until: '2026-10-13' }))).toMatch(/on or after/)
    expect(ruleProblem(rule({ frequency: 'annually', ends: 'count', count: '0' }))).toMatch(/1 to 400/)
    expect(ruleProblem(rule({ frequency: 'annually', ends: 'count', count: '401' }))).toMatch(/1 to 400/)
    expect(ruleProblem(rule({ frequency: 'annually', ends: 'count', count: '400' }))).toBeNull()
  })
})

describe('summaryFromDetail (History)', () => {
  it('reads the stored rule', () => {
    expect(summaryFromDetail({ frequency: 'weekly', interval: 1, weekdays: [3] }, WED)).toBe('Repeats every week on Wed')
    expect(summaryFromDetail({ frequency: 'annually', count: 3 }, '2027-03-01')).toBe('Repeats every year on Mar 1, 3 times')
    expect(summaryFromDetail(undefined, WED)).toBe('')
  })
})

describe('removeLaterWording (Decision 2)', () => {
  it('two choices when some were changed on their own', () => {
    expect(removeLaterWording(40, 2)).toEqual({
      message: 'Removes 40 later occurrences. 2 were changed on their own.',
      keep: 'Remove 40, keep the 2 changed on their own',
      removeAll: 'Remove all 42',
    })
  })

  it('singular forms', () => {
    expect(removeLaterWording(1, 1)).toEqual({
      message: 'Removes 1 later occurrence. 1 was changed on its own.',
      keep: 'Remove 1, keep the 1 changed on its own',
      removeAll: 'Remove all 2',
    })
  })

  it('a plain confirm otherwise', () => {
    expect(removeLaterWording(40, 0)).toEqual({ message: 'Removes 40 later occurrences.', keep: null, removeAll: 'Remove' })
  })
})
