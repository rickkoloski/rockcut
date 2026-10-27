// D47: the schedule flows' context (FlowsProvider in flows.tsx), apart so
// the provider's file exports components only.

import { createContext, useContext } from 'react'
import type { AxiosResponse } from 'axios'
import type { SchedStep } from '../../../lib/production'
import type { Result } from './flows'

export interface Flows {
  /** Run a write; on success refetch, show `message` (with renumbering) and Undo. */
  write: <T = Record<string, unknown>>(call: () => Promise<AxiosResponse>, message: string | ((data: T) => string)) => Promise<Result<T>>
  /** Move steps by `days` (the move prompt when steps follow). Null when cancelled. */
  moveSteps: (ids: number[], days: number) => Promise<Result | null>
  /** Check a step off on `doneOn` (the number prompt, then the move prompt). */
  checkOff: (step: StepRef, doneOn: string, batchLabel: string | null) => Promise<Result | null>
  uncheck: (step: StepRef) => Promise<Result>
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
