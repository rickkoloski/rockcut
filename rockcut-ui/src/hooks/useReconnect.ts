import { useEffect } from 'react'

const RETRY_MS = 10_000

/**
 * While the server can't be reached at start-up (DEV pass 1 G1), call `retry`
 * every 10 s and as soon as the browser reports it's back online. Does
 * nothing while `enabled` is false.
 */
export default function useReconnect(enabled: boolean, retry: () => void) {
  useEffect(() => {
    if (!enabled) return
    const tick = window.setInterval(retry, RETRY_MS)
    window.addEventListener('online', retry)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('online', retry)
    }
  }, [enabled, retry])
}
