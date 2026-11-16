// D47: the schedule flows' context (FlowsProvider in flows.tsx), apart so
// the provider's file exports components only.

import { createContext, useContext } from 'react'
import type { AxiosResponse } from 'axios'
import type { SchedStep } from '../../../lib/production'
import type { CodedApi } from '../../../lib/codedApi'
import type { Result } from './flows'

export interface Flows {
  /**
   * Run a write; on success refetch, show `message` (with renumbering) and Undo.
   * `call` makes the request through `a` (D50: the device's staff code goes in
   * its body; a cancelled code dialog is a Failure with code `cancelled`).
   */
  write: <T = Record<string, unknown>>(call: (a: CodedApi) => Promise<AxiosResponse>, message: string | ((data: T) => string)) => Promise<Result<T>>
  /** Move steps by `days` (the move prompt when steps follow). Null when cancelled. */
  moveSteps: (ids: number[], days: number) => Promise<Result | null>
  /** Check a step off on `doneOn` (the number prompt, then the move prompt). */
  checkOff: (step: StepRef, doneOn: string, batchLabel: string | null) => Promise<Result | null>
  /** Mark not done; `retestOn` (a failed test's retest) asks first, as the retest goes too (D56). Null when cancelled. */
  uncheck: (step: StepRef, retestOn?: string | null) => Promise<Result | null>
  /** D56 §3.2 Change: a done test's result to Pass or Fail (Fail asks Retest or Continue). Null when cancelled. */
  changeResult: (step: StepRef, to: 'pass' | 'fail') => Promise<Result | null>
  /** Show a message with no Undo. */
  notify: (message: string) => void
  /** A write made elsewhere (the out-of-service dialog): refetch and offer its Undo. */
  saved: (message: string, token: string | null) => Promise<void>
}

/** What a check-off needs of a step: the Gantt's, or a linked board task's (D49). */
export type StepRef = Pick<SchedStep, 'id' | 'name' | 'batch_id'>

export const FlowsContext = createContext<Flows | null>(null)

export function useFlows(): Flows {
  const flows = useContext(FlowsContext)
  if (!flows) throw new Error('useFlows outside FlowsProvider')
  return flows
}
