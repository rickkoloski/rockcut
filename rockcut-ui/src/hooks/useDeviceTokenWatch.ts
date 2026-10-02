import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import { asideDeviceToken, markUnpaired } from '../lib/device'

const WATCH_MS = 20_000

/**
 * While a person is signed in on a shared tablet (DEV G2), keep checking the
 * tablet's own token, which is set aside and so isn't sent with their
 * requests. If a manager revoked the tablet or deactivated its device, end
 * the personal session at once and show the setup screen: "every tablet is
 * signed out on its next request" (spec S12) includes one with a person on it.
 *
 * Checked on start, on every navigation, when the page becomes visible or
 * focused, and every 20 s. Only a 401 ends the session; a network error or
 * other status is ignored until the next check.
 */
export default function useDeviceTokenWatch(enabled: boolean) {
  const location = useLocation()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const check = async () => {
      const token = asideDeviceToken()
      if (!token) return
      try {
        // Plain axios: the app's client would send the person's token instead
        // and treat a 401 as theirs.
        await axios.get(`${import.meta.env.VITE_API_URL || ''}/api/session`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (!cancelled && status === 401 && asideDeviceToken() === token) {
          markUnpaired()
          window.location.assign('/')
        }
      }
    }

    check()
    const tick = window.setInterval(check, WATCH_MS)
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [enabled, location.pathname])
}
