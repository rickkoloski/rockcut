import { useEffect } from 'react'

const RETRY_MS = 10_000

/**
 * While the server can't be reached at start-up (DEV pass 1 G1), call `retry`
 * every 10 s and as soon as the browser reports it's back online. Does
 * nothing while `enabled` is false.
 */
export default function useReconnect(enabled: boolean, retry: (opts?: { force?: boolean }) => void) {
  useEffect(() => {
    if (!enabled) return
    const tick = window.setInterval(() => retry(), RETRY_MS)
    // Back online: don't wait for a check stuck on the old connection (DEV pass 3 G1).
    const onOnline = () => retry({ force: true })
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled, retry])
}
