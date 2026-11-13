import { describe, expect, it } from 'vitest'
import type { SchedStep } from './production'
import {
  failQuestion,
  needsMovePrompt,
  needsRepreview,
  outcomeBody,
  outcomeWords,
  resultMark,
  resultQuestion,
  resultSuffix,
  retestDays,
  retestOfText,
  stepResultText,
  taskResultText,
  type Outcome,
} from './testResults'

const step = (s: Partial<SchedStep>): SchedStep =>
  ({
    id: 1,
    batch_id: 1,
    name: 'Diacetyl test',
    due_on: '2026-12-14',
    done_on: null,
    has_result: true,
    result: null,
    retest_days: 2,
    retest_of_id: null,
    ...s,
  }) as SchedStep

describe('the check-off prompt (D56 §3.2)', () => {
  it('asks Pass / Fail only when the preview needs a result', () => {
    expect(resultQuestion({ needs_result: false, retest_days: null, retest_allowed: false })).toBeNull()
    expect(resultQuestion({})).toBeNull()
    expect(resultQuestion({ needs_result: true, retest_days: 3, retest_allowed: true })).toEqual({ retestAllowed: true, days: 3 })
  })

  it('offers only Continue where a retest can’t go (decision 15)', () => {
    expect(resultQuestion({ needs_result: true, retest_days: 2, retest_allowed: false })).toEqual({ retestAllowed: false, days: 2 })
    expect(failQuestion({ retest_days: 4 })).toEqual({ retestAllowed: false, days: 4 })
  })

  it('reads N as a whole number of days, 1 to 30', () => {
    expect(retestDays('2')).toBe(2)
    expect(retestDays(' 30 ')).toBe(30)
    for (const bad of ['0', '31', '', '1.5', '-1', 'x']) expect(retestDays(bad)).toBeNull()
  })

  it('sends the answers the API takes', () => {
    expect(outcomeBody(null)).toEqual({})
    expect(outcomeBody({ result: 'pass' })).toEqual({ result: 'pass' })
    expect(outcomeBody({ result: 'fail', action: 'continue' })).toEqual({ result: 'fail', fail_action: 'continue' })
    expect(outcomeBody({ result: 'fail', action: 'retest', days: 3 })).toEqual({ result: 'fail', fail_action: 'retest', retest_days: 3 })
  })

  it('previews the move again only for a retest, and asks only when steps follow', () => {
    const outcomes: [Outcome | null, boolean][] = [
      [null, false],
      [{ result: 'pass' }, false],
      [{ result: 'fail', action: 'continue' }, false],
      [{ result: 'fail', action: 'retest', days: 2 }, true],
    ]
    for (const [o, again] of outcomes) expect(needsRepreview(o)).toBe(again)
    expect(needsMovePrompt(null)).toBe(false)
    expect(needsMovePrompt({ following: [] })).toBe(false)
    expect(needsMovePrompt({ following: [{ id: 2 }] })).toBe(true)
  })
})

describe('result words', () => {
  const test = step({ id: 1, done_on: '2026-12-14', result: 'fail' })
  const retest = step({ id: 2, name: 'Diacetyl test - retest', due_on: '2026-12-16', retest_of_id: 1 })

  it('words a done test in the dialogs', () => {
    expect(stepResultText(test, [test, retest])).toBe('Fail · retest Wed Dec 16')
    expect(stepResultText(test, [test])).toBe('Fail · continued as planned')
    expect(stepResultText(step({ result: 'pass' }), [])).toBe('Pass')
    expect(stepResultText(step({ result: null }), [])).toBeNull()
  })

  it('words the Brewery board task (decision 14)', () => {
    expect(taskResultText({ result: 'pass', retest_on: null })).toBe('✓ Pass')
    expect(taskResultText({ result: 'fail', retest_on: '2026-12-16' })).toBe('✗ Fail · retest Wed Dec 16')
    expect(taskResultText({ result: 'fail', retest_on: null })).toBe('✗ Fail · continued as planned')
    expect(taskResultText({ result: null })).toBeNull()
    expect(taskResultText(null)).toBeNull()
  })

  it('says what a retest retests', () => {
    expect(retestOfText(retest, [test, retest])).toBe('Retest of Diacetyl test (failed Mon Dec 14)')
    expect(retestOfText(test, [test, retest])).toBeNull()
  })

  it('marks the Gantt', () => {
    expect([resultMark('pass'), resultMark('fail'), resultMark(null)]).toEqual(['✓', '✗', null])
    expect([resultSuffix('pass'), resultSuffix('fail'), resultSuffix(null)]).toEqual([' · passed', ' · failed', ''])
  })

  it('words the snackbar', () => {
    expect(outcomeWords({ result: 'pass' }, null)).toBe('Pass')
    expect(outcomeWords({ result: 'fail', action: 'continue' }, null)).toBe('Fail · continued as planned')
    expect(outcomeWords({ result: 'fail', action: 'retest', days: 2 }, '2026-12-16')).toBe('Fail · retest Wed Dec 16')
  })
})
