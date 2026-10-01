import { useEffect } from 'react'
import useAuth from './useAuth'
import { DEVICE_TOKEN_KEY, TOKEN_KEY, UNPAIRED_KEY, readStorage } from '../lib/device'

const AUTH_KEYS: (string | null)[] = [TOKEN_KEY, DEVICE_TOKEN_KEY, UNPAIRED_KEY, null]

/**
 * Keep every tab of the app on the same session (DEV G3). When another tab
 * signs in, signs out, starts or ends "Sign in as me", or unpairs a tablet,
 * this tab's token no longer matches storage: reload from `/`, so nothing
 * from the previous session stays on screen or in memory.
 * (`storage` events fire only in the other tabs; `key` is null on clear().)
 */
export default function useAuthStorageSync() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!AUTH_KEYS.includes(e.key)) return
      if (readStorage(TOKEN_KEY) !== useAuth.getState().token) window.location.assign('/')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
}
