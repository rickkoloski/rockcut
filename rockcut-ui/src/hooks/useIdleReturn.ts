import { useEffect } from 'react'
import { PERSONAL_ACTIVITY_KEY, readStorage } from '../lib/device'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const
const TICK_MS = 5_000

/**
 * Call `onIdle` once `ms` of wall-clock time has passed without pointer, key,
 * touch or scroll activity (D33: a personal sign-in on a shared tablet returns
 * to the device session).
 *
 * Timers stop while a tablet sleeps, so this compares against a stored
 * wall-clock `lastActivity` (review item 3): on every tick, when the page
 * becomes visible or focused, and before counting any activity — a tap on a
 * tablet that slept past the limit returns instead of extending the session.
 * `lastActivity` is kept in localStorage so a page the browser discarded and
 * reloaded after a long sleep still returns. Does nothing while `enabled` is false.
 */
export default function useIdleReturn(enabled: boolean, ms: number, onIdle: () => void) {
  useEffect(() => {
    if (!enabled) return
    let done = false
    const stored = Number(readStorage(PERSONAL_ACTIVITY_KEY))
    let last = Number.isFinite(stored) && stored > 0 ? stored : Date.now()
    const save = () => {
      try {
        localStorage.setItem(PERSONAL_ACTIVITY_KEY, String(last))
      } catch {
        // Storage unavailable: the in-memory value still works while awake.
      }
    }
    save()

    const expired = () => Date.now() - last >= ms
    const fire = () => {
      if (done) return
      done = true
      onIdle()
    }
    const check = () => {
      if (expired()) fire()
    }
    const activity = () => {
      if (expired()) return fire()
      const now = Date.now()
      // Persist at most once a second; scrolling fires a lot.
      if (now - last >= 1000) {
        last = now
        save()
      } else {
        last = now
      }
    }
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') check()
    }

    check()
    const tick = window.setInterval(check, Math.min(TICK_MS, ms))
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    return () => {
      window.clearInterval(tick)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, activity, { capture: true }))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [enabled, ms, onIdle])
}
