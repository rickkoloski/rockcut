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
    const storedActivity = () => {
      const v = Number(readStorage(PERSONAL_ACTIVITY_KEY))
      return Number.isFinite(v) && v > 0 ? v : 0
    }
    let last = storedActivity() || Date.now()
    let lastSaved = 0
    const save = () => {
      lastSaved = last
      try {
        localStorage.setItem(PERSONAL_ACTIVITY_KEY, String(last))
      } catch {
        // Storage unavailable: the in-memory value still works while awake.
      }
    }
    save()

    // D36-G (task 4050): activity in another tab counts too. Every tab writes
    // the shared value, so take the newest before deciding we're idle.
    const expired = () => {
      last = Math.max(last, storedActivity())
      return Date.now() - last >= ms
    }
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
      // Persist at most once a second (scrolling fires a lot), but keep
      // persisting during continuous activity so other tabs see it.
      last = Date.now()
      if (last - lastSaved >= 1000) save()
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
