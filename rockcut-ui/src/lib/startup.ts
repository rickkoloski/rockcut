/** D58 §3.10 (5205): how long start-up waits on `/api/me` before saying it's still connecting. */
export const SLOW_START_MS = 4_000

/** Calls `onSlow` once after `ms`, unless the returned cancel runs first. */
export function watchSlowStart(onSlow: () => void, ms = SLOW_START_MS): () => void {
  const timer = setTimeout(onSlow, ms)
  return () => clearTimeout(timer)
}

/**
 * What the start-up loading screen adds under its spinner: the existing
 * "Can't reach the server" banner after a failure or timeout, else "Still
 * connecting…" once start-up has been slow, else nothing.
 */
export function loadingNotice(slow: boolean, unreachable: boolean): 'unreachable' | 'slow' | null {
  if (unreachable) return 'unreachable'
  return slow ? 'slow' : null
}
