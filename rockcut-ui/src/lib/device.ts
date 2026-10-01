// Shared tablets (D33). A paired tablet signs in with a `dev_` token stored in
// the normal `rockcut_token` slot. When a staff member signs in personally on
// the tablet, the device token is set aside under DEVICE_TOKEN_KEY and put
// back when they sign out or after PERSONAL_IDLE_MS without activity.

export const TOKEN_KEY = 'rockcut_token'
export const DEVICE_TOKEN_KEY = 'rockcut_device_token'
/** Wall-clock time (ms) of the last activity during a personal sign-in on a tablet. */
export const PERSONAL_ACTIVITY_KEY = 'rockcut_personal_last_activity'

/** Set when a tablet's pairing ended (revoked, deactivated): the login screen opens on setup (DEV G7). */
export const UNPAIRED_KEY = 'rockcut_device_unpaired'

/** Idle time before a personal sign-in on a tablet returns to the device session (spec Q1: 5 minutes). */
export const PERSONAL_IDLE_MS = 5 * 60 * 1000

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** The device token set aside during a personal sign-in, if any. */
export function asideDeviceToken(): string | null {
  return readStorage(DEVICE_TOKEN_KEY)
}

/** Move the current (device) token aside so a person can sign in. */
export function setDeviceTokenAside(): void {
  const token = readStorage(TOKEN_KEY)
  if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(PERSONAL_ACTIVITY_KEY)
  localStorage.removeItem('rockcut_email')
}

/**
 * Drop the personal token and put the device token back. Returns false when
 * there was no device token to restore. Callers reload the page so no
 * personal data stays in memory.
 */
export function restoreDeviceToken(): boolean {
  const device = asideDeviceToken()
  if (!device) return false
  localStorage.setItem(TOKEN_KEY, device)
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(PERSONAL_ACTIVITY_KEY)
  localStorage.removeItem('rockcut_email')
  return true
}

/** True for a shared tablet's token (D33 tokens start with `dev_`). */
export function isDeviceToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith('dev_')
}

/**
 * Forget a tablet whose pairing ended and remember why, so the login screen
 * opens on "Set up as a shared device" with an explanation (DEV G7).
 */
export function markUnpaired(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(PERSONAL_ACTIVITY_KEY)
  localStorage.removeItem('rockcut_email')
  localStorage.setItem(UNPAIRED_KEY, '1')
}

export function clearUnpaired(): void {
  localStorage.removeItem(UNPAIRED_KEY)
}

