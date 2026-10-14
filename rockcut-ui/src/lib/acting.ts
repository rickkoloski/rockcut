// D40: "acting as" on a shared tablet's task board (plan decision 3, spec
// §3.4). After a correct staff code the tablet keeps the code **in memory**
// and sends it with each write until Done or ACTING_IDLE_MS without activity.
// The server keeps nothing: it checks the code (and the lockout) on every
// write. Never written to storage.

/** Idle time before the tablet forgets the code (Matt: 5 minutes). */
export const ACTING_IDLE_MS = 5 * 60 * 1000

export interface ActingSession {
  code: string
  /** The person, as the API's `recorded_as` names them. */
  name: string
  /** Wall-clock ms of the last activity (timers stop while a tablet sleeps). */
  lastActivity: number
}

export const startActing = (code: string, name: string, now: number): ActingSession => ({ code, name, lastActivity: now })

/** True once `idleMs` has passed since the last activity. */
export const actingExpired = (s: ActingSession, now: number, idleMs = ACTING_IDLE_MS) => now - s.lastActivity >= idleMs

/**
 * Activity: the session with `now` as its last activity, or null when it had
 * already expired (a tap after a long sleep doesn't revive it).
 */
export const touchActing = (s: ActingSession, now: number, idleMs = ACTING_IDLE_MS): ActingSession | null =>
  actingExpired(s, now, idleMs) ? null : { ...s, lastActivity: now }

export type StaffCodeFailure = 'staff_code_required' | 'staff_code_invalid' | 'staff_code_locked'

/** A write refused for its staff code (D37's errors), with the API's message; else null. */
export function staffCodeFailure(err: unknown): { error: StaffCodeFailure; message: string } | null {
  const data = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
  switch (data?.error) {
    case 'staff_code_required':
    case 'staff_code_invalid':
    case 'staff_code_locked':
      return { error: data.error, message: data.message ?? data.error }
    default:
      return null
  }
}

/** The person a tablet write was recorded as (`recorded_as` in an axios response), if any. */
export function recordedAs(res: unknown): string | null {
  const name = (res as { data?: { recorded_as?: unknown } })?.data?.recorded_as
  return typeof name === 'string' && name ? name : null
}

/** Thrown when the person cancels the staff-code dialog: the write never ran. */
export class ActingCancelled extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'ActingCancelled'
  }
}

export const isActingCancelled = (err: unknown) => err instanceof ActingCancelled

/** A write's JSON body with the code added (people send none). */
export const withCode = <T extends object>(body: T | undefined, code: string | undefined) =>
  code ? { ...(body ?? {}), staff_code: code } : body

/** A DELETE's axios config with the code as a query param. */
export const deleteWithCode = (params: Record<string, unknown> | undefined, code: string | undefined) => {
  const all = code ? { ...(params ?? {}), staff_code: code } : params
  return all ? { params: all } : undefined
}
