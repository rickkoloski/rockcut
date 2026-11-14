// D56 §3.2: test results and retests. The check-off prompt's decisions
// (Pass / Fail, then Retest or Continue, then the move prompt) and the words
// the Gantt, the dialogs and the Brewery board show for a result.

import { dayLabel } from './gantt'
import type { SchedStep } from './production'
import type { TaskProduction, TestResult } from './types'

export type FailAction = 'retest' | 'continue'

/** What the person answered: Pass, or Fail with Retest in `days` or Continue. */
export type Outcome = { result: 'pass' } | { result: 'fail'; action: 'continue' } | { result: 'fail'; action: 'retest'; days: number }

/** The parts of a check-off (or change-result) preview the result prompt reads. */
export interface ResultPreview {
  needs_result?: boolean
  retest_days?: number | null
  /** Decision 15: false for a Brew day, Transfer, Split, Package or CIP (only Continue). */
  retest_allowed?: boolean
  retest_on?: string | null
}

/** The question to ask, or null when the step records no result. */
export interface ResultQuestion {
  retestAllowed: boolean
  /** The retest's default N (the step's `retest_days`). */
  days: number
}

export const RETEST_MIN = 1
export const RETEST_MAX = 30

/** Ask Pass / Fail only when the preview says the step needs a result. */
export function resultQuestion(pre: ResultPreview): ResultQuestion | null {
  if (!pre.needs_result) return null
  return { retestAllowed: !!pre.retest_allowed, days: pre.retest_days ?? 2 }
}

/** A change-result preview always asks (the step has a result), for the Fail question. */
export const failQuestion = (pre: ResultPreview): ResultQuestion => ({ retestAllowed: !!pre.retest_allowed, days: pre.retest_days ?? 2 })

/** The typed N as a whole number in 1–30, or null. */
export function retestDays(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= RETEST_MIN && n <= RETEST_MAX ? n : null
}

/** The request fields for an outcome (none without one). */
export function outcomeBody(o: Outcome | null | undefined): Record<string, string | number> {
  if (!o) return {}
  if (o.result === 'pass') return { result: 'pass' }
  if (o.action === 'continue') return { result: 'fail', fail_action: 'continue' }
  return { result: 'fail', fail_action: 'retest', retest_days: o.days }
}

/** A retest moves the steps after the test, so the move is previewed again with it. */
export const needsRepreview = (o: Outcome | null | undefined) => o?.result === 'fail' && o.action === 'retest'

/** The move prompt runs only when other steps would move. */
export const needsMovePrompt = (move: { following: unknown[] } | null | undefined) => !!move && move.following.length > 0

/** "Pass", "Fail · retest Wed Dec 16", "Fail · continued as planned" (nil without a result). */
export function resultWords(result: TestResult | null | undefined, retestOn: string | null | undefined): string | null {
  if (result === 'pass') return 'Pass'
  if (result === 'fail') return retestOn ? `Fail · retest ${dayLabel(retestOn)}` : 'Fail · continued as planned'
  return null
}

/** The retest a Fail added, from the batch's steps. */
export const retestOf = (step: Pick<SchedStep, 'id'>, steps: SchedStep[]) => steps.find((s) => s.retest_of_id === step.id) ?? null

/** A done test's result in the step and batch dialogs ("Fail · retest Wed Dec 16"). */
export const stepResultText = (step: SchedStep, steps: SchedStep[]) => resultWords(step.result, retestOf(step, steps)?.due_on)

/** The Brewery board's line: "✓ Pass", "✗ Fail · retest Wed Dec 16", "✗ Fail · continued as planned". */
export function taskResultText(p: Pick<TaskProduction, 'result' | 'retest_on'> | null | undefined): string | null {
  const words = resultWords(p?.result, p?.retest_on)
  return words && `${p!.result === 'pass' ? '✓' : '✗'} ${words}`
}

/** The Gantt dot's mark: ✓ for a Pass, ✗ for a Fail. */
export const resultMark = (result: TestResult | null | undefined) => (result === 'pass' ? '✓' : result === 'fail' ? '✗' : null)

/** The expanded rows' "· passed" / "· failed". */
export const resultSuffix = (result: TestResult | null | undefined) => (result === 'pass' ? ' · passed' : result === 'fail' ? ' · failed' : '')

/** A retest's dialog: "Retest of Diacetyl test (failed Mon Dec 14)". */
export function retestOfText(step: SchedStep, steps: SchedStep[]): string | null {
  if (step.retest_of_id == null) return null
  const test = steps.find((s) => s.id === step.retest_of_id)
  if (!test) return null
  return `Retest of ${test.name}${test.done_on ? ` (failed ${dayLabel(test.done_on)})` : ''}`
}

/** The snackbar's words for a check-off with a result: "Diacetyl test done · Fail · retest Wed Dec 16". */
export function outcomeWords(o: Outcome, retestOn: string | null | undefined): string {
  if (o.result === 'pass') return 'Pass'
  return resultWords('fail', o.action === 'retest' ? retestOn : null)!
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const daysWord = (days: number) => `${plural(Math.abs(days), 'day')} ${days > 0 ? 'later' : 'earlier'}`

/** The parts of a move preview the prompt's words read. */
export interface MoveWordsPreview {
  days: number
  moved: { name: string; new_due_on: string }[]
  following: unknown[]
}

/**
 * The move prompt's words. An ordinary move: "now <day>", "Move all
 * following steps 2 days later", "Move only Dry hop" and what the following
 * steps do. After a Fail with a retest (`retestOn`) the test itself doesn't
 * move, so the line names the retest's day and the answers say what happens
 * to the following steps.
 */
export function moveWords(preview: MoveWordsPreview, retestOn: string | null = null) {
  const n = preview.following.length
  if (retestOn)
    return {
      now: `retest ${dayLabel(retestOn)}`,
      all: `Move them with the retest, ${daysWord(preview.days)}`,
      only: 'Keep the following steps’ dates',
      onlyNote: null,
    }
  const first = preview.moved[0]
  return {
    now: `now ${dayLabel(first.new_due_on)}`,
    all: `Move all following steps ${daysWord(preview.days)}`,
    only: `Move only ${preview.moved.length === 1 ? first.name : plural(preview.moved.length, 'step')}`,
    onlyNote: `The ${plural(n, 'following step')} keep${n === 1 ? 's' : ''} ${n === 1 ? 'its date' : 'their dates'}.`,
  }
}
