import { useEffect } from 'react'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const

/**
 * Call `onIdle` after `ms` without pointer, key, touch or scroll activity
 * (D33: a personal sign-in on a shared tablet returns to the device session).
 * Does nothing while `enabled` is false.
 */
export default function useIdleReturn(enabled: boolean, ms: number, onIdle: () => void) {
  useEffect(() => {
    if (!enabled) return
    let timer = window.setTimeout(onIdle, ms)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(onIdle, ms)
    }
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true, capture: true }))
    return () => {
      window.clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset, { capture: true }))
    }
  }, [enabled, ms, onIdle])
}
